-- Default container size per recipe, for the WIP count screen.
--
-- Beef is 80 lb buckets, roasted corn is 50. The count form pre-selects this
-- so the floor only taps how many. Changing size on a count is for that
-- count only and does not rewrite this default.

alter table public.purchasing_recipes
  add column if not exists default_container_size numeric
    check (default_container_size is null or default_container_size > 0),
  add column if not exists default_container_label text not null default 'bucket';

comment on column public.purchasing_recipes.default_container_size is
  'Usual amount in one container, in the recipe uom. Pre-selected on WIP count.';

comment on column public.purchasing_recipes.default_container_label is
  'bucket, cart, pan, bin, case or bag.';
