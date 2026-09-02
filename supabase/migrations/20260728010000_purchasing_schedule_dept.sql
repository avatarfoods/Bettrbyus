-- Store PRODUCTION SCHEDULE department + recipe name on each entry
-- so View Plan can show Finished / Kitchen AM as Excel does (not via recipe join).

alter table public.purchasing_schedule_entries
  add column if not exists department text;

alter table public.purchasing_schedule_entries
  add column if not exists recipe_name text;

create index if not exists purchasing_schedule_entries_dept_idx
  on public.purchasing_schedule_entries (import_id, department);
