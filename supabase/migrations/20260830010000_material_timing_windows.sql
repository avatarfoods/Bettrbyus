-- Timing windows for raw materials.
--
-- A frozen protein has to be out of the freezer before the step that uses it
-- can start, and that pull has its own window: barbacoa beef is "no earlier
-- than 10 days before, out by 4 days before". That is the same shape as a
-- recipe's window, but a material is not a recipe - it has no ingredients, no
-- yield and no method - so it gets its own small table rather than a nullable
-- column bolted onto the recipe one.
--
-- Same convention as recipe_timing_windows: negative offsets from the day the
-- finished product ships, zero meaning the day itself, null meaning no limit.

create table if not exists public.material_timing_windows (
  material_id uuid primary key
    references public.purchasing_materials (id) on delete cascade,
  /** Furthest ahead it may be pulled or prepped. -10 = ten days before. */
  earliest_offset integer check (earliest_offset is null or earliest_offset <= 0),
  /** Latest it may be left. -4 = must be ready four days before. */
  latest_offset integer check (latest_offset is null or latest_offset <= 0),
  /** What this window is about - thawing, tempering, soaking. */
  kind text not null default 'thaw'
    check (kind in ('thaw', 'temper', 'soak', 'prep', 'other')),
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  check (
    earliest_offset is null
    or latest_offset is null
    or earliest_offset <= latest_offset
  )
);

alter table public.material_timing_windows enable row level security;

drop policy if exists "Authenticated can read material windows" on public.material_timing_windows;
drop policy if exists "Admins can write material windows" on public.material_timing_windows;

create policy "Authenticated can read material windows"
  on public.material_timing_windows for select to authenticated using (true);

create policy "Admins can write material windows"
  on public.material_timing_windows for all to authenticated
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
