-- The production schedule.
--
-- This is the workbook's centre of gravity: a grid of dates across the top,
-- recipes down the side, and a quantity typed in each cell. Everything else
-- in Phase 1 - the print-outs, the batch sheets, the WIP check - reads from
-- what is typed here.
--
-- Two ideas from how the plant already works are built in rather than bolted
-- on later:
--
-- 1. There is ONE live schedule and it is always open - no folder to create,
--    because the plan changes daily. Changing it opens a DRAFT belonging to
--    whoever is editing, stamped with the day they started. The draft holds
--    only the cells they touched, so two people working on different lines
--    cannot overwrite each other. Confirming a draft merges those cells into
--    the live schedule and closes the draft, leaving a record of who changed
--    what and when.
--
-- 2. Quantities are typed against a date the item is *produced*. When it is
--    *needed* is derived by walking the recipe tree from the finished
--    product, which is why nothing here stores a needed-by date - a stored
--    one would go stale the moment a formula changed.

create table if not exists public.production_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  /**
   * live      - THE schedule. Exactly one, and it is what the floor works from.
   * draft     - somebody's in-progress changes to the live one.
   * confirmed - a draft that has been merged into live; kept as the record.
   * archived  - kept for history, never shown by default.
   */
  status text not null default 'draft'
    check (status in ('live', 'draft', 'confirmed', 'archived')),
  /** For a draft: the live schedule these changes will be merged into. */
  parent_schedule_id uuid references public.production_schedules (id) on delete cascade,
  /** The window this covers. The live one runs well past any horizon. */
  period_start date not null,
  period_end date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  check (period_end >= period_start)
);

create index if not exists production_schedules_period_idx
  on public.production_schedules (period_start, period_end);

create index if not exists production_schedules_status_idx
  on public.production_schedules (status, period_start desc);

create index if not exists production_schedules_parent_idx
  on public.production_schedules (parent_schedule_id, status);

-- Exactly one live schedule, enforced by the database rather than by hope.
create unique index if not exists production_schedules_one_live_idx
  on public.production_schedules ((status))
  where status = 'live';

-- One open draft per person per parent, so re-opening the page continues the
-- draft already in progress instead of starting a second one.
create unique index if not exists production_schedules_one_open_draft_idx
  on public.production_schedules (parent_schedule_id, created_by)
  where status = 'draft';

create table if not exists public.production_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null
    references public.production_schedules (id) on delete cascade,
  recipe_id uuid not null
    references public.purchasing_recipes (id) on delete cascade,
  /** The day this quantity is produced, not the day it is needed. */
  production_date date not null,
  /** In the recipe's own output unit. Zero and null both mean "not scheduled". */
  quantity numeric,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  -- One cell in the grid is one row. Two rows would silently double the day.
  unique (schedule_id, recipe_id, production_date)
);

create index if not exists production_schedule_entries_grid_idx
  on public.production_schedule_entries (schedule_id, production_date);

create index if not exists production_schedule_entries_recipe_idx
  on public.production_schedule_entries (recipe_id, production_date);


-- ------------------------------------------------------------
-- Timing windows: when a step may run, relative to the day its finished
-- product ships.
--
-- Written the way the plant reads a T-minus chart, as negative offsets from
-- day zero:
--
--   -5 -> -2   make it no earlier than 5 days before, ready by 2 days before
--   -1 ->  0   make it the day before, or the day itself
--    0 ->  0   same day only
--
-- Negative rather than "days before" on purpose: the chart says T-5, the
-- person says minus five, and the field should not be the one place the sign
-- flips. Zero is a real value - "same day only" - and is not the same as null,
-- which means no limit at all.
--
-- Shelf life is not stored. It is the earliest offset: something that may be
-- made five days ahead is something that keeps five days, and a second field
-- would only give the two a way to disagree.

create table if not exists public.recipe_timing_windows (
  recipe_id uuid primary key
    references public.purchasing_recipes (id) on delete cascade,
  /** Furthest ahead it may be made, as a negative offset. -5 = five days. */
  earliest_offset integer check (earliest_offset is null or earliest_offset <= 0),
  /** Closest to the ship day it may be left. 0 = the day itself. */
  latest_offset integer check (latest_offset is null or latest_offset <= 0),
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  -- Earliest is further from zero, so it is the smaller number.
  check (
    earliest_offset is null
    or latest_offset is null
    or earliest_offset <= latest_offset
  )
);


-- ------------------------------------------------------------
-- Extra percentage applied on top of demand when cascading.
--
-- Carlos asked for this to sit at 0% and be changeable to 5, 10 and so on.
-- It lives on app_settings so it is one company-wide number, not a value
-- retyped per schedule.

alter table public.app_settings
  add column if not exists schedule_extra_pct numeric not null default 0;


-- ------------------------------------------------------------
-- Row level security. Anyone signed in reads the schedule; only an admin
-- writes it. Matches the pattern used by production_lines.

alter table public.production_schedules enable row level security;
alter table public.production_schedule_entries enable row level security;
alter table public.recipe_timing_windows enable row level security;

drop policy if exists "Authenticated can read schedules" on public.production_schedules;
drop policy if exists "Admins can write schedules" on public.production_schedules;
drop policy if exists "Authenticated can read schedule entries" on public.production_schedule_entries;
drop policy if exists "Authenticated can write schedule entries" on public.production_schedule_entries;
drop policy if exists "Authenticated can read timing windows" on public.recipe_timing_windows;
drop policy if exists "Admins can write timing windows" on public.recipe_timing_windows;

create policy "Authenticated can read schedules"
  on public.production_schedules for select to authenticated using (true);

create policy "Admins can write schedules"
  on public.production_schedules for all to authenticated
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

create policy "Authenticated can read schedule entries"
  on public.production_schedule_entries for select to authenticated using (true);

-- Entries are deliberately writable by any signed-in user: a supervisor
-- typing tomorrow's numbers is the normal case, and the folder they type
-- into is created and confirmed by an admin.
create policy "Authenticated can write schedule entries"
  on public.production_schedule_entries for all to authenticated
  using (true) with check (true);

create policy "Authenticated can read timing windows"
  on public.recipe_timing_windows for select to authenticated using (true);

create policy "Admins can write timing windows"
  on public.recipe_timing_windows for all to authenticated
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
