-- Company-wide appearance settings for the app launcher.
--
-- Wallpaper is a company setting (one admin sets it, everyone sees it), which
-- is why it lives here rather than in localStorage. Dark mode is deliberately
-- NOT stored here: that is a per-person choice and stays on the device.

create table if not exists public.app_settings (
  -- Singleton: the check constraint means only one row can ever exist.
  id boolean primary key default true check (id),
  wallpaper_preset text not null default 'kitchen-green',
  wallpaper_color text,
  wallpaper_image_url text,
  show_logo_watermark boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Authenticated users can read app settings" on public.app_settings;
drop policy if exists "Admins can update app settings" on public.app_settings;

create policy "Authenticated users can read app settings"
  on public.app_settings
  for select
  to authenticated
  using (true);

create policy "Admins can update app settings"
  on public.app_settings
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Privilege escalation fix.
--
-- The existing "Users can update own profile" policy restricts WHICH ROW a
-- user may update but not WHICH COLUMNS, so any authenticated user could run
--   update profiles set user_type = 'admin' where id = auth.uid()
-- and grant themselves admin. Every admin gate in the app - including the
-- app_settings policy above - trusts profiles.user_type, so this has to hold.
--
-- RLS cannot express a column-level rule, so it is enforced with a trigger.
-- Triggers also fire for the service-role key (which bypasses RLS), so the
-- admin API is allowed through explicitly.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_user_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_type is distinct from old.user_type then
    -- Server-side admin operations use the service role and have no auth.uid().
    if coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;

    if not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    ) then
      raise exception 'Only an admin can change user_type'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_user_type on public.profiles;

create trigger profiles_guard_user_type
  before update on public.profiles
  for each row
  execute function public.guard_profile_user_type();
