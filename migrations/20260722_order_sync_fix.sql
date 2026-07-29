-- Required for precise warranty timestamps and backward-compatible order sync.
alter table public.store_orders
  add column if not exists completed_at timestamptz;

update public.store_orders
set completed_at = created_at
where status = 'completed' and completed_at is null;

create index if not exists store_orders_user_created_idx
  on public.store_orders(user_id, created_at desc);

create index if not exists store_orders_status_completed_idx
  on public.store_orders(status, completed_at desc)
  where status = 'completed';

comment on column public.store_orders.completed_at is
  'Server timestamp when fulfillment completed; used by revenue and warranty analytics.';
