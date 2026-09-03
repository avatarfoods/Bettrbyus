-- HR day types: why someone is off.
--
-- OFF on its own says nothing. PTO, a paid holiday, an unpaid holiday, a
-- furlough, a sick day are all OFF, and the difference matters to the person
-- and to the cost. The list is Carlos's to change; these are the starting
-- five. A paid day type adds its hours at the person's rate, without overtime.
--
-- Safe to run again from the top. Dash comments only.

create table if not exists public.hr_absence_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null,
  paid boolean not null default false,
  paid_hours numeric not null default 8,
  color text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_shifts add column if not exists absence_type_id uuid references public.hr_absence_types (id) on delete set null;

insert into public.hr_absence_types (name, code, paid, paid_hours, color, sort_order)
select 'PTO', 'PTO', true, 8, 'green', 1
where not exists (select 1 from public.hr_absence_types where name = 'PTO');

insert into public.hr_absence_types (name, code, paid, paid_hours, color, sort_order)
select 'Holiday, paid', 'HOL', true, 8, 'blue', 2
where not exists (select 1 from public.hr_absence_types where name = 'Holiday, paid');

insert into public.hr_absence_types (name, code, paid, paid_hours, color, sort_order)
select 'Holiday, unpaid', 'HOL-U', false, 0, 'slate', 3
where not exists (select 1 from public.hr_absence_types where name = 'Holiday, unpaid');

insert into public.hr_absence_types (name, code, paid, paid_hours, color, sort_order)
select 'Furlough', 'FUR', false, 0, 'amber', 4
where not exists (select 1 from public.hr_absence_types where name = 'Furlough');

insert into public.hr_absence_types (name, code, paid, paid_hours, color, sort_order)
select 'Sick', 'SICK', false, 0, 'red', 5
where not exists (select 1 from public.hr_absence_types where name = 'Sick');

alter table public.hr_absence_types enable row level security;

drop policy if exists "Authenticated can read hr_absence_types" on public.hr_absence_types;
create policy "Authenticated can read hr_absence_types" on public.hr_absence_types
  for select to authenticated using (true);

drop policy if exists "Admins write hr_absence_types" on public.hr_absence_types;
create policy "Admins write hr_absence_types" on public.hr_absence_types
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));
