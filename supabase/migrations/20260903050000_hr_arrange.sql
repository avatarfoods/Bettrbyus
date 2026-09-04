-- HR arrange: the order people sit in on a department's schedule, and HR
-- administrators allowed to write departments and people.
--
-- Departments already have sort_order; dragging rows on the dashboard writes
-- it. People get one too, per department, so a supervisor's grid can be laid
-- out the way the floor is laid out. Null means "after the ordered ones, by
-- last name".
--
-- The first migration let only System administrators write hr_departments and
-- hr_employees. Staffing, the department order and the row order are HR
-- administrator jobs, so an HR administrator (hr_user_access.level = 'admin')
-- may write those two tables as well. The server actions still decide who
-- may do what.
--
-- Safe to run again from the top. Dash comments only.

alter table public.hr_employees add column if not exists sort_order integer;

drop policy if exists "HR admins write hr_departments" on public.hr_departments;
create policy "HR admins write hr_departments" on public.hr_departments
  for all to authenticated
  using (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'))
  with check (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'));

drop policy if exists "HR admins write hr_employees" on public.hr_employees;
create policy "HR admins write hr_employees" on public.hr_employees
  for all to authenticated
  using (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'))
  with check (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'));
