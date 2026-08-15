-- =============================================================================
-- Project 3 — Master Distributor Control Panel
-- Supabase PostgreSQL Schema (products A/B, wallets, tenants, provisioning)
-- Scale profile: ≤100 distributors, high client volume
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.distributor_status as enum ('pending', 'active', 'suspended');
create type public.client_status as enum (
  'draft',
  'validating',
  'provisioning',
  'active',
  'failed',
  'suspended',
  'cancelled'
);
create type public.domain_status as enum (
  'none',
  'purchasing',
  'purchased',
  'dns_pending',
  'dns_ready',
  'ssl_pending',
  'live',
  'failed'
);
create type public.ledger_entry_type as enum (
  'topup',
  'wholesale_purchase',
  'license_debit',
  'refund',
  'adjustment'
);
create type public.invoice_status as enum (
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible'
);
create type public.provision_step as enum (
  'wallet_validation',
  'license_debit',
  'domain_registration',
  'dns_setup',
  'ssl_init',
  'tenant_handshake',
  'finalize'
);
create type public.provision_job_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'rolled_back'
);
create type public.app_role as enum ('platform_admin', 'distributor');

-- ---------------------------------------------------------------------------
-- Profiles / roles (maps auth.users → app identity)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.app_role not null default 'distributor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Products / SKUs (Product A, Product B)
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  -- Wholesale unit cost charged against distributor wallet on deploy
  wholesale_unit_price numeric(12, 2) not null check (wholesale_unit_price >= 0),
  -- Optional pointer to Repo 1 / Repo 2 provisioning base URL (override via secrets)
  provision_base_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Distributors (hard-capped at 100 active rows via trigger)
-- ---------------------------------------------------------------------------
create table public.distributors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  company_name text not null,
  contact_email text not null,
  status public.distributor_status not null default 'pending',
  -- Cached wallet balance (source of truth is ledger; cache kept consistent by RPC)
  wallet_balance numeric(14, 2) not null default 0 check (wallet_balance >= 0),
  currency char(3) not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index distributors_status_idx on public.distributors (status);

create or replace function public.enforce_distributor_cap()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if new.status = 'active' then
    select count(*) into active_count
    from public.distributors
    where status = 'active'
      and id is distinct from new.id;

    if active_count >= 100 then
      raise exception 'Distributor cap exceeded: max 100 active distributors';
    end if;
  end if;
  return new;
end;
$$;

create trigger distributors_cap_trg
before insert or update of status on public.distributors
for each row execute function public.enforce_distributor_cap();

-- Prepaid license inventory pools per product (hot path for deploy)
create table public.distributor_inventory (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  -- Prepaid license slots available for zero-touch deploy
  license_credits integer not null default 0 check (license_credits >= 0),
  -- Lifetime counters (analytics / audits; cheap integer updates)
  licenses_allocated integer not null default 0 check (licenses_allocated >= 0),
  licenses_consumed integer not null default 0 check (licenses_consumed >= 0),
  updated_at timestamptz not null default now(),
  unique (distributor_id, product_id)
);

-- Partial index: only rows with remaining credits (deploy hot path)
create index distributor_inventory_available_idx
  on public.distributor_inventory (distributor_id, product_id)
  where license_credits > 0;

-- ---------------------------------------------------------------------------
-- Clients / Tenants (high volume — indexed by distributor + status)
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  display_name text not null,
  slug text not null,
  status public.client_status not null default 'draft',
  -- Domain automation fields
  custom_domain text,
  domain_status public.domain_status not null default 'none',
  cloudflare_zone_id text,
  cloudflare_record_ids jsonb not null default '[]'::jsonb,
  ssl_status text,
  -- Tenant handshake results (credentials encrypted at rest by app/edge; store opaque)
  external_tenant_id text,
  credentials_payload jsonb,
  provision_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (distributor_id, slug),
  unique (custom_domain)
);

create index clients_distributor_created_idx
  on public.clients (distributor_id, created_at desc);

create index clients_status_idx on public.clients (status);
create index clients_product_idx on public.clients (product_id);

