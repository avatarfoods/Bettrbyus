-- 20260904_app_logo
-- The company logo in the top bar becomes a setting. Settings > Appearance
-- takes a URL; empty means the logo shipped with the app. Re-runnable.

alter table public.app_settings
  add column if not exists logo_url text;
