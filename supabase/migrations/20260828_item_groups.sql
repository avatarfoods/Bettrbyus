-- Interchangeable item groups.
--
-- One ingredient is often bought under several item numbers - different
-- vendor, different spec, different pack size. When the preferred one is
-- short, the plant substitutes. Today that knowledge lives in people's heads.
--
-- The pack size is what makes substitution safe: within one family the same
-- ingredient arrives as a 44 lb pail, a 20 L bag and a 2,204 lb tote. Swapping
-- case-for-case would order forty times too much, so members are compared in
-- a common unit and every member records how much of it one purchase unit
-- holds.
--
-- Membership is chosen by hand, never inferred from the item code. Dash
-- suffixes look like families but are not always interchangeable -
-- 220096-1 and 220096-2 are a box TOP and a box BOTTOM, used together.

create table if not exists public.item_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  /** Unit members are compared in, e.g. LB. */
  uom text not null default 'LB',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table if not exists public.item_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.item_groups (id) on delete cascade,
  material_id uuid not null references public.purchasing_materials (id) on delete cascade,
  /** How much of the group's uom one purchase unit holds. Null blocks substitution. */
  pack_size numeric,
  /** Preference order: 1 is taken first, then 2, and so on. */
  rank integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  -- An item belongs to a group once. Two rows would double-count its stock.
  unique (group_id, material_id)
);

create index if not exists item_group_members_group_idx
  on public.item_group_members (group_id, rank);

create index if not exists item_group_members_material_idx
  on public.item_group_members (material_id);

alter table public.item_groups enable row level security;
alter table public.item_group_members enable row level security;

drop policy if exists "Authenticated can read item groups" on public.item_groups;
drop policy if exists "Admins can write item groups" on public.item_groups;
drop policy if exists "Authenticated can read item group members" on public.item_group_members;
drop policy if exists "Admins can write item group members" on public.item_group_members;

create policy "Authenticated can read item groups"
  on public.item_groups for select to authenticated using (true);

create policy "Admins can write item groups"
  on public.item_groups for all to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

create policy "Authenticated can read item group members"
  on public.item_group_members for select to authenticated using (true);

create policy "Admins can write item group members"
  on public.item_group_members for all to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );
