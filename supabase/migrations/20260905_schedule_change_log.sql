-- Who changed the live production plan, and when.
--
-- production_schedules.confirmed_by/confirmed_at is a partial trail today,
-- but discardDraft/discardAllDrafts delete those rows, so it cannot be
-- relied on afterwards. This log outlives them: one row per confirm into
-- live, kept for reference. Same shape as recipe_change_log.

create table if not exists public.schedule_change_log (
  id uuid primary key default gen_random_uuid(),
  -- The live schedule that was changed, and the draft it was merged from.
  schedule_id uuid references public.production_schedules(id) on delete set null,
  draft_id uuid,
  line_id uuid references public.production_lines(id) on delete set null,
  line_name text,
  changed_by uuid,
  changed_by_name text,
  summary text not null,
  changed_at timestamptz not null default now()
);

create index if not exists schedule_change_log_changed_at_idx
  on public.schedule_change_log (changed_at desc);

alter table public.schedule_change_log enable row level security;

drop policy if exists "Admins can read schedule change log" on public.schedule_change_log;
drop policy if exists "Signed in can write schedule change log" on public.schedule_change_log;

create policy "Admins can read schedule change log"
  on public.schedule_change_log for select to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

-- Anyone who is allowed to confirm a plan writes their own row. Confirming
-- is already owner-or-admin gated in confirmDraft; the log must not be the
-- thing that refuses, or a confirm would succeed unrecorded.
create policy "Signed in can write schedule change log"
  on public.schedule_change_log for insert to authenticated
  with check (true);
