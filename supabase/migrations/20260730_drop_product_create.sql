-- Drop product-registration tables/columns if the create migration was applied.

drop table if exists public.purchasing_odoo_selections cascade;
drop table if exists public.purchasing_uoms cascade;
drop table if exists public.purchasing_companies cascade;
drop table if exists public.purchasing_product_categories cascade;

alter table public.purchasing_materials
  drop column if exists odoo_category_id,
  drop column if exists odoo_company_id,
  drop column if exists odoo_uom_id,
  drop column if exists product_type,
  drop column if exists invoice_policy,
  drop column if exists tracking,
  drop column if exists product_spec,
  drop column if exists allergy_statement,
  drop column if exists pack_size,
  drop column if exists case_description,
  drop column if exists cost_per_case,
  drop column if exists lbs_option;
