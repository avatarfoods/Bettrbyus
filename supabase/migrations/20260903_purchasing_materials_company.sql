-- Materials are purchased separately per Odoo company (Tuscany Cookies LLC,
-- AvatarNaturalFoods, Yaya's, ...), not shared across them. Tagging each
-- synced material with the company it came from is what lets the Materials
-- page and Master PO show/select "just this place" instead of one blended
-- catalog.

alter table public.purchasing_materials
  add column if not exists odoo_company_id integer,
  add column if not exists odoo_company_name text;

create index if not exists purchasing_materials_odoo_company_id_idx
  on public.purchasing_materials (odoo_company_id);
