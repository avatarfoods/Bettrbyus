-- HR: who works here, where, and when.
--
-- Replaces the shift workbook - one row per person, START/END per day, OFF as
-- the default - for 150 people across twenty departments. Three ideas hold it
-- together:
--
-- 1. People and departments come from Paychex and are not retyped. The import
--    keys on Paychex's own employee id so a re-import updates rather than
--    duplicates, and the department list is whatever Paychex says it is.
--
-- 2. A schedule is one department's week. A supervisor drafts it, somebody
--    approves it, and the approved one is what gets printed and sent. Exactly
--    one live schedule per department per week - enforced by the database.
--
-- 3. A shift is a row because absence is data. OFF is not "no row": it is a
--    shift with no times, which is what lets a printed week show every person
--    every day and lets the cost model know the week has been considered.
--
-- Safe to run again from the top: every statement checks before it creates.

-- Departments. paychex_code is Paychex's own code when it has one. color is a
-- key from lib/production/department-colors, null meaning automatic.
-- supervisor_id is who signs off this department's week; null means any
-- administrator. The foreign key to hr_employees is added further down, once
-- that table exists.
create table if not exists public.hr_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  paychex_code text,
  color text,
  supervisor_id uuid,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- People. paychex_id is the identity a re-import matches on.
-- pay_type: hourly is paid for hours worked and overtime applies; salary is
-- paid the week if any day of it is worked and overtime does not apply.
-- pay_rate is per hour for hourly, per week for salary.
-- imported_at is which Paychex export this row last came from.
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  paychex_id text not null unique,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  department_id uuid references public.hr_departments (id) on delete set null,
  pay_type text not null default 'hourly',
  pay_rate numeric,
  is_supervisor boolean not null default false,
  hired_on date,
  active boolean not null default true,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_employees_pay_type_check check (pay_type in ('hourly', 'salary'))
);

create index if not exists hr_employees_department_idx
  on public.hr_employees (department_id, active);

-- Departments point at an employee and employees at a department, so this
-- link goes in after both tables exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hr_departments_supervisor_fkey'
  ) then
    alter table public.hr_departments
      add constraint hr_departments_supervisor_fkey
      foreign key (supervisor_id) references public.hr_employees (id) on delete set null;
  end if;
end
$$;

-- One department's week. week_start is always a Monday.
-- status: draft - the supervisor is working on it; approved - signed off, the
-- one that prints and sends; archived - replaced by a later approved version,
-- kept as the record. sent_at is set when the approved week was emailed out.
create table if not exists public.hr_schedules (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.hr_departments (id) on delete cascade,
  week_start date not null,
  status text not null default 'draft',
  name text,
  created_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_schedules_status_check check (status in ('draft', 'approved', 'archived'))
);

create index if not exists hr_schedules_week_idx
  on public.hr_schedules (department_id, week_start, status);

-- One approved schedule per department per week. Two would mean two truths.
create unique index if not exists hr_schedules_one_approved_idx
  on public.hr_schedules (department_id, week_start)
  where status = 'approved';

-- One person, one day. Null start and end together mean OFF; one without the
-- other is rejected. break_minutes are unpaid, e.g. a 30 minute lunch.
create table if not exists public.hr_shifts (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.hr_schedules (id) on delete cascade,
  employee_id uuid not null references public.hr_employees (id) on delete cascade,
  work_date date not null,
  start_time time,
  end_time time,
  break_minutes integer not null default 0,
  note text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint hr_shifts_one_per_day unique (schedule_id, employee_id, work_date),
  constraint hr_shifts_break_check check (break_minutes >= 0),
  constraint hr_shifts_both_times_check check ((start_time is null) = (end_time is null))
);

create index if not exists hr_shifts_schedule_idx
  on public.hr_shifts (schedule_id, work_date);

-- What a week costs, and the rules that decide it. One row.
-- Rates are the employer's side - what the company pays on top of wages.
-- weekly_overtime_after: hours in the week before overtime.
-- daily_overtime_*: Nevada's over-8-in-a-day rule, applied only to hourly
--   people earning under daily_overtime_rate_ceiling (1.5 x minimum wage).
-- fica_pct: employer Social Security 6.2 + Medicare 1.45.
-- state_pct: Nevada Modified Business Tax. workers_comp_pct: your policy rate.
create table if not exists public.hr_pay_settings (
  id boolean primary key default true,
  weekly_overtime_after numeric not null default 40,
  daily_overtime_after numeric not null default 8,
  daily_overtime_enabled boolean not null default true,
  daily_overtime_rate_ceiling numeric not null default 18,
  overtime_multiplier numeric not null default 1.5,
  fica_pct numeric not null default 7.65,
  futa_pct numeric not null default 0.6,
  state_pct numeric not null default 1.17,
  workers_comp_pct numeric not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint hr_pay_settings_singleton check (id = true)
);

insert into public.hr_pay_settings (id) values (true) on conflict (id) do nothing;

-- Row level security: anyone signed in reads; anyone signed in drafts
-- schedules and shifts; administrators change people, departments and pay
-- rules. Who may approve is decided in the application.
alter table public.hr_departments enable row level security;
alter table public.hr_employees enable row level security;
alter table public.hr_schedules enable row level security;
alter table public.hr_shifts enable row level security;
alter table public.hr_pay_settings enable row level security;

drop policy if exists "Authenticated can read hr_departments" on public.hr_departments;
create policy "Authenticated can read hr_departments" on public.hr_departments
  for select to authenticated using (true);

drop policy if exists "Authenticated can read hr_employees" on public.hr_employees;
create policy "Authenticated can read hr_employees" on public.hr_employees
  for select to authenticated using (true);

drop policy if exists "Authenticated can read hr_schedules" on public.hr_schedules;
create policy "Authenticated can read hr_schedules" on public.hr_schedules
  for select to authenticated using (true);

drop policy if exists "Authenticated can read hr_shifts" on public.hr_shifts;
create policy "Authenticated can read hr_shifts" on public.hr_shifts
  for select to authenticated using (true);

drop policy if exists "Authenticated can read hr_pay_settings" on public.hr_pay_settings;
create policy "Authenticated can read hr_pay_settings" on public.hr_pay_settings
  for select to authenticated using (true);

drop policy if exists "Admins write hr_departments" on public.hr_departments;
create policy "Admins write hr_departments" on public.hr_departments
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

drop policy if exists "Admins write hr_employees" on public.hr_employees;
create policy "Admins write hr_employees" on public.hr_employees
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

drop policy if exists "Admins write hr_pay_settings" on public.hr_pay_settings;
create policy "Admins write hr_pay_settings" on public.hr_pay_settings
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

drop policy if exists "Authenticated write hr_schedules" on public.hr_schedules;
create policy "Authenticated write hr_schedules" on public.hr_schedules
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated write hr_shifts" on public.hr_shifts;
create policy "Authenticated write hr_shifts" on public.hr_shifts
  for all to authenticated using (true) with check (true);
