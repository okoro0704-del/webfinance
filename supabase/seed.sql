-- Seed Money Movement / Parcel Movement SKUs
insert into public.products (sku, name, description, wholesale_unit_price, provision_base_url, metadata)
values
  (
    'PRODUCT_A',
    'Money Movement',
    'Money Movement (mm.webfinance.app)',
    49.00,
    'https://mm.webfinance.app',
    '{"host":"mm.webfinance.app","handshake_path":"/api/v1/tenants/provision","short_code":"MM"}'::jsonb
  ),
  (
    'PRODUCT_B',
    'Parcel Movement',
    'Parcel Movement (pm.webfinance.app)',
    79.00,
    'https://pm.webfinance.app',
    '{"host":"pm.webfinance.app","handshake_path":"/api/v1/tenants/provision","short_code":"PM"}'::jsonb
  )
on conflict (sku) do update
set
  name = excluded.name,
  description = excluded.description,
  provision_base_url = excluded.provision_base_url,
  metadata = excluded.metadata;
