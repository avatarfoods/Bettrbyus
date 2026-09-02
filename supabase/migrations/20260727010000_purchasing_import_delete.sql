-- Allow deleting a master import while keeping purchase weeks.
-- Cycles keep their buy lists; import_id is cleared instead of blocking delete.

alter table public.purchasing_cycles
  drop constraint if exists purchasing_cycles_import_id_fkey;

alter table public.purchasing_cycles
  add constraint purchasing_cycles_import_id_fkey
  foreign key (import_id)
  references public.purchasing_master_imports (id)
  on delete set null;
