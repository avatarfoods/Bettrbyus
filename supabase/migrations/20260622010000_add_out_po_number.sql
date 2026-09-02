alter table public.movings
  add column if not exists out_po_number text;

comment on column public.movings.out_po_number is
  'PO number recorded when moving out; may differ from po_number (moving in).';
