-- One live plan per production line.
--
-- Bettr Bowl, Pita and Pizza Cupcake are separate operations that happen to
-- share a building. Planning a Bettr Bowl week has nothing to say about Pizza
-- Cupcake, and putting them in one grid meant every planner scrolling past
-- two other lines' recipes to reach their own - and one person confirming a
-- plan for a line they do not run.
--
-- So a schedule belongs to a line, and the "exactly one live" rule becomes
-- "exactly one live per line". Everything else already follows: a department
-- belongs to a line, a recipe belongs to a department, so which line a recipe
-- is planned under was never in doubt.

alter table public.production_schedules
  add column if not exists line_id uuid
    references public.production_lines (id) on delete cascade;

-- The plan that exists today is Bettr Bowl's: every department in the system
-- belongs to it, so nothing else could have been in there.
update public.production_schedules s
set line_id = (
  select l.id from public.production_lines l
  where l.key = 'bettr-bowl'
  limit 1
)
where s.line_id is null;

drop index if exists production_schedules_one_live_idx;

create unique index if not exists production_schedules_one_live_per_line_idx
  on public.production_schedules (line_id)
  where status = 'live';

create index if not exists production_schedules_line_idx
  on public.production_schedules (line_id, status);
