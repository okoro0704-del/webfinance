-- Point PRODUCT_A provision handshake at consolidated WebFinance project (mm schema functions).
update public.products
set provision_base_url = 'https://oorrwnqfnuozlqvhprgl.supabase.co/functions/v1',
    metadata = coalesce(metadata, '{}'::jsonb) || '{"handshake_path":"/distributor-provision","repo":"money-movement"}'::jsonb
where sku = 'PRODUCT_A';
