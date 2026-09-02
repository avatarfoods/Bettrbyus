-- Matrix department for Master PO grouping (Finished Product, Fresh Mixing, …).
-- Produce is stored but hidden in the Master PO UI.
alter table public.purchasing_materials
  add column if not exists department text;
