-- A recipe knows whether it is a finished product.
--
-- Until now this was inferred from the department a recipe came from -
-- "FINISHED PRODUCT" meant finished, anything else did not. That was the only
-- signal the workbook carried, but it is a proxy, and proxies drift: a recipe
-- filed under the wrong sheet silently stops being a finished product, and
-- with it stops driving the schedule.
--
-- So it becomes an explicit flag someone ticks. The department stays as the
-- default when the flag has never been set, which keeps the 32 recipes
-- already filed under FINISHED PRODUCT working without anyone revisiting them.

alter table public.purchasing_recipes
  add column if not exists is_finished_product boolean;

comment on column public.purchasing_recipes.is_finished_product is
  'Ticked by hand. Null falls back to department = FINISHED PRODUCT.';

-- Seed the flag from what the department already implies, so nothing changes
-- behaviour on the day this runs.
update public.purchasing_recipes
set is_finished_product = (upper(coalesce(department, '')) = 'FINISHED PRODUCT')
where is_finished_product is null;


-- ------------------------------------------------------------
-- The finished product specification hangs off the recipe.
--
-- It was keyed only by Odoo product id, which made it a separate record on a
-- separate page - the same split that let cases-per-pallet be 45 in one sheet
-- and 135 in another. Attaching it to the recipe means the spec and the
-- formula are one thing in one place.
--
-- No backfill is possible or needed: purchasing_recipes carries no Odoo
-- product id to join on, and the spec table is still empty. The link is made
-- when a spec is saved from a recipe page.

alter table public.finished_products
  add column if not exists recipe_id uuid
    references public.purchasing_recipes (id) on delete cascade;

create unique index if not exists finished_products_recipe_idx
  on public.finished_products (recipe_id)
  where recipe_id is not null;

-- The Odoo product link stays, but stops being the only way in, so a recipe
-- can hold a spec before anyone has picked its Odoo product.
alter table public.finished_products
  alter column odoo_product_id drop not null;
