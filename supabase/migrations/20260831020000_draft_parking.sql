-- Saving a draft parks it: it stays open and listed, but stops being the one
-- the grid overlays, so the plan can be cleared and a new draft started.
--
-- This ran on the hosted project through PENDING_MIGRATIONS.sql before it had
-- a file of its own; the file exists so a database built from this directory
-- ends up with the same columns.

alter table public.production_schedules
  add column if not exists is_working boolean not null default true;

-- Only the WORKING draft is unique per person. Parked drafts accumulate.
drop index if exists production_schedules_one_open_draft_idx;

create unique index if not exists production_schedules_one_working_draft_idx
  on public.production_schedules (parent_schedule_id, created_by)
  where status = 'draft' and is_working;
