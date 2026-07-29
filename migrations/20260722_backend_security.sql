create extension if not exists pgcrypto;

create table if not exists public.image_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  object_key text not null unique,
  public_url text not null unique,
  purpose text not null check (purpose in ('avatars','products','banners','categories')),
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists image_assets_owner_idx on public.image_assets(owner_id, created_at desc) where deleted_at is null;

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  request_ip text,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_tokens_user_idx on public.password_reset_tokens(user_id);

alter table public.store_orders add column if not exists completed_at timestamptz;
update public.store_orders set completed_at = created_at where status = 'completed' and completed_at is null;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  order_id text,
  type text not null default 'support' check (type in ('support','warranty')),
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_active_warranty_per_order on public.support_tickets(user_id, order_id)
  where type = 'warranty' and status in ('open','in_progress');
create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);

alter table public.image_assets enable row level security;
alter table public.password_reset_tokens enable row level security;
alter table public.support_tickets enable row level security;
-- These tables are intentionally service-role-only. The Express API enforces ownership.
