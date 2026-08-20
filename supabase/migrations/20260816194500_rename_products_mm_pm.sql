-- Rename Product A/B → Money Movement / Parcel Movement and attach hosts

update public.products
set
  name = 'Money Movement',
  description = 'Money Movement (mm.webfinance.app)',
  provision_base_url = 'https://mm.webfinance.app',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'host', 'mm.webfinance.app',
    'handshake_path', '/api/v1/tenants/provision',
    'short_code', 'MM'
  )
where sku = 'PRODUCT_A';

update public.products
set
  name = 'Parcel Movement',
  description = 'Parcel Movement (pm.webfinance.app)',
  provision_base_url = 'https://pm.webfinance.app',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'host', 'pm.webfinance.app',
    'handshake_path', '/api/v1/tenants/provision',
    'short_code', 'PM'
  )
where sku = 'PRODUCT_B';
