-- HR admins: a login whose HR level is Administrator may write every HR
-- configuration table, not only departments and people.
--
-- The first migrations let only System administrators write groups, approval
-- chains, day types and pay rules. The pages already show Edit to HR
-- administrators, so without this every save of theirs fails at the database.
-- Who may change HR access itself stays with System administrators.
--
-- Safe to run again from the top. Dash comments only.

drop policy if exists "HR admins write hr_groups" on public.hr_groups;
create policy "HR admins write hr_groups" on public.hr_groups
  for all to authenticated
  using (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'))
  with check (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'));

drop policy if exists "HR admins write hr_group_departments" on public.hr_group_departments;
create policy "HR admins write hr_group_departments" on public.hr_group_departments
  for all to authenticated
  using (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'))
  with check (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'));

drop policy if exists "HR admins write hr_group_members" on public.hr_group_members;
create policy "HR admins write hr_group_members" on public.hr_group_members
  for all to authenticated
  using (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'))
  with check (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'));

drop policy if exists "HR admins write hr_approval_steps" on public.hr_approval_steps;
create policy "HR admins write hr_approval_steps" on public.hr_approval_steps
  for all to authenticated
  using (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'))
  with check (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'));

drop policy if exists "HR admins write hr_absence_types" on public.hr_absence_types;
create policy "HR admins write hr_absence_types" on public.hr_absence_types
  for all to authenticated
  using (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'))
  with check (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'));

drop policy if exists "HR admins write hr_pay_settings" on public.hr_pay_settings;
create policy "HR admins write hr_pay_settings" on public.hr_pay_settings
  for all to authenticated
  using (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'))
  with check (exists (select 1 from public.hr_user_access a where a.profile_id = auth.uid() and a.level = 'admin'));
