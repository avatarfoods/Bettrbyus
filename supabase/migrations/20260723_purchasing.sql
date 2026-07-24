-- Purchasing (Component Matrix) module:
-- materials catalog (synced from Odoo), recipes/BOM and production schedule
-- (parsed from the master planning file), inventory snapshots, and weekly
-- purchase cycles with buy lines.

-- Materials: catalog fields (item_code, name, odoo_*) sync from Odoo.
-- Purchasing fields (storage_type, lbs_per_case, is_protein, thaw_buffer_days,
-- lead_time_days) are app-managed and must never be overwritten by syncs.
create table if not exists public.purchasing_materials (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  name text not null,
  odoo_product_id integer,
  odoo_category text,
  storage_type text check (storage_type in ('dry', 'refrigerated', 'frozen', 'produce')),
  lbs_per_case numeric,
  is_protein boolean not null default false,
  thaw_buffer_days integer not null default 0,
  lead_time_days integer not null default 0,
  price numeric,
  active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Recipe ingredient names -> materials (recipes reference ingredients by name).
create table if not exists public.purchasing_material_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  material_id uuid not null references public.purchasing_materials (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- WIP recipes parsed from the master file department sheets.
create table if not exists public.purchasing_recipes (
  id uuid primary key default gen_random_uuid(),
  wip_code text not null unique,
  name text not null,
  department text,
  batch_size numeric,
  uom text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- BOM lines: each line resolves to a raw material OR a sub-recipe.
-- Both null means the ingredient name is unresolved (needs alias mapping).
create table if not exists public.purchasing_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.purchasing_recipes (id) on delete cascade,
  material_id uuid references public.purchasing_materials (id),
  sub_recipe_id uuid references public.purchasing_recipes (id),
  ingredient_name text not null,
  quantity numeric not null,
  uom text,
  loss_pct numeric,
  sort_order integer not null default 0,
  check (material_id is null or sub_recipe_id is null)
);

create index if not exists purchasing_recipe_lines_recipe_idx
  on public.purchasing_recipe_lines (recipe_id, sort_order);

-- One row per uploaded master .xlsm; keeps history of every plan import.
create table if not exists public.purchasing_master_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  production_date date,
  stats jsonb,
  imported_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Planned production quantities per recipe per day (from PRODUCTION SCHEDULE).
create table if not exists public.purchasing_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.purchasing_master_imports (id) on delete cascade,
  recipe_id uuid references public.purchasing_recipes (id),
  wip_code text not null,
  schedule_date date not null,
  quantity numeric not null,
  uom text
);

create index if not exists purchasing_schedule_entries_import_idx
  on public.purchasing_schedule_entries (import_id, schedule_date);

-- On-hand quantities; latest row per material wins, manual overrides included.
create table if not exists public.purchasing_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.purchasing_materials (id) on delete cascade,
  qty_on_hand numeric not null,
  source text not null check (source in ('odoo_api', 'file_upload', 'manual_override')),
  fetched_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create index if not exists purchasing_inventory_snapshots_material_idx
  on public.purchasing_inventory_snapshots (material_id, fetched_at desc);

-- Weekly purchase cycle (mirrors the Info_ sheet PO list).
create table if not exists public.purchasing_cycles (
  id uuid primary key default gen_random_uuid(),
  po_number integer,
  required_date date not null unique,
  week_label text,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'done', 'cancelled')),
  import_id uuid references public.purchasing_master_imports (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Buy lines for a cycle: computed requirement + purchasing status tracking.
create table if not exists public.purchasing_lines (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.purchasing_cycles (id) on delete cascade,
  material_id uuid not null references public.purchasing_materials (id),
  cases_required numeric not null default 0,
  lbs_required numeric,
  on_hand_cases numeric,
  required_to_order numeric not null default 0,
  order_by_date date,
  status text not null default 'to_order'
    check (status in ('to_order', 'ordered', 'arrived', 'skipped')),
  arrival_date date,
  is_emergency boolean not null default false,
  required_time text,
  notes text,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, material_id)
);

create index if not exists purchasing_lines_cycle_idx
  on public.purchasing_lines (cycle_id, status);

-- Latest on-hand snapshot per material (manual overrides included since they
-- are newer rows). security_invoker keeps the underlying table RLS in effect.
create or replace view public.purchasing_current_inventory
with (security_invoker = on) as
select distinct on (material_id)
  material_id,
  qty_on_hand,
  source,
  fetched_at
from public.purchasing_inventory_snapshots
order by material_id, fetched_at desc;

-- Row level security: authenticated read/write, same pattern as inventory checks.

alter table public.purchasing_materials enable row level security;
alter table public.purchasing_material_aliases enable row level security;
alter table public.purchasing_recipes enable row level security;
alter table public.purchasing_recipe_lines enable row level security;
alter table public.purchasing_master_imports enable row level security;
alter table public.purchasing_schedule_entries enable row level security;
alter table public.purchasing_inventory_snapshots enable row level security;
alter table public.purchasing_cycles enable row level security;
alter table public.purchasing_lines enable row level security;

-- purchasing_materials
drop policy if exists "Authenticated users can read purchasing_materials" on public.purchasing_materials;
drop policy if exists "Authenticated users can insert purchasing_materials" on public.purchasing_materials;
drop policy if exists "Authenticated users can update purchasing_materials" on public.purchasing_materials;

create policy "Authenticated users can read purchasing_materials"
  on public.purchasing_materials for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_materials"
  on public.purchasing_materials for insert to authenticated with check (true);
create policy "Authenticated users can update purchasing_materials"
  on public.purchasing_materials for update to authenticated using (true) with check (true);

