-- Distributor-owned custom domain (they connect/buy — not master)

alter table public.distributors
  add column if not exists custom_domain text,
  add column if not exists domain_status public.domain_status not null default 'none';

create unique index if not exists distributors_custom_domain_uidx
  on public.distributors (custom_domain)
  where custom_domain is not null;
