-- WIP counts, one row per lot found.
--
-- The old production_wip_counts table is one row per recipe that overwrites
-- itself: no lots, no expiry, no history, no idea who counted. None of that
-- can be bolted on, so this replaces it and the old table is left alone
-- rather than migrated - it holds nothing anyone has used.
--
-- Why per lot and not per recipe: five buckets of birria are not necessarily
-- one lot. Three from Monday and two from Tuesday expire on different days,
-- and a single expiration cannot describe a mixed pile. The lot is also a
-- date - MMDDYYYY is the production date - so recording it tells the app
-- which day's production the stock came from without anyone saying so.
--
-- Nobody weighs. They count buckets, carts or pans of a known size, so the
-- arithmetic is the app's problem rather than something done in someone's
-- head at four in the morning.

create table if not exists public.wip_counts (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null
    references public.purchasing_recipes (id) on delete cascade,

  /** As written on the bucket. MMDDYYYY, which is the production date. */
  lot_code text not null,
  /** The same date, parsed, so counts can be grouped and aged by SQL. */
  produced_on date,

  /** How many containers were found. */
  containers numeric not null check (containers >= 0),
  /** What one container holds, in the recipe's own unit. */
  container_size numeric not null check (container_size > 0),
  /** bucket, cart, pan, bin - what they were counting. */
  container_label text not null default 'bucket',

  /** containers x size, never typed. */
  quantity numeric generated always as (containers * container_size) stored,

  counted_at timestamptz not null default now(),
  counted_by uuid references public.profiles (id),
  /** Free text for "one bucket was half full". */
  note text
);

create index if not exists wip_counts_recipe_idx
  on public.wip_counts (recipe_id, counted_at desc);

create index if not exists wip_counts_lot_idx
  on public.wip_counts (recipe_id, lot_code, counted_at desc);

create index if not exists wip_counts_when_idx
  on public.wip_counts (counted_at desc);

alter table public.wip_counts enable row level security;

drop policy if exists "Authenticated can read wip counts" on public.wip_counts;
drop policy if exists "Authenticated can write wip counts" on public.wip_counts;
drop policy if exists "Admins can delete wip counts" on public.wip_counts;

create policy "Authenticated can read wip counts"
  on public.wip_counts for select to authenticated using (true);

-- Counting is floor work at four in the morning, not an admin task, so any
-- signed-in person may record one. A count is an observation; it changes
-- nothing on its own.
create policy "Authenticated can write wip counts"
  on public.wip_counts for insert to authenticated with check (true);

create policy "Authenticated can correct own counts"
  on public.wip_counts for update to authenticated
  using (counted_by = auth.uid())
  with check (counted_by = auth.uid());

-- Deleting a count is rewriting history, so it is an admin act.
create policy "Admins can delete wip counts"
  on public.wip_counts for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  );
