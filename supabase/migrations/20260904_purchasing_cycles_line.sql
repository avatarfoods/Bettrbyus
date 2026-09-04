-- Which production line a Master PO's schedule demand was computed from.
--
-- Bettr Bowl, Pita, and Pizza Cupcake each run their own live schedule
-- (production_schedules.line_id). Master PO generation used to sum demand
-- across every line with no way to scope to one - this column lets a buyer
-- pick a single line (a tab, same idea as the Planning page's line switch)
-- and remembers which line a given Master PO was generated for, so
-- re-applying it later can't silently swap which line's demand it counts.
-- Null means "every line" - the old, unscoped behavior, kept for cycles
-- generated before this column existed.

alter table public.purchasing_cycles
  add column if not exists line_id uuid references public.production_lines(id);
