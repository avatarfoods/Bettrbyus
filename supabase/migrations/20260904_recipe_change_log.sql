-- A simple, admin-only record of who changed a recipe and when.
--
-- Not a diff/versioning system - just a chronological log of "who saved
-- what, roughly" for future reference. Each save action writes one row with
-- a short human summary; nothing here is meant to be replayed or restored.

create table if not exists public.recipe_change_log (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.purchasing_recipes(id) on delete set null,
  changed_by uuid,
  changed_by_name text,
  summary text not null,
  changed_at timestamptz not null default now()
);

create index if not exists recipe_change_log_recipe_id_idx
  on public.recipe_change_log (recipe_id, changed_at desc);

alter table public.recipe_change_log enable row level security;

drop policy if exists "Admins can read recipe change log" on public.recipe_change_log;
drop policy if exists "Admins can write recipe change log" on public.recipe_change_log;

create policy "Admins can read recipe change log"
  on public.recipe_change_log for select to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

create policy "Admins can write recipe change log"
  on public.recipe_change_log for insert to authenticated
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );
