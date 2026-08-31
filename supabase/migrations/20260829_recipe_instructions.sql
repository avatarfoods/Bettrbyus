-- Instructions, per recipe, as numbered steps.
--
-- Today these live in the workbook and on the printed batch sheet, which
-- means the sheet on the floor and the recipe in the system can disagree and
-- nobody finds out until a batch is wrong. Holding them here makes the sheet
-- a rendering of the recipe rather than a separate document.
--
-- Deliberately plain text per step rather than one rich-text blob: steps are
-- numbered on the printed sheet, checked off by hand, and referred to by
-- number ("stuck on 4"), so the number has to be real data.

create table if not exists public.recipe_instructions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null
    references public.purchasing_recipes (id) on delete cascade,
  /** 1-based, and what gets printed. Gaps are allowed; ties are not. */
  step_number integer not null,
  body text not null,
  /** Optional operational detail printed beside the step. */
  target_temp text,
  target_time text,
  equipment text,
  /** A step the supervisor signs off, e.g. a CCP. */
  requires_signoff boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  unique (recipe_id, step_number)
);

create index if not exists recipe_instructions_recipe_idx
  on public.recipe_instructions (recipe_id, step_number);

alter table public.recipe_instructions enable row level security;

drop policy if exists "Authenticated can read instructions" on public.recipe_instructions;
drop policy if exists "Admins can write instructions" on public.recipe_instructions;

create policy "Authenticated can read instructions"
  on public.recipe_instructions for select to authenticated using (true);

create policy "Admins can write instructions"
  on public.recipe_instructions for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  );


-- ------------------------------------------------------------
-- The rest of what a step carries.
--
-- A printed line of prose is not enough for the floor. Each step also says
-- which stage of the recipe it belongs to, which machine runs it and at what
-- setting, what the operator must record before moving on, the limit that
-- cannot be missed and what to do when it is, and what is dangerous about it.
--
-- The equipment KIND decides which of the machine fields mean anything: a
-- continuous line has units per hour, a mixer has forward/back/cycles, a
-- cutter has a blade set-up. Storing them all on one row and showing only the
-- relevant ones keeps a step a step, rather than four different tables.

alter table public.recipe_instructions
  add column if not exists stage text,
  add column if not exists body_es text,
  add column if not exists equipment_kind text
    check (equipment_kind is null
           or equipment_kind in ('cooking', 'mixing', 'line', 'cutting', 'other')),
  add column if not exists setting text,
  add column if not exists batch_size text,
  add column if not exists crew_role text,

  -- Continuous line
  add column if not exists units_per_hour numeric,
  add column if not exists weight_per_unit text,

  -- Mixing
  add column if not exists turn_forward_seconds numeric,
  add column if not exists turn_back_seconds numeric,
  add column if not exists cycles integer,
  add column if not exists speed text,

  -- Cutting / prep
  add column if not exists cut_spec text,
  add column if not exists pounds_per_hour numeric,

  -- What the operator must do before the batch moves on
  add column if not exists check_weigh boolean not null default false,
  add column if not exists check_temperature boolean not null default false,
  add column if not exists check_photo boolean not null default false,
  add column if not exists check_metal_detector boolean not null default false,
  add column if not exists check_label boolean not null default false,

  -- The limit that cannot be missed, and the fix when it is
  add column if not exists critical_limit text,
  add column if not exists corrective_action text,

  -- Shown in amber on the floor card
  add column if not exists safety_note text;

comment on column public.recipe_instructions.stage is
  'PREP, COOK, COOL, MIX, FILL, SEAL, PACK and so on - the phase of the recipe.';

comment on column public.recipe_instructions.equipment_kind is
  'Decides which machine fields apply. Null means none of them do.';

comment on column public.recipe_instructions.critical_limit is
  'A limit that must be met, e.g. 165 F for 15 seconds. Prints boxed.';
