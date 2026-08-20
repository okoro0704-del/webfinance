-- PRODUCT_B still provisions via the PM Netlify app API (not Edge Functions).
-- Keep base URL on pm.webfinance.app; ensure handshake path is correct.
update public.products
set provision_base_url = 'https://pm.webfinance.app',
    metadata = coalesce(metadata, '{}'::jsonb) || '{"handshake_path":"/api/v1/tenants/provision","repo":"parcel-movement"}'::jsonb
where sku = 'PRODUCT_B';
