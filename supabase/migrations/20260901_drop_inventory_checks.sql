-- Inventory checks, removed.
--
-- The app was never adopted - production, planning and WIP cover what the
-- plant actually needs, and a second place to count things was a second place
-- for the answer to be wrong. The pages and code are gone; this takes the
-- tables with them so nothing is left half-present.
--
-- `departments` goes too: nothing else ever read it. Production has its own
-- production_departments, which is unrelated and stays.

-- The inventory-check app is gone; these are its tables.
--
-- wip_inventory belongs to it too: nothing in the app has ever read it and it
-- holds no rows, but it carries a foreign key to departments, so departments
-- cannot go while it stands. Dropped explicitly rather than with CASCADE -
-- CASCADE would quietly take whatever else happened to depend on it, and the
-- point of this is to remove exactly what is dead.
--
-- Production has its own production_departments, which is a different table
-- and stays.
drop table if exists public.inventory_check_entries;
drop table if exists public.inventory_checks;
drop table if exists public.inventory_check_items;
drop table if exists public.wip_inventory;
drop table if exists public.departments;
