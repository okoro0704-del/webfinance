-- Distributor custom-domain automation fields (mirror clients)
alter table public.distributors
  add column if not exists cloudflare_zone_id text,
  add column if not exists cloudflare_record_ids jsonb not null default '[]'::jsonb,
  add column if not exists ssl_status text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
