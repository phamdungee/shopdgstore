create extension if not exists pgcrypto;

create table if not exists public.webhook_histories (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'casso',
  webhook_id text,
  request_id text,
  status text not null,
  reason text,
  endpoint text,
  http_status integer,
  transaction_count integer check (transaction_count is null or transaction_count >= 0),
  processed_count integer check (processed_count is null or processed_count >= 0),
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists webhook_histories_provider_webhook_idx
  on public.webhook_histories (provider, webhook_id);
create index if not exists webhook_histories_request_idx
  on public.webhook_histories (request_id);
create index if not exists webhook_histories_status_created_idx
  on public.webhook_histories (status, created_at desc);

alter table public.webhook_histories enable row level security;
revoke all on table public.webhook_histories from anon, authenticated;
grant all on table public.webhook_histories to service_role;

comment on table public.webhook_histories is
  'Lịch sử nhận và xử lý webhook. Chỉ backend service_role được phép đọc/ghi.';
