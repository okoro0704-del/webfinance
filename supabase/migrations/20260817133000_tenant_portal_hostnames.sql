-- Tenant portal hostnames: {slug}.webfinance.app (own-website feel)

alter table public.clients
  add column if not exists portal_hostname text;

create unique index if not exists clients_portal_hostname_uidx
  on public.clients (portal_hostname)
  where portal_hostname is not null;

create or replace function public.assign_client_portal_hostname()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host text;
  v_base text;
  v_n integer := 0;
begin
  if new.portal_hostname is null or new.portal_hostname = '' then
    v_base := lower(regexp_replace(coalesce(new.slug, 'tenant'), '[^a-z0-9-]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then
      v_base := 'tenant';
    end if;

    loop
      v_host := case
        when v_n = 0 then v_base || '.webfinance.app'
        else v_base || '-' || v_n::text || '.webfinance.app'
      end;

      exit when not exists (
        select 1 from public.clients c
        where c.portal_hostname = v_host
          and c.id is distinct from new.id
      )
      and (
        new.custom_domain is distinct from v_host
        or not exists (
          select 1 from public.clients c2
          where c2.custom_domain = v_host
            and c2.id is distinct from new.id
        )
      );

      v_n := v_n + 1;
      if v_n > 200 then
        raise exception 'Could not allocate portal hostname for slug %', new.slug;
      end if;
    end loop;

    new.portal_hostname := v_host;

    -- Default custom_domain to managed portal so Deploy / handshake use it
    if new.custom_domain is null or new.custom_domain = '' then
      new.custom_domain := v_host;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists clients_assign_portal_trg on public.clients;
create trigger clients_assign_portal_trg
before insert on public.clients
for each row execute function public.assign_client_portal_hostname();

-- Backfill existing clients
do $$
declare
  r record;
  v_host text;
  v_base text;
  v_n integer;
begin
  for r in
    select id, slug from public.clients
    where portal_hostname is null
    order by created_at asc
  loop
    v_base := lower(regexp_replace(coalesce(r.slug, 'tenant'), '[^a-z0-9-]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then v_base := 'tenant'; end if;
    v_n := 0;
    loop
      v_host := case when v_n = 0 then v_base || '.webfinance.app'
                     else v_base || '-' || v_n::text || '.webfinance.app' end;
      exit when not exists (select 1 from public.clients where portal_hostname = v_host);
      v_n := v_n + 1;
    end loop;

    update public.clients
    set
      portal_hostname = v_host,
      custom_domain = coalesce(nullif(custom_domain, ''), v_host)
    where id = r.id;
  end loop;
end;
$$;
