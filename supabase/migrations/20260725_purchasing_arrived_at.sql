-- Actual arrival timestamp when a buy line is marked Arrived.
-- arrival_date remains the expected arrival (ETA).
alter table public.purchasing_lines
  add column if not exists arrived_at timestamptz;
