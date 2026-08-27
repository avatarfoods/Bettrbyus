-- Master PO rows whose Excel item code has no purchasing_materials match used
-- to be dropped, so the matrix showed fewer lines than the MASTER PICKING ORDER
-- table. Keep them as material-less lines carrying the Excel code and name.

alter table public.purchasing_lines
  alter column material_id drop not null,
  add column if not exists item_code text,
  add column if not exists item_name text;

-- The existing unique (cycle_id, material_id) no longer covers unmatched rows,
-- because Postgres treats every NULL material_id as distinct.
create unique index if not exists purchasing_lines_cycle_item_code_idx
  on public.purchasing_lines (cycle_id, item_code)
  where material_id is null;
