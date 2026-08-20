-- Auto-assign distributor1.webfinance.app … distributor100.webfinance.app

alter table public.distributors
  add column if not exists subdomain_slot integer,
  add column if not exists subdomain text;

alter table public.distributors
  drop constraint if exists distributors_subdomain_slot_check;

alter table public.distributors
  add constraint distributors_subdomain_slot_check
  check (subdomain_slot is null or (subdomain_slot >= 1 and subdomain_slot <= 100));

create unique index if not exists distributors_subdomain_slot_uidx
  on public.distributors (subdomain_slot)
  where subdomain_slot is not null;

create unique index if not exists distributors_subdomain_uidx
  on public.distributors (subdomain)
  where subdomain is not null;

create or replace function public.next_distributor_subdomain_slot()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot integer;
begin
  -- Serialize allocations under a fixed advisory lock
  perform pg_advisory_xact_lock(87236401);

  select s into v_slot
  from generate_series(1, 100) as s
  where not exists (
    select 1 from public.distributors d where d.subdomain_slot = s
  )
  order by s
  limit 1;

  if v_slot is null then
    raise exception 'No free distributor subdomain slots (max 100)';
  end if;

  return v_slot;
end;
$$;

create or replace function public.assign_distributor_subdomain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot integer;
begin
  if new.subdomain_slot is null or new.subdomain is null then
    v_slot := coalesce(new.subdomain_slot, public.next_distributor_subdomain_slot());
    new.subdomain_slot := v_slot;
    new.subdomain := coalesce(nullif(new.subdomain, ''), 'distributor' || v_slot || '.webfinance.app');
  end if;
  return new;
end;
$$;

drop trigger if exists distributors_assign_subdomain_trg on public.distributors;
create trigger distributors_assign_subdomain_trg
before insert on public.distributors
for each row execute function public.assign_distributor_subdomain();

-- Backfill existing rows in creation order
do $$
declare
  r record;
  v_slot integer := 1;
begin
  for r in
    select id from public.distributors
    where subdomain_slot is null
    order by created_at asc, id asc
  loop
    while exists (select 1 from public.distributors where subdomain_slot = v_slot) loop
      v_slot := v_slot + 1;
    end loop;
    if v_slot > 100 then
      raise exception 'Cannot backfill: exceeded 100 distributor slots';
    end if;
    update public.distributors
    set
      subdomain_slot = v_slot,
      subdomain = 'distributor' || v_slot || '.webfinance.app'
    where id = r.id;
    v_slot := v_slot + 1;
  end loop;
end;
$$;

grant execute on function public.next_distributor_subdomain_slot() to authenticated, service_role;
