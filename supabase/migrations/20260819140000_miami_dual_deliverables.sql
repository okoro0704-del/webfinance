-- Force Miami Security branding + correct dual deliverable URLs
update public.clients
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'admin_email', 'admin@miamisecurity.webfinance.app',
    'admin_full_name', 'Miami Security Admin',
    'branding', jsonb_build_object(
      'brand_name', 'Miami Security',
      'company_name', 'Miami Security',
      'logo_url', null,
      'primary_color', '#0B3D2E',
      'accent_color', '#C4A35A',
      'forced_at', now()
    )
  ),
  credentials_payload = coalesce(credentials_payload, '{}'::jsonb) || jsonb_build_object(
    'brand_name', 'Miami Security',
    'admin_email', coalesce(credentials_payload->>'admin_email', 'admin@miamisecurity.webfinance.app'),
    'access_url', 'https://miamisecurity.apps.webfinance.app/login',
    'client_login_url', 'https://miamisecurity.apps.webfinance.app/login',
    'master_dashboard_url', 'https://webfinance.app/dashboard',
    'portal_url', 'https://miamisecurity.webfinance.app',
    'website', 'https://miamisecurity.webfinance.app'
  )
where slug = 'miamisecurity';
