-- What the printed spec sheet says that nothing was storing yet.
--
-- The ingredient statement is deliberately its own field rather than being
-- built from the recipe tree: what goes on a label is a legal declaration
-- with its own order and wording, and generating it from the BOM would put a
-- guess on a carton.

alter table public.finished_products
  add column if not exists ingredient_statement text,
  add column if not exists handling_instructions text,
  add column if not exists heating_instructions text,
  add column if not exists guaranteed_shelf_life_days integer,
  add column if not exists pallet_weight_lb numeric,
  add column if not exists case_weight_lb numeric;
