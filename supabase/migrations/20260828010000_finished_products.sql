-- Finished product specifications.
--
-- The product itself is created in Odoo; this holds everything Odoo has no
-- home for - case composition, pallet build, label artwork, dating rules.
-- One row per Odoo finished-goods product, linked by odoo_product_id.
--
-- Replaces the FINISHED PRODUCT LIST sheet, whose formulas were:
--   LOT NUMBER     = production date
--   EXPIRATION     = EDATE(production date, shelf life) - 1
--   PALLETS NEEDED = CEILING(total cases / cases per pallet)
--
-- Everything derivable is derived. Cases per pallet is layer x tie, never a
-- typed number - typing it is how the workbook ended up with 45 in one place
-- and 135 in another for the same product.

create table if not exists public.finished_products (
  id uuid primary key default gen_random_uuid(),

  -- Identity. The Odoo product is the anchor; code and name are cached so the
  -- screen still reads correctly when Odoo is unreachable.
  odoo_product_id integer not null unique,
  item_code text not null,
  name text not null,
  customer_group text,
  storage_type text check (storage_type in ('freezer', 'cooler', 'dry')),

  -- Case composition.
  bowls_per_case numeric,
  /** How many DIFFERENT products are packed in one case. Aldi combos hold 2. */
  products_per_case integer not null default 1,
  net_weight_per_case numeric,

  -- Codes and label. One artwork file for now.
  case_gtin text,
  unit_upc text,
  label_url text,
  label_filename text,
  /** Brand-owned artwork cannot be sold on without approval - drives the
      Excess Inventory EXCLUDE rule. */
  artwork_owner text not null default 'avatar'
    check (artwork_owner in ('avatar', 'brand')),

  -- Pallet, typed.
  cases_per_layer integer,
  layers_high integer,
  case_width_in numeric,
  case_length_in numeric,
  case_height_in numeric,
  pallet_base_height_in numeric default 6,
  max_pallet_height_in numeric,
  /** Pallets stacked in one warehouse slot. 3 for the 10/9oz bowls. */
  pallets_per_stack integer not null default 1,
  partial_policy text not null default 'accepted'
    check (partial_policy in ('accepted', 'conditional', 'not_accepted')),

  -- Dating. The rule is editable rather than baked into a formula.
  shelf_life_value integer,
  shelf_life_unit text not null default 'months'
    check (shelf_life_unit in ('months', 'days')),
  /** Matches the workbook's EDATE(...) - 1. */
  expiration_offset_days integer not null default -1,
  lot_format text not null default 'MMDDYYYY',

  /** Specs change when a carton changes; old records keep their version. */
  valid_from date not null default current_date,
  active boolean not null default true,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists finished_products_code_idx
  on public.finished_products (item_code);

alter table public.finished_products enable row level security;

drop policy if exists "Authenticated can read finished products" on public.finished_products;
drop policy if exists "Admins can write finished products" on public.finished_products;

create policy "Authenticated can read finished products"
  on public.finished_products for select to authenticated using (true);

create policy "Admins can write finished products"
  on public.finished_products for all to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );
