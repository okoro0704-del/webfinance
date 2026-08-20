-- Move Miami (PM) under Master so one inbox owns all imported tenants.
update public.clients
set distributor_id = 'e39d8452-cb3f-4528-97d9-e9235d6b485d',
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reassigned_to_master', true)
where slug = 'miamisecurity';

-- Credits for Parcel Movement on Master
select public.allocate_inventory_credits(
  'e39d8452-cb3f-4528-97d9-e9235d6b485d'::uuid,
  'c43199b3-255f-405f-8b4a-d3836ccdf467'::uuid,
  20
);

select c.slug, c.display_name, p.sku, d.company_name as distributor, c.status,
       c.credentials_payload->>'client_login_url' as login_url
from public.clients c
join public.products p on p.id = c.product_id
join public.distributors d on d.id = c.distributor_id
where d.id = 'e39d8452-cb3f-4528-97d9-e9235d6b485d'
order by p.sku, c.slug;
