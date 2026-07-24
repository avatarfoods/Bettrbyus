-- Allow authenticated users to read departments (needed for inventory UI joins and dropdowns).

alter table public.departments enable row level security;

drop policy if exists "Authenticated users can read departments" on public.departments;

create policy "Authenticated users can read departments"
  on public.departments
  for select
  to authenticated
  using (true);
