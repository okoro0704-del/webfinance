-- Import live Money Movement tenants into Webfinance CP (Master distributor).
-- Idempotent: match by slug, portal_hostname, or external_tenant_id.

do $$
declare
  v_dist uuid := 'e39d8452-cb3f-4528-97d9-e9235d6b485d'; -- Webfinance Master
  v_product uuid := '647bf647-d0c9-4f6f-81d5-c76142116105'; -- PRODUCT_A Money Movement
  r record;
  v_creds jsonb;
  v_portal text;
  v_login text;
  v_existing uuid;
begin
  for r in
    select * from (values
      (
        'cit-bankplc',
        'CIT BANK',
        '184fb28c-5056-4bf9-9d89-24e3360dbc79',
        'citbankplc',
        'okoroisreal0704@gmail.com',
        'citbankadmin',
        'xFY7AQWjx7A#DC',
        'info4citbankplc@webfinance.app',
        '/cit-bank-logo.png',
        '#004B50',
        '#C9A227'
      ),
      (
        'tbplc',
        'Truist Bank',
        'c38a7bc5-015a-4a18-828a-e54370d9ceca',
        'tbplc',
        '001mrdigital@gmail.com',
        'admin',
        '@gGsdkY@mGX#C7',
        'info4tbplc@webfinance.app',
        null,
        '#4989c5',
        '#C4A35A'
      ),
      (
        'wfplc',
        'Wells Fargo Bank',
        '1df1f76b-1883-42db-8ebb-0b6b3e5479d3',
        'wfplc',
        'mrfundzman@gmail.com',
        'myadmin',
        'EtR!Ea$fnKE@f6',
        'info4wfplc@webfinance.app',
        null,
        '#2D77D7',
        '#C9A227'
      ),
      (
        'scbplc',
        'Standard Chartered Bank',
        'c5cd5608-279f-4699-b835-7c3cbc0c66f5',
        'scbplc',
        'admin@scbplc.webfinance.app',
        'admin_scbplc',
        'Tmp-7f0885618b5e-',
        'info4scbplc@webfinance.app',
        null,
        '#3ff3d2',
        '#C9A227'
      )
    ) as t(
      slug, display_name, external_id, subdomain, admin_email, admin_username,
      temp_password, mailbox, logo_url, primary_color, accent_color
    )
  loop
    v_portal := r.slug || '.webfinance.app';
    v_login := 'https://' || r.subdomain || '.webfinance.app/login';
    v_creds := jsonb_build_object(
      'admin_email', r.admin_email,
      'admin_username', r.admin_username,
      'temporary_password', r.temp_password,
      'access_url', v_login,
      'client_login_url', v_login,
      'admin_dashboard_url', 'https://' || r.subdomain || '.webfinance.app/admin',
      'master_dashboard_url', 'https://mm.webfinance.app/master/login',
      'portal_url', 'https://' || r.subdomain || '.webfinance.app',
      'website', 'https://' || r.subdomain || '.webfinance.app',
      'brand_name', r.display_name,
      'mailbox_address', r.mailbox,
      'imported_from', 'money_movement',
      'issued_at', now()
    );

    select c.id into v_existing
    from public.clients c
    where c.distributor_id = v_dist and c.slug = r.slug
       or c.portal_hostname = v_portal
       or c.external_tenant_id = 'ten_' || r.external_id
       or c.external_tenant_id = r.external_id
    order by case when c.distributor_id = v_dist then 0 else 1 end
    limit 1;

    if v_existing is not null then
      update public.clients set
        distributor_id = v_dist,
        product_id = v_product,
        display_name = r.display_name,
        slug = r.slug,
        status = 'active',
        portal_hostname = coalesce(portal_hostname, v_portal),
        domain_status = 'live',
        external_tenant_id = 'ten_' || r.external_id,
        credentials_payload = v_creds,
        provision_error = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'imported_from', 'money_movement',
          'mm_tenant_id', r.external_id,
          'mm_subdomain', r.subdomain,
          'admin_email', r.admin_email,
          'branding', jsonb_build_object(
            'brand_name', r.display_name,
            'logo_url', r.logo_url,
            'primary_color', r.primary_color,
            'accent_color', r.accent_color
          )
        ),
        activated_at = coalesce(activated_at, now()),
        updated_at = now()
      where id = v_existing;
    else
      insert into public.clients (
        distributor_id, product_id, display_name, slug, status,
        portal_hostname, domain_status, external_tenant_id,
        credentials_payload, metadata, activated_at
      ) values (
        v_dist, v_product, r.display_name, r.slug, 'active',
        v_portal, 'live', 'ten_' || r.external_id,
        v_creds,
        jsonb_build_object(
          'imported_from', 'money_movement',
          'mm_tenant_id', r.external_id,
          'mm_subdomain', r.subdomain,
          'admin_email', r.admin_email,
          'branding', jsonb_build_object(
            'brand_name', r.display_name,
            'logo_url', r.logo_url,
            'primary_color', r.primary_color,
            'accent_color', r.accent_color
          )
        ),
        now()
      );
    end if;
  end loop;
end $$;

select public.allocate_inventory_credits(
  'e39d8452-cb3f-4528-97d9-e9235d6b485d'::uuid,
  '647bf647-d0c9-4f6f-81d5-c76142116105'::uuid,
  20
);

select slug, display_name, status, external_tenant_id, portal_hostname,
       credentials_payload->>'admin_email' as admin_email,
       credentials_payload->>'client_login_url' as login_url
from public.clients
where distributor_id = 'e39d8452-cb3f-4528-97d9-e9235d6b485d'
   or product_id = '647bf647-d0c9-4f6f-81d5-c76142116105'
order by created_at;
