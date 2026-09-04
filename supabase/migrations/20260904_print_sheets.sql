-- 20260904_print_sheets
-- What "Print all" on Print for the floor prints, per department and in what
-- order. Finished Product gets the batch record, the product release and the
-- production report; a kitchen gets the batch record and the report. Set once
-- under Configuration > Planning > Print sheets. Re-runnable.

alter table public.app_settings
  add column if not exists print_plan jsonb not null default '{}'::jsonb;

-- The earlier, department-less version of this setting. Kept so a database
-- that already has it is not disturbed; nothing reads it any more.
alter table public.app_settings
  add column if not exists print_sheets text[] not null
    default array['release', 'batch', 'report'];
