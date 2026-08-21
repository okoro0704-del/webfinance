-- Public brand lookup for partner portal hosts (login white-label).

create or replace function public.public_partner_brand_by_host(p_host text)
returns table (
  company_name text,
  partner_tier public.partner_tier,
  subdomain text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host text;
begin
  v_host := lower(trim(both from coalesce(p_host, '')));
  v_host := split_part(v_host, ':', 1);
  if v_host = '' then
    return;
  end if;

  return query
  select d.company_name, d.partner_tier, d.subdomain
  from public.distributors d
  where coalesce(d.is_master, false) = false
    and d.status = 'active'
    and (
      lower(d.subdomain) = v_host
      or lower(coalesce(d.custom_domain, '')) = v_host
    )
  limit 1;
end;
$$;

grant execute on function public.public_partner_brand_by_host(text) to anon, authenticated, service_role;
