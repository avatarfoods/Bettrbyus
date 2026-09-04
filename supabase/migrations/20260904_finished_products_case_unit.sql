-- 20260904_finished_products_case_unit
-- A case holds so many units of something: bowls, burritos, cups. The count
-- was already stored (bowls_per_case); this is what the count is of, so a
-- 12-carton case of 48 burritos reads as 48 burritos, not 48 bowls.
-- Re-runnable.

alter table public.finished_products
  add column if not exists case_unit text;
