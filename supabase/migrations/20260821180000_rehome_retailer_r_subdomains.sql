-- Re-home software retailers still on dN/distributorN portals onto free rN slots.
-- INSERT-only subdomain trigger does not fire on UPDATE, so assign explicitly.

with needs as (
  select d.id, d.created_at
  from public.distributors d
  where coalesce(d.is_master, false) = false
    and coalesce(d.partner_tier, 'distributor') = 'software_retailer'
    and (
      d.subdomain is null
      or d.subdomain ~ '^d[0-9]+\.webfinance\.app$'
      or d.subdomain like 'distributor%.webfinance.app'
    )
),
used_slots as (
  select d.subdomain_slot as slot
  from public.distributors d
  where coalesce(d.is_master, false) = false
    and coalesce(d.partner_tier, 'distributor') = 'software_retailer'
    and d.subdomain_slot is not null
    and d.subdomain ~ '^r[0-9]+\.webfinance\.app$'
),
free as (
  select s as slot
  from generate_series(1, 100) as s
  where not exists (select 1 from used_slots u where u.slot = s)
  order by s
),
assigned as (
  select
    n.id,
    f.slot,
    row_number() over (order by n.created_at, n.id) as rn
  from needs n
  join lateral (
    select slot from free
    offset (select count(*) from needs n2 where n2.created_at < n.created_at
            or (n2.created_at = n.created_at and n2.id < n.id))
    limit 1
  ) f on true
)
update public.distributors d
set
  subdomain_slot = a.slot,
  subdomain = 'r' || a.slot::text || '.webfinance.app'
from assigned a
where d.id = a.id;