-- Optional multi-product ownership (if a client can own both A and B)
create table public.client_products (
  client_id uuid not null references public.clients (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (client_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Invoices + Wallet ledger
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors (id) on delete restrict,
  invoice_number text not null unique,
  status public.invoice_status not null default 'draft',
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  tax numeric(14, 2) not null default 0 check (tax >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  currency char(3) not null default 'USD',
  line_items jsonb not null default '[]'::jsonb,
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_distributor_idx on public.invoices (distributor_id, created_at desc);

-- Append-only ledger (source of truth for wallet)
create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors (id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  -- Positive = credit, negative = debit
  amount numeric(14, 2) not null check (amount <> 0),
  balance_after numeric(14, 2) not null check (balance_after >= 0),
  currency char(3) not null default 'USD',
  invoice_id uuid references public.invoices (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index wallet_ledger_distributor_created_idx
  on public.wallet_ledger (distributor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Provisioning jobs (idempotent deploy pipeline)
-- ---------------------------------------------------------------------------
create table public.provision_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  distributor_id uuid not null references public.distributors (id) on delete restrict,
  status public.provision_job_status not null default 'queued',
  current_step public.provision_step,
  -- Idempotency key from dashboard Deploy click
  idempotency_key text not null unique,
  attempt_count integer not null default 0,
  steps jsonb not null default '[]'::jsonb,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index provision_jobs_client_idx on public.provision_jobs (client_id, created_at desc);
create index provision_jobs_status_idx on public.provision_jobs (status)
  where status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger distributors_updated_at before update on public.distributors
for each row execute function public.set_updated_at();
create trigger distributor_inventory_updated_at before update on public.distributor_inventory
for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices
for each row execute function public.set_updated_at();
create trigger provision_jobs_updated_at before update on public.provision_jobs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth bootstrap: create profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'distributor')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper: current distributor id for RLS
-- ---------------------------------------------------------------------------
create or replace function public.current_distributor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id
  from public.distributors d
  where d.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'platform_admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Atomic deploy reservation (license OR wallet debit)
-- Prefer prepaid inventory credits; fall back to wallet wholesale price.
-- Called by Edge Function with service role inside a transaction.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_deploy_license(
  p_distributor_id uuid,
  p_client_id uuid,
  p_product_id uuid,
  p_actor uuid default null
)
returns table (
  debit_mode text,
  amount_debited numeric,
  inventory_remaining integer,
  wallet_remaining numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_price numeric(12, 2);
  v_balance numeric(14, 2);
  v_new_balance numeric(14, 2);
begin
  -- Lock distributor + inventory rows to prevent double-deploy races
  select wallet_balance into v_balance
  from public.distributors
  where id = p_distributor_id
  for update;

  if not found then
    raise exception 'Distributor not found';
  end if;

  select wholesale_unit_price into v_price
  from public.products
  where id = p_product_id and is_active = true;

  if not found then
    raise exception 'Product not found or inactive';
  end if;

  insert into public.distributor_inventory (distributor_id, product_id, license_credits)
  values (p_distributor_id, p_product_id, 0)
  on conflict (distributor_id, product_id) do nothing;

  select license_credits into v_credits
  from public.distributor_inventory
  where distributor_id = p_distributor_id and product_id = p_product_id
  for update;

  if v_credits > 0 then
    update public.distributor_inventory
    set license_credits = license_credits - 1,
        licenses_consumed = licenses_consumed + 1
    where distributor_id = p_distributor_id and product_id = p_product_id
    returning license_credits into v_credits;

    return query select
      'inventory'::text,
      0::numeric,
      v_credits,
      v_balance;
    return;
  end if;

  if v_balance < v_price then
    raise exception 'Insufficient license credits and wallet balance (need %, have %)',
      v_price, v_balance;
  end if;

  v_new_balance := v_balance - v_price;

  update public.distributors
  set wallet_balance = v_new_balance
  where id = p_distributor_id;

  update public.distributor_inventory
  set licenses_consumed = licenses_consumed + 1
  where distributor_id = p_distributor_id and product_id = p_product_id;

  insert into public.wallet_ledger (
    distributor_id, entry_type, amount, balance_after,
    client_id, product_id, description, created_by
  ) values (
    p_distributor_id, 'license_debit', -v_price, v_new_balance,
    p_client_id, p_product_id, 'Deploy license debit', p_actor
  );

  return query select
    'wallet'::text,
    v_price,
    0,
    v_new_balance;
end;
$$;

-- Wallet top-up helper (platform admin / paid invoice webhook)
create or replace function public.credit_distributor_wallet(
  p_distributor_id uuid,
  p_amount numeric,
  p_entry_type public.ledger_entry_type default 'topup',
  p_invoice_id uuid default null,
  p_description text default null,
  p_actor uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance numeric(14, 2);
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  update public.distributors
  set wallet_balance = wallet_balance + p_amount
  where id = p_distributor_id
  returning wallet_balance into v_new_balance;

  if not found then
    raise exception 'Distributor not found';
  end if;

  insert into public.wallet_ledger (
    distributor_id, entry_type, amount, balance_after,
    invoice_id, description, created_by
  ) values (
    p_distributor_id, p_entry_type, p_amount, v_new_balance,
    p_invoice_id, coalesce(p_description, 'Wallet credit'), p_actor
  );

  return v_new_balance;
end;
$$;

-- Allocate prepaid inventory credits
create or replace function public.allocate_inventory_credits(
  p_distributor_id uuid,
  p_product_id uuid,
  p_credits integer,
  p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if p_credits <= 0 then
    raise exception 'Credits must be positive';
  end if;

  insert into public.distributor_inventory (
    distributor_id, product_id, license_credits, licenses_allocated
  ) values (
    p_distributor_id, p_product_id, p_credits, p_credits
  )
  on conflict (distributor_id, product_id) do update
  set license_credits = public.distributor_inventory.license_credits + excluded.license_credits,
      licenses_allocated = public.distributor_inventory.licenses_allocated + excluded.licenses_allocated
  returning license_credits into v_remaining;

  return v_remaining;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.distributors enable row level security;
alter table public.distributor_inventory enable row level security;
alter table public.clients enable row level security;
alter table public.client_products enable row level security;
alter table public.invoices enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.provision_jobs enable row level security;

-- Profiles
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

-- Products: readable by all authenticated; writes admin-only
create policy products_select_authenticated on public.products
  for select to authenticated
  using (is_active = true or public.is_platform_admin());

create policy products_admin_all on public.products
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Distributors
create policy distributors_select on public.distributors
  for select to authenticated
  using (profile_id = auth.uid() or public.is_platform_admin());

create policy distributors_update_own on public.distributors
  for update to authenticated
  using (profile_id = auth.uid() or public.is_platform_admin())
  with check (profile_id = auth.uid() or public.is_platform_admin());

create policy distributors_admin_insert on public.distributors
  for insert to authenticated
  with check (public.is_platform_admin() or profile_id = auth.uid());

-- Inventory
create policy inventory_select on public.distributor_inventory
  for select to authenticated
  using (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

create policy inventory_admin_write on public.distributor_inventory
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Clients
create policy clients_select on public.clients
  for select to authenticated
  using (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

create policy clients_update on public.clients
  for update to authenticated
  using (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  )
  with check (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

-- Client products
create policy client_products_select on public.client_products
  for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and (c.distributor_id = public.current_distributor_id() or public.is_platform_admin())
    )
  );

create policy client_products_write on public.client_products
  for all to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and (c.distributor_id = public.current_distributor_id() or public.is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and (c.distributor_id = public.current_distributor_id() or public.is_platform_admin())
    )
  );

-- Invoices
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

create policy invoices_admin_write on public.invoices
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Wallet ledger (append-only for distributors: select only)
create policy wallet_ledger_select on public.wallet_ledger
  for select to authenticated
  using (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

create policy wallet_ledger_admin_insert on public.wallet_ledger
  for insert to authenticated
  with check (public.is_platform_admin());

-- Provision jobs
create policy provision_jobs_select on public.provision_jobs
  for select to authenticated
  using (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

create policy provision_jobs_insert on public.provision_jobs
  for insert to authenticated
  with check (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

create policy provision_jobs_update on public.provision_jobs
  for update to authenticated
  using (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  )
  with check (
    distributor_id = public.current_distributor_id()
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, update on public.profiles to authenticated;
grant select on public.products to authenticated;
grant select, insert, update on public.distributors to authenticated;
grant select on public.distributor_inventory to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, insert, update, delete on public.client_products to authenticated;
grant select on public.invoices to authenticated;
grant select on public.wallet_ledger to authenticated;
grant select, insert, update on public.provision_jobs to authenticated;

grant execute on function public.current_distributor_id() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.reserve_deploy_license(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.credit_distributor_wallet(uuid, numeric, public.ledger_entry_type, uuid, text, uuid) to service_role;
grant execute on function public.allocate_inventory_credits(uuid, uuid, integer, uuid) to service_role;
