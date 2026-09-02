-- Departments carry their own colour on the plan, chosen in Settings.
--
-- This ran on the hosted project through PENDING_MIGRATIONS.sql before it had
-- a file of its own; the file exists so a database built from this directory
-- ends up with the same columns.

alter table public.production_departments
  add column if not exists color text;
