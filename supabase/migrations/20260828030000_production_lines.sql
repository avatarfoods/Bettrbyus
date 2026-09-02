-- Production lines and departments, configurable in the app.
--
-- Until now the three product lines and the Odoo category each one pulls from
-- were hard-coded. They are business configuration, not code: adding a line or
-- pointing Pizza Cupcake at a different category should not need a deploy.
--
-- The shape mirrors Odoo's warehouse/location idea - a line is the container,
-- departments belong to one.

create table if not exists public.production_lines (
  id uuid primary key default gen_random_uuid(),
  -- Stable slug used in URLs and tab state; renaming the label must not break
  -- a bookmarked tab.
  key text not null unique,
  name text not null,
  /** Odoo product.category id this line's finished goods live under. */
  odoo_category_id integer,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  line_id uuid references public.production_lines (id) on delete set null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_departments_line_idx
  on public.production_departments (line_id, sort_order);

-- Seed with what the code assumed, so nothing changes on the day this runs.
insert into public.production_lines (key, name, odoo_category_id, sort_order)
values
  ('bettr-bowl', 'Bettr Bowl', 80, 1),
  ('pita', 'Pita', 79, 2),
  ('pizza-cupcake', 'Pizza Cupcake', 85, 3)
on conflict (key) do nothing;

-- Every department in the workbook today belongs to Bettr Bowl. Pita and
-- Pizza Cupcake get their own once those lines are entered.
insert into public.production_departments (name, line_id, sort_order)
select d.name, l.id, d.ord
from (values
    ('FINISHED PRODUCT', 1),
    ('ASSEMBLY', 2),
    ('FRESH MIXING', 3),
    ('MAIN KITCHEN AM', 4),
    ('MAIN KITCHEN PM', 5),
    ('GARDE MANGER', 6),
    ('PRODUCE', 7)
  ) as d(name, ord)
cross join (select id from public.production_lines where key = 'bettr-bowl') as l
on conflict (name) do nothing;

alter table public.production_lines enable row level security;
alter table public.production_departments enable row level security;

drop policy if exists "Authenticated can read production lines" on public.production_lines;
drop policy if exists "Admins can write production lines" on public.production_lines;
drop policy if exists "Authenticated can read production departments" on public.production_departments;
drop policy if exists "Admins can write production departments" on public.production_departments;

create policy "Authenticated can read production lines"
  on public.production_lines for select to authenticated using (true);

create policy "Admins can write production lines"
  on public.production_lines for all to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

create policy "Authenticated can read production departments"
  on public.production_departments for select to authenticated using (true);

create policy "Admins can write production departments"
  on public.production_departments for all to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );
