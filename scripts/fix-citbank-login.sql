-- Point CIT BANK admin profile + tenant owner at dedicated auth user

UPDATE mm.profiles
SET
  user_id = 'b1fdcf79-6aa7-40ee-b55c-8fde8391f7f1',
  email = 'citbankadmin@citbankplc.webfinance.app',
  handoff_temp_password = 'xFY7AQWjx7A#DC',
  updated_at = now()
WHERE id = '18e548e8-5922-4c1b-821b-a467396f57cc'
  AND username = 'citbankadmin';

UPDATE mm.tenants
SET
  owner_user_id = 'b1fdcf79-6aa7-40ee-b55c-8fde8391f7f1',
  handoff_temp_password = 'xFY7AQWjx7A#DC',
  handoff_admin_username = 'citbankadmin',
  admin_login_enabled = true,
  updated_at = now()
WHERE id = '184fb28c-5056-4bf9-9d89-24e3360dbc79';

UPDATE public.clients
SET
  credentials_payload = coalesce(credentials_payload, '{}'::jsonb) || jsonb_build_object(
    'admin_email', 'citbankadmin@citbankplc.webfinance.app',
    'admin_username', 'citbankadmin',
    'temporary_password', 'xFY7AQWjx7A#DC',
    'access_url', 'https://citbankplc.webfinance.app/login',
    'client_login_url', 'https://citbankplc.webfinance.app/login',
    'portal_url', 'https://citbankplc.webfinance.app',
    'password_fixed_at', now()
  ),
  portal_hostname = 'citbankplc.webfinance.app',
  updated_at = now()
WHERE id = '0d00df59-fe4c-4596-8c9f-d6d4da89330b';

SELECT mm.resolve_login_email('citbankadmin', 'citbankplc') AS resolved;

SELECT p.username, p.email, p.user_id, t.owner_user_id, t.subdomain
FROM mm.profiles p
JOIN mm.tenants t ON t.id = p.tenant_id
WHERE p.username = 'citbankadmin';
