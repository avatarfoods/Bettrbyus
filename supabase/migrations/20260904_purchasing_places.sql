-- Which Odoo companies Purchasing works with (Yaya's, AvatarNaturalFoods, …).
--
-- Materials are bought per company, not shared. Until an admin saves a
-- selection, every company the API user can see is in play — the same as
-- today. Once a row exists, sync and the Materials page only use those
-- places.

create table if not exists public.purchasing_places (
  id uuid primary key default gen_random_uuid(),
  odoo_company_id integer not null unique,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.purchasing_places is
  'Odoo companies Purchasing reads materials from. Empty means every company.';

alter table public.purchasing_places enable row level security;

drop policy if exists "Authenticated can read purchasing places" on public.purchasing_places;
drop policy if exists "Admins can write purchasing places" on public.purchasing_places;

create policy "Authenticated can read purchasing places"
  on public.purchasing_places for select to authenticated using (true);

create policy "Admins can write purchasing places"
  on public.purchasing_places for all to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );
