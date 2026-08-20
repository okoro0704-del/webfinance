-- Partner portals: d1.webfinance.app … d100.webfinance.app
-- Tenant portals: {slug}.webfinance.app (same pattern for MM and PM)

-- Product bases all use apex (slug is under webfinance.app)
update public.products
set
  client_portal_base_domain = 'webfinance.app',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('host', 'webfinance.app');

-- Rename partner subdomains distributorN → dN
update public.distributors
set subdomain = 'd' || subdomain_slot::text || '.webfinance.app'
where coalesce(is_master, false) = false
  and subdomain_slot is not null;

create or replace function public.assign_distributor_subdomain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot integer;
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.role = 'platform_admin'
  ) into v_is_admin;

  if coalesce(new.is_master, false) or v_is_admin then
    new.is_master := true;
    new.subdomain_slot := null;
    new.subdomain := null;
    return new;
  end if;

  if new.subdomain_slot is null or new.subdomain is null
     or new.subdomain like 'distributor%.webfinance.app' then
    v_slot := coalesce(new.subdomain_slot, public.next_distributor_subdomain_slot());
    new.subdomain_slot := v_slot;
    new.subdomain := 'd' || v_slot::text || '.webfinance.app';
  end if;
  return new;
end;
$$;

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
  v_parent constant text := 'webfinance.app';
begin
  -- Always assign/refresh managed portal under apex (ignore product mm/pm bases)
  if new.portal_hostname is null
     or new.portal_hostname = ''
     or new.portal_hostname like '%.mm.webfinance.app'
     or new.portal_hostname like '%.pm.webfinance.app' then

    v_base := lower(regexp_replace(coalesce(new.slug, 'tenant'), '[^a-z0-9-]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then
      v_base := 'tenant';
    end if;

    -- Avoid reserved labels used by platform / partners
    if v_base in (
      'www', 'mm', 'pm', 'app', 'apps', 'mail', 'send', 'inbound', 'api', 'cdn', 'edge',
      'distributor1', 'distributor2', 'distributor3'
    ) or v_base ~ '^d[0-9]+$' or v_base ~ '^distributor[0-9]+$' then
      v_base := v_base || '-tenant';
    end if;

    loop
      v_host := case
        when v_n = 0 then v_base || '.' || v_parent
        else v_base || '-' || v_n::text || '.' || v_parent
      end;

      exit when not exists (
        select 1 from public.clients c
        where c.portal_hostname = v_host
          and c.id is distinct from new.id
      )
      and not exists (
        select 1 from public.clients c2
        where c2.custom_domain = v_host
          and c2.id is distinct from new.id
      )
      and not exists (
        select 1 from public.distributors d
        where d.subdomain = v_host
      );

      v_n := v_n + 1;
      if v_n > 200 then
        raise exception 'Could not allocate portal hostname for slug %', new.slug;
      end if;
    end loop;

    new.portal_hostname := v_host;

    if new.custom_domain is null
       or new.custom_domain = ''
       or new.custom_domain like '%.webfinance.app' then
      new.custom_domain := v_host;
    end if;
  end if;

  return new;
end;
$$;

-- Rebuild existing tenant portals → slug.webfinance.app
do $$
declare
  r record;
  v_host text;
  v_base text;
  v_n integer;
begin
  for r in
    select c.id, c.slug, c.custom_domain, c.credentials_payload
    from public.clients c
    order by c.created_at asc
  loop
    v_base := lower(regexp_replace(coalesce(r.slug, 'tenant'), '[^a-z0-9-]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then v_base := 'tenant'; end if;
    if v_base in (
      'www', 'mm', 'pm', 'app', 'apps', 'mail', 'send', 'inbound', 'api', 'cdn', 'edge'
    ) or v_base ~ '^d[0-9]+$' or v_base ~ '^distributor[0-9]+$' then
      v_base := v_base || '-tenant';
    end if;

    v_n := 0;
    loop
      v_host := case when v_n = 0 then v_base || '.webfinance.app'
                     else v_base || '-' || v_n::text || '.webfinance.app' end;
      exit when not exists (
        select 1 from public.clients where portal_hostname = v_host and id <> r.id
      )
      and not exists (
        select 1 from public.distributors where subdomain = v_host
      );
      v_n := v_n + 1;
    end loop;

    update public.clients
    set
      portal_hostname = v_host,
      custom_domain = case
        when custom_domain is null
          or custom_domain = ''
          or custom_domain like '%.webfinance.app'
        then v_host
        else custom_domain
      end,
      credentials_payload = case
        when credentials_payload is null then credentials_payload
        else credentials_payload
          || jsonb_build_object(
            'portal_url', 'https://' || v_host,
            'website', 'https://' || v_host,
            'access_url', coalesce(
              nullif(credentials_payload->>'access_url', ''),
              'https://' || v_host
            )
          )
      end
    where id = r.id;
  end loop;
end;
$$;
