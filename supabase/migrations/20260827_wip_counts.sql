-- On-hand counts of work-in-progress subrecipes, for the WIP calculator.
--
-- "The kitchen made X - what can we run with it?" One row per subrecipe, the
-- latest count wins. Deliberately NOT tied to a production run or a date
-- range: this answers a question about right now, and nothing here changes
-- the schedule.

create table if not exists public.production_wip_counts (
  recipe_id uuid primary key references public.purchasing_recipes (id) on delete cascade,
  qty_on_hand numeric,
  counted_at timestamptz not null default now(),
  counted_by uuid references public.profiles (id)
);

alter table public.production_wip_counts enable row level security;

drop policy if exists "Authenticated users can read wip counts" on public.production_wip_counts;
drop policy if exists "Authenticated users can write wip counts" on public.production_wip_counts;

create policy "Authenticated users can read wip counts"
  on public.production_wip_counts
  for select
  to authenticated
  using (true);

-- Counting is floor work, not an admin task, so any signed-in user may record
-- one. The count is an observation; it has no downstream side effects.
create policy "Authenticated users can write wip counts"
  on public.production_wip_counts
  for all
  to authenticated
  using (true)
  with check (true);
