-- 20260904_case_units
-- What a case can be counted in on a specification: bowls, burritos, cups...
-- A company-wide list kept with the other app settings and edited under
-- Recipes > Settings, so the dropdown on every spec reads the same words.
-- Re-runnable.

alter table public.app_settings
  add column if not exists case_units text[] not null
    default array['bowl', 'burrito', 'cup', 'bag', 'tray', 'piece'];
