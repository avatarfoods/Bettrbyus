-- Inventory checks, removed.
--
-- The app was never adopted - production, planning and WIP cover what the
-- plant actually needs, and a second place to count things was a second place
-- for the answer to be wrong. The pages and code are gone; this takes the
-- tables with them so nothing is left half-present.
--
-- `departments` goes too: nothing else ever read it. Production has its own
-- production_departments, which is unrelated and stays.

drop table if exists public.inventory_check_entries;
drop table if exists public.inventory_checks;
drop table if exists public.inventory_check_items;
drop table if exists public.departments;
