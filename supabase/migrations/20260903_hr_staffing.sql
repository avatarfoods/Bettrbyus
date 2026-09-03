-- HR staffing: the headcount sheet, per department.
--
-- How many people a department is supposed to have, so the dashboard can say
-- how many are missing against the active count from Paychex. Plus the hours
-- the department usually runs, drawn as a bar, and who checks its timecards.
--
-- Safe to run again from the top. Dash comments only.

alter table public.hr_departments add column if not exists required_headcount integer not null default 0;
alter table public.hr_departments add column if not exists usual_start time;
alter table public.hr_departments add column if not exists usual_end time;
alter table public.hr_departments add column if not exists timecard_check text;
