-- Repair miamisecurity branding + admin name so handshake can create a real PM tenant
update public.clients
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'admin_email', coalesce(nullif(metadata->>'admin_email',''), 'admin@miamisecurity.webfinance.app'),
    'admin_full_name', 'Miami Security Admin',
    'branding', jsonb_build_object(
      'brand_name', 'Miami Security',
      'company_name', 'Miami Security',
      'logo_url', null,
      'primary_color', '#14594c'
    )
  ),
  credentials_payload = coalesce(credentials_payload, '{}'::jsonb) || jsonb_build_object(
    'portal_url', 'https://miamisecurity.webfinance.app',
    'website', 'https://miamisecurity.webfinance.app',
    'access_url', 'https://miamisecurity.webfinance.app',
    'brand_name', 'Miami Security'
  )
where slug = 'miamisecurity';

select slug, external_tenant_id, metadata->>'admin_full_name' as admin_full_name,
  metadata->'branding'->>'brand_name' as brand
from public.clients where slug = 'miamisecurity';