-- purchasing_material_aliases
drop policy if exists "Authenticated users can read purchasing_material_aliases" on public.purchasing_material_aliases;
drop policy if exists "Authenticated users can insert purchasing_material_aliases" on public.purchasing_material_aliases;
drop policy if exists "Authenticated users can update purchasing_material_aliases" on public.purchasing_material_aliases;
drop policy if exists "Authenticated users can delete purchasing_material_aliases" on public.purchasing_material_aliases;

create policy "Authenticated users can read purchasing_material_aliases"
  on public.purchasing_material_aliases for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_material_aliases"
  on public.purchasing_material_aliases for insert to authenticated with check (true);
create policy "Authenticated users can update purchasing_material_aliases"
  on public.purchasing_material_aliases for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete purchasing_material_aliases"
  on public.purchasing_material_aliases for delete to authenticated using (true);

-- purchasing_recipes
drop policy if exists "Authenticated users can read purchasing_recipes" on public.purchasing_recipes;
drop policy if exists "Authenticated users can insert purchasing_recipes" on public.purchasing_recipes;
drop policy if exists "Authenticated users can update purchasing_recipes" on public.purchasing_recipes;

create policy "Authenticated users can read purchasing_recipes"
  on public.purchasing_recipes for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_recipes"
  on public.purchasing_recipes for insert to authenticated with check (true);
create policy "Authenticated users can update purchasing_recipes"
  on public.purchasing_recipes for update to authenticated using (true) with check (true);

-- purchasing_recipe_lines (delete needed: lines are replaced on each re-import)
drop policy if exists "Authenticated users can read purchasing_recipe_lines" on public.purchasing_recipe_lines;
drop policy if exists "Authenticated users can insert purchasing_recipe_lines" on public.purchasing_recipe_lines;
drop policy if exists "Authenticated users can update purchasing_recipe_lines" on public.purchasing_recipe_lines;
drop policy if exists "Authenticated users can delete purchasing_recipe_lines" on public.purchasing_recipe_lines;

create policy "Authenticated users can read purchasing_recipe_lines"
  on public.purchasing_recipe_lines for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_recipe_lines"
  on public.purchasing_recipe_lines for insert to authenticated with check (true);
create policy "Authenticated users can update purchasing_recipe_lines"
  on public.purchasing_recipe_lines for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete purchasing_recipe_lines"
  on public.purchasing_recipe_lines for delete to authenticated using (true);

-- purchasing_master_imports
drop policy if exists "Authenticated users can read purchasing_master_imports" on public.purchasing_master_imports;
drop policy if exists "Authenticated users can insert purchasing_master_imports" on public.purchasing_master_imports;
drop policy if exists "Authenticated users can delete purchasing_master_imports" on public.purchasing_master_imports;

create policy "Authenticated users can read purchasing_master_imports"
  on public.purchasing_master_imports for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_master_imports"
  on public.purchasing_master_imports for insert to authenticated with check (true);
create policy "Authenticated users can delete purchasing_master_imports"
  on public.purchasing_master_imports for delete to authenticated using (true);

-- purchasing_schedule_entries (delete cascades with import, plus explicit cleanup)
drop policy if exists "Authenticated users can read purchasing_schedule_entries" on public.purchasing_schedule_entries;
drop policy if exists "Authenticated users can insert purchasing_schedule_entries" on public.purchasing_schedule_entries;
drop policy if exists "Authenticated users can delete purchasing_schedule_entries" on public.purchasing_schedule_entries;

create policy "Authenticated users can read purchasing_schedule_entries"
  on public.purchasing_schedule_entries for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_schedule_entries"
  on public.purchasing_schedule_entries for insert to authenticated with check (true);
create policy "Authenticated users can delete purchasing_schedule_entries"
  on public.purchasing_schedule_entries for delete to authenticated using (true);

-- purchasing_inventory_snapshots (append-only)
drop policy if exists "Authenticated users can read purchasing_inventory_snapshots" on public.purchasing_inventory_snapshots;
drop policy if exists "Authenticated users can insert purchasing_inventory_snapshots" on public.purchasing_inventory_snapshots;

create policy "Authenticated users can read purchasing_inventory_snapshots"
  on public.purchasing_inventory_snapshots for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_inventory_snapshots"
  on public.purchasing_inventory_snapshots for insert to authenticated with check (true);

-- purchasing_cycles
drop policy if exists "Authenticated users can read purchasing_cycles" on public.purchasing_cycles;
drop policy if exists "Authenticated users can insert purchasing_cycles" on public.purchasing_cycles;
drop policy if exists "Authenticated users can update purchasing_cycles" on public.purchasing_cycles;

create policy "Authenticated users can read purchasing_cycles"
  on public.purchasing_cycles for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_cycles"
  on public.purchasing_cycles for insert to authenticated with check (true);
create policy "Authenticated users can update purchasing_cycles"
  on public.purchasing_cycles for update to authenticated using (true) with check (true);

-- purchasing_lines (delete needed: recompute replaces non-emergency lines)
drop policy if exists "Authenticated users can read purchasing_lines" on public.purchasing_lines;
drop policy if exists "Authenticated users can insert purchasing_lines" on public.purchasing_lines;
drop policy if exists "Authenticated users can update purchasing_lines" on public.purchasing_lines;
drop policy if exists "Authenticated users can delete purchasing_lines" on public.purchasing_lines;

create policy "Authenticated users can read purchasing_lines"
  on public.purchasing_lines for select to authenticated using (true);
create policy "Authenticated users can insert purchasing_lines"
  on public.purchasing_lines for insert to authenticated with check (true);
create policy "Authenticated users can update purchasing_lines"
  on public.purchasing_lines for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete purchasing_lines"
  on public.purchasing_lines for delete to authenticated using (true);
