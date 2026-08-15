-- Seed Product A / Product B SKUs
insert into public.products (sku, name, description, wholesale_unit_price, metadata)
values
  (
    'PRODUCT_A',
    'Product A',
    'Primary SaaS product (Repo 1)',
    49.00,
    '{"repo":"repo1","handshake_path":"/api/v1/tenants/provision"}'::jsonb
  ),
  (
    'PRODUCT_B',
    'Product B',
    'Secondary SaaS product (Repo 2)',
    79.00,
    '{"repo":"repo2","handshake_path":"/api/v1/tenants/provision"}'::jsonb
  )
on conflict (sku) do nothing;
