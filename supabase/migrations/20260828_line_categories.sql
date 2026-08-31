-- A production line can pull from more than one Odoo category.
--
-- One category per line was too narrow: somebody may want a tab showing Bettr
-- Bowl and Pita together, or a line whose finished goods were filed under two
-- categories over the years. The single column stays for now so nothing breaks
-- mid-deploy; the array is the one that is read.

alter table public.production_lines
  add column if not exists odoo_category_ids integer[] not null default '{}';

-- Carry the existing single link into the array.
update public.production_lines
set odoo_category_ids = array[odoo_category_id]
where odoo_category_id is not null
  and (odoo_category_ids is null or cardinality(odoo_category_ids) = 0);

comment on column public.production_lines.odoo_category_ids is
  'Odoo product.category ids this line pulls finished goods from. Empty means the tab shows nothing.';

comment on column public.production_lines.odoo_category_id is
  'Deprecated: superseded by odoo_category_ids. Kept so an older deploy keeps working.';
