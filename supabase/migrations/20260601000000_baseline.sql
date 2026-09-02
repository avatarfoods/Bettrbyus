-- Baseline: the tables that predate every other file in this directory.
--
-- The hosted Supabase project was built by hand in the dashboard, so the
-- migrations that follow (20260622 onward) alter tables no file here ever
-- created: profiles, items, movings, departments and the inventory-check
-- tables. This file reconstructs them from what the application code reads
-- and writes (lib/, components/, app/) and from the repository history, so a
-- fresh database - `supabase db reset` on a local stack - can replay the
-- whole directory from nothing.
--
-- Column shapes are taken from the code, not guessed: every column named
-- here is one that some query selects, inserts or filters on, or that a later
-- migration alters. Anything a later migration adds (movings.out_po_number,
-- the profiles trigger, the departments read policy, ...) is deliberately
-- left out so those files still do what their names say.
--
-- Everything is guarded, so running this against the hosted project, where
-- these tables already exist, changes nothing.

-- ---------------------------------------------------------------------------
-- profiles
--
-- One row per auth user, keyed by the auth.users id. Read by every admin gate
-- in the app (profiles.user_type = 'admin') and by the joins that show who
-- did something (full_name, falling back to email). Rows are created by the
-- auth trigger that 20260623_profiles_trigger_rls.sql installs.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  /** 'admin' or 'user'. The code writes nothing else; 'user' is the default
      the trigger falls back to. */
  user_type text not null default 'user',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- items
--
-- The freezer item catalog behind the moving form. Only ever read by the app;
-- rows are maintained in the dashboard. thaw_range_days is free text the
-- code parses as "14" or "3-5" (see lib/thaw-range.ts).
-- ---------------------------------------------------------------------------

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  code text,
  item_name text,
  thaw_range_days text,
  created_at timestamptz not null default now()
);

create index if not exists items_code_idx on public.items (code);

alter table public.items enable row level security;

drop policy if exists "Authenticated users can read items" on public.items;

create policy "Authenticated users can read items"
  on public.items for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- movings
--
-- One row per lot moved into the freezer; the same row is updated when it is
-- moved out (moved_at, completed_by). Transfers from an original case into a
-- black container split a row in two.
--
-- status carries the original five values here; 20260622 widens it to add
-- 'available' and 'removed', which is what the app writes today. The
-- constraint is named explicitly because that migration drops it by name.
-- ---------------------------------------------------------------------------

create table if not exists public.movings (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  po_number text not null,
  item_id uuid references public.items (id),
  amount numeric not null,
  prep_date timestamptz,
  best_by timestamptz,
  lot_number text,
  storage_type text
    check (storage_type is null or storage_type in ('original_case', 'black_container')),
  /** Null while still in the freezer; set when moved out. */
  moved_at timestamptz,
  thawing_status text,
  status text
    constraint movings_status_check check (
      status is null
      or status in ('draft', 'pending', 'in_progress', 'completed', 'cancelled')
    ),
  -- The history screen joins these by constraint name
  -- (profiles!movings_started_by_fkey, profiles!movings_completed_by_fkey),
  -- which is what Postgres names them by default.
  started_by uuid references public.profiles (id),
  completed_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists movings_item_idx on public.movings (item_id);
create index if not exists movings_in_freezer_idx
  on public.movings (direction, created_at desc)
  where moved_at is null;
create index if not exists movings_moved_at_idx
  on public.movings (moved_at desc)
  where moved_at is not null;

alter table public.movings enable row level security;

drop policy if exists "Authenticated users can read movings" on public.movings;
drop policy if exists "Authenticated users can insert movings" on public.movings;
drop policy if exists "Authenticated users can update movings" on public.movings;

create policy "Authenticated users can read movings"
  on public.movings for select to authenticated using (true);
create policy "Authenticated users can insert movings"
  on public.movings for insert to authenticated with check (true);
create policy "Authenticated users can update movings"
  on public.movings for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- departments and the inventory-check tables
--
-- These belonged to the inventory-check app, which was retired and whose
-- tables 20260901_drop_inventory_checks.sql removes. They still have to
-- exist at this point in the sequence: 20260702 alters departments by name,
-- and the drop file has to have something to drop. Shapes come from the
-- inventory-check code that lived in lib/inventory-checks/ until it was
-- removed, and from the generator script that created the tables on the
-- hosted project. No read policies: 20260702 adds the one for departments,
-- and the rest are gone before anything reads them.
-- ---------------------------------------------------------------------------

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;

create table if not exists public.inventory_check_items (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id),
  item_code text not null,
  item_name text not null,
  par_quantity numeric,
  unit text,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_check_items_department_sort_idx
  on public.inventory_check_items (department_id, sort_order);

create unique index if not exists inventory_check_items_sort_order_idx
  on public.inventory_check_items (sort_order);

create table if not exists public.inventory_checks (
  id uuid primary key default gen_random_uuid(),
  check_date date not null,
  department_id uuid not null references public.departments (id),
  checked_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (check_date, department_id)
);

create table if not exists public.inventory_check_entries (
  id uuid primary key default gen_random_uuid(),
  inventory_check_id uuid not null references public.inventory_checks (id) on delete cascade,
  inventory_check_item_id uuid not null references public.inventory_check_items (id),
  actual_quantity numeric,
  notes text,
  unique (inventory_check_id, inventory_check_item_id)
);

create index if not exists inventory_check_entries_check_id_idx
  on public.inventory_check_entries (inventory_check_id);

alter table public.inventory_check_items enable row level security;
alter table public.inventory_checks enable row level security;
alter table public.inventory_check_entries enable row level security;
