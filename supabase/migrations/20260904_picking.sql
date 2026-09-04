-- 20260904_picking
-- The master picking order: what the kitchen pulls for a production date.
-- Per material, the things the picking sheet groups and divides by that the
-- purchasing table does not carry - the sheet's department and type, and the
-- pack size read from Odoo's Product Spec (Pack Size + U/M). Kept in its own
-- table, keyed by the material, so the purchasing tables stay as they are.
-- Re-runnable.

create table if not exists public.production_picking_materials (
  material_id uuid primary key references public.purchasing_materials (id) on delete cascade,
  -- The sheet the item is picked for: FINISHED PRODUCT, MAIN KITCHEN, PRODUCE...
  pick_department text,
  -- The sheet's grouping: BOXES, CARTON, MIN/MAX, DAIRY, FREEZER, PRODUCE...
  pick_type text,
  -- Odoo Product Spec: Pack Size and its U/M. 25 + Lbs means one case is 25 lb;
  -- 600 + Unit means one case is 600 pieces.
  pack_size numeric,
  pack_uom text,
  case_description text,
  odoo_storage text,
  pack_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

alter table public.production_picking_materials enable row level security;

drop policy if exists "Authenticated users can read picking materials" on public.production_picking_materials;
drop policy if exists "Admins write picking materials" on public.production_picking_materials;

create policy "Authenticated users can read picking materials"
  on public.production_picking_materials
  for select
  to authenticated
  using (true);

create policy "Admins write picking materials"
  on public.production_picking_materials
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  );
