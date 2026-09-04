-- Buyer-facing shopping category, distinct from the Odoo-synced
-- odoo_category (noisy, overwritten on every sync) and from storage_type
-- (a temperature zone, not who the buyer calls). Admin-tagged, never
-- touched by syncOdooMaterials. Null means "not tagged yet" - the Finalize
-- Order screen buckets those under Uncategorized as a rollout checklist.

alter table public.purchasing_materials
  add column if not exists purchasing_category text
  check (purchasing_category is null or purchasing_category in
    ('produce', 'protein', 'dairy_refrigerated', 'dry_goods', 'packaging'));
