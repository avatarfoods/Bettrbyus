-- Master PO stops depending on a re-uploaded Excel snapshot: order quantities
-- are now computed live from the production schedule + BOM. This adds the
-- dual-mode defaults the old workbook's "DAILY USAGE" / "OPEN ORDER" toggle
-- used (5% / 15% buffers, taken straight from the workbook's own P2/T2
-- cells), and a diagnostic view for BOM lines nothing can be bought against.

alter table public.app_settings
  add column if not exists purchasing_daily_usage_days integer not null default 3,
  add column if not exists purchasing_daily_usage_extra_pct numeric not null default 5,
  add column if not exists purchasing_open_order_days integer not null default 14,
  add column if not exists purchasing_open_order_extra_pct numeric not null default 15;

-- A line with neither a material nor a sub-recipe contributes zero demand
-- silently - there is no fuzzy name match to fall back on the way the old
-- Excel-driven import had. This is how that gap gets caught before it turns
-- into an under-ordered material.
create or replace view public.purchasing_recipe_lines_unresolved
with (security_invoker = on) as
select
  rl.id,
  rl.recipe_id,
  r.name as recipe_name,
  rl.ingredient_name,
  rl.quantity,
  rl.uom
from public.purchasing_recipe_lines rl
join public.purchasing_recipes r on r.id = rl.recipe_id
where rl.material_id is null
  and rl.sub_recipe_id is null
  and r.active = true;
