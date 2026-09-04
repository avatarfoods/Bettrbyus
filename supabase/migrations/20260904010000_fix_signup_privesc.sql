-- Fix: unauthenticated privilege escalation to admin via signup metadata.
-- See issue #10. Two changes, both defensive:
--
--   1. handle_new_user() must never read the role from caller-supplied
--      auth.users.raw_user_meta_data. A signup's options.data bag is fully
--      attacker-controlled, so a profile is always created as 'user'.
--      Promotion to admin stays an explicit, service-role act
--      (lib/users/actions.ts), which the guard below still allows.
--
--   2. guard_profile_user_type() gains a BEFORE INSERT arm so that, even if
--      some other insert path appears, a non-service-role insert can only
--      ever create a 'user'. Defense in depth behind change 1.

-- 1. Never trust signup metadata for the role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, user_type)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    'user'                       -- always 'user'; promotion is an explicit admin act
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

-- 2. Guard both INSERT and UPDATE of user_type.
create or replace function public.guard_profile_user_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side admin operations use the service role and are allowed through.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A non-service-role insert may only ever create a plain user.
    if new.user_type is distinct from 'user' then
      raise exception 'Only an admin can set user_type'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- UPDATE: only an admin may change an existing profile's role.
  if new.user_type is distinct from old.user_type then
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
  before insert or update on public.profiles
  for each row
  execute function public.guard_profile_user_type();
