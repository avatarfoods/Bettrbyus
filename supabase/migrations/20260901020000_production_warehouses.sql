-- Which Odoo warehouses the order schedule pulls from.
--
-- Until now Avatar (picking type 2) and Americold (picking type 110) were
-- hard-coded. Adding a third warehouse, or dropping one, should not need a
-- deploy. An empty table means "use the built-in pair"; once an admin saves
-- a selection, only those rows are read.

create table if not exists public.production_warehouses (
  id uuid primary key default gen_random_uuid(),
  -- stock.warehouse id in Odoo.
  odoo_id integer not null unique,
  name text not null,
  code text,
  -- stock.picking.type id used for outgoing deliveries from this warehouse.
  picking_type_id integer not null,
  -- stock.location id that counts as on-hand for this warehouse (lot_stock_id).
  stock_location_id integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.production_warehouses is
  'Odoo warehouses the production order schedule reads. Empty means fall back to Avatar + Americold.';

-- Seed the pair the code used to hard-code, so the day this runs nothing
-- changes on the order schedule. Ids confirmed against live Odoo.
insert into public.production_warehouses
  (odoo_id, name, code, picking_type_id, stock_location_id, sort_order)
values
  (1, 'AvatarNaturalFoods', 'WH1', 2, 8, 1),
  (13, 'Americold Warehouse', 'AW', 110, 258, 2)
on conflict (odoo_id) do nothing;

alter table public.production_warehouses enable row level security;

drop policy if exists "Authenticated can read production warehouses" on public.production_warehouses;
drop policy if exists "Admins can write production warehouses" on public.production_warehouses;

create policy "Authenticated can read production warehouses"
  on public.production_warehouses for select to authenticated using (true);

create policy "Admins can write production warehouses"
  on public.production_warehouses for all to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );
