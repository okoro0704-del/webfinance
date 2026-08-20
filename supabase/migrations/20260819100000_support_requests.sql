-- Support / fix requests from distributors (optionally about a client) → master inbox
create type public.request_status as enum (
  'open',
  'in_progress',
  'resolved',
  'closed'
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  body text not null,
  status public.request_status not null default 'open',
  master_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists support_requests_master_inbox_idx
  on public.support_requests (status, created_at desc);

create index if not exists support_requests_distributor_idx
  on public.support_requests (distributor_id, created_at desc);

create trigger support_requests_updated_at
before update on public.support_requests
for each row execute function public.set_updated_at();

alter table public.support_requests enable row level security;

create policy support_requests_select on public.support_requests
  for select to authenticated
  using (
    public.is_platform_admin()
    or distributor_id = public.current_distributor_id()
  );

create policy support_requests_insert on public.support_requests
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and distributor_id = public.current_distributor_id()
    and not coalesce(
      (select is_master from public.distributors where id = distributor_id),
      false
    )
  );

create policy support_requests_update_master on public.support_requests
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Distributors can close their own open requests (optional soft cancel)
create policy support_requests_update_own on public.support_requests
  for update to authenticated
  using (
    distributor_id = public.current_distributor_id()
    and status in ('open', 'in_progress')
  )
  with check (
    distributor_id = public.current_distributor_id()
  );
