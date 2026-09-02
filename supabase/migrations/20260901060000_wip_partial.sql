-- A lot is rarely whole buckets. Four 50 lb buckets and a part-full one
-- holding 30 is one lot, one line, one number - not two rows the on-hand
-- calculation would have to guess were meant together.
--
-- This ran on the hosted project through PENDING_MIGRATIONS.sql before it had
-- a file of its own; the file exists so a database built from this directory
-- ends up with the same columns.

alter table public.wip_counts
  add column if not exists partial_quantity numeric not null default 0
    check (partial_quantity >= 0);

-- quantity is derived, so it can be rebuilt rather than migrated. Dropping it
-- first is what makes the add below safe to re-run.
alter table public.wip_counts drop column if exists quantity;

alter table public.wip_counts
  add column quantity numeric
    generated always as (containers * container_size + partial_quantity) stored;

comment on column public.wip_counts.partial_quantity is
  'Loose amount on top of the whole containers, in the recipe uom.';
