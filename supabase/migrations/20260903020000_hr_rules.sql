-- HR rules: the second migration, after Carlos reviewed the first build and
-- the real Paychex export.
--
-- Adds what the review asked for: the line a department belongs to and its
-- daily break, the extra Paychex columns worth keeping, groups that decide who
-- sees which departments, an approval chain per department, and floating
-- people who work a day in another department.
--
-- Safe to run again from the top. Dash comments only - the Supabase editor
-- splits on semicolons and breaks block comments.

-- Departments: line (Bettr Bowl, Pizza, Warehouse...) taken from the Paychex
-- code prefix, and unpaid break hours per day deducted from every shift.
alter table public.hr_departments add column if not exists line text;
alter table public.hr_departments add column if not exists break_hours numeric not null default 0;

-- People: the rest of what Paychex knows that the schedule can use.
-- employee_type is employee or contractor; contractors never appear.
-- show_on_schedule is the manual off switch, separate from active which the
-- import controls.
alter table public.hr_employees add column if not exists preferred_name text;
alter table public.hr_employees add column if not exists personal_email text;
alter table public.hr_employees add column if not exists employee_type text not null default 'employee';
alter table public.hr_employees add column if not exists full_time boolean not null default true;
alter table public.hr_employees add column if not exists paychex_supervisor_id text;
alter table public.hr_employees add column if not exists show_on_schedule boolean not null default true;

-- Pay rules as confirmed: weekly overtime only, no workers' comp.
update public.hr_pay_settings set daily_overtime_enabled = false, workers_comp_pct = 0 where id = true;

-- Shifts: a float is a person working a day in a department that is not their
-- own. It waits for approval and shows a question mark until it has it.
alter table public.hr_shifts add column if not exists is_float boolean not null default false;
alter table public.hr_shifts add column if not exists float_approved_by uuid references public.profiles (id);
alter table public.hr_shifts add column if not exists float_approved_at timestamptz;

-- Groups: who sees what. A group either sees every department or the ones
-- listed for it, plus each member's own department always. sees_cost decides
-- whether the money shows.
create table if not exists public.hr_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sees_all_departments boolean not null default false,
  sees_cost boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_group_departments (
  group_id uuid not null references public.hr_groups (id) on delete cascade,
  department_id uuid not null references public.hr_departments (id) on delete cascade,
  primary key (group_id, department_id)
);

create table if not exists public.hr_group_members (
  group_id uuid not null references public.hr_groups (id) on delete cascade,
  employee_id uuid not null references public.hr_employees (id) on delete cascade,
  primary key (group_id, employee_id)
);

-- Approval chain: for each department, who approves and in what order. A week
-- is approved when every step has signed. An administrator may sign any step.
create table if not exists public.hr_approval_steps (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.hr_departments (id) on delete cascade,
  step integer not null,
  employee_id uuid not null references public.hr_employees (id) on delete cascade,
  constraint hr_approval_steps_one_per_step unique (department_id, step)
);

-- Which steps a given schedule has collected.
create table if not exists public.hr_schedule_approvals (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.hr_schedules (id) on delete cascade,
  step integer not null,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz not null default now(),
  constraint hr_schedule_approvals_one_per_step unique (schedule_id, step)
);

alter table public.hr_groups enable row level security;
alter table public.hr_group_departments enable row level security;
alter table public.hr_group_members enable row level security;
alter table public.hr_approval_steps enable row level security;
alter table public.hr_schedule_approvals enable row level security;

drop policy if exists "Authenticated can read hr_groups" on public.hr_groups;
create policy "Authenticated can read hr_groups" on public.hr_groups
  for select to authenticated using (true);

drop policy if exists "Authenticated can read hr_group_departments" on public.hr_group_departments;
create policy "Authenticated can read hr_group_departments" on public.hr_group_departments
  for select to authenticated using (true);

drop policy if exists "Authenticated can read hr_group_members" on public.hr_group_members;
create policy "Authenticated can read hr_group_members" on public.hr_group_members
  for select to authenticated using (true);

drop policy if exists "Authenticated can read hr_approval_steps" on public.hr_approval_steps;
create policy "Authenticated can read hr_approval_steps" on public.hr_approval_steps
  for select to authenticated using (true);

drop policy if exists "Authenticated can read hr_schedule_approvals" on public.hr_schedule_approvals;
create policy "Authenticated can read hr_schedule_approvals" on public.hr_schedule_approvals
  for select to authenticated using (true);

drop policy if exists "Admins write hr_groups" on public.hr_groups;
create policy "Admins write hr_groups" on public.hr_groups
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

drop policy if exists "Admins write hr_group_departments" on public.hr_group_departments;
create policy "Admins write hr_group_departments" on public.hr_group_departments
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

drop policy if exists "Admins write hr_group_members" on public.hr_group_members;
create policy "Admins write hr_group_members" on public.hr_group_members
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

drop policy if exists "Admins write hr_approval_steps" on public.hr_approval_steps;
create policy "Admins write hr_approval_steps" on public.hr_approval_steps
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

-- Who may sign is decided in the application, where it can be explained.
drop policy if exists "Authenticated write hr_schedule_approvals" on public.hr_schedule_approvals;
create policy "Authenticated write hr_schedule_approvals" on public.hr_schedule_approvals
  for all to authenticated using (true) with check (true);

-- Salaried people: paid the whole week if any day is worked (the default), or
-- per day worked as a fraction of the weekly rate.
alter table public.hr_pay_settings add column if not exists salary_rule text not null default 'week_if_any';
alter table public.hr_pay_settings add column if not exists salary_days_per_week numeric not null default 5;

-- HR access per login, the way Odoo does it: none, user, or administrator of
-- this one app. Bettrbyus administrators are HR administrators regardless.
-- A login with no row is a user.
create table if not exists public.hr_user_access (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  level text not null default 'user',
  updated_at timestamptz not null default now(),
  constraint hr_user_access_level_check check (level in ('none', 'user', 'admin'))
);

alter table public.hr_user_access enable row level security;

drop policy if exists "Authenticated can read hr_user_access" on public.hr_user_access;
create policy "Authenticated can read hr_user_access" on public.hr_user_access
  for select to authenticated using (true);

drop policy if exists "Admins write hr_user_access" on public.hr_user_access;
create policy "Admins write hr_user_access" on public.hr_user_access
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));
