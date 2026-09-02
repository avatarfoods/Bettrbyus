alter table public.movings drop constraint if exists movings_status_check;

alter table public.movings
  add constraint movings_status_check
  check (
    status is null
    or status in (
      'draft',
      'pending',
      'in_progress',
      'completed',
      'cancelled',
      'available',
      'removed'
    )
  );

update public.movings
set status = 'available'
where direction = 'in'
  and moved_at is null
  and status = 'completed';

update public.movings
set status = 'removed'
where moved_at is not null
  and status = 'completed';
