-- Archiving a recipe.
--
-- Out of every list and no longer choosable as an ingredient, but the record
-- and its history stay: past schedule entries, printed batch records and old
-- WIP counts all still resolve to a real recipe.
--
-- `active` already existed and nothing ever set it, so the timestamp is what
-- carries the meaning - when it happened, and who decided.

alter table public.purchasing_recipes
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles (id);

create index if not exists purchasing_recipes_archived_idx
  on public.purchasing_recipes (archived_at);
