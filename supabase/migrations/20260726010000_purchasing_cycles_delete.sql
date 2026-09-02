-- Allow deleting purchase week tabs (cycles). Lines cascade via FK.
drop policy if exists "Authenticated users can delete purchasing_cycles" on public.purchasing_cycles;

create policy "Authenticated users can delete purchasing_cycles"
  on public.purchasing_cycles for delete to authenticated using (true);
