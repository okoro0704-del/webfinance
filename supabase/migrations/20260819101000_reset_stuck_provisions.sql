-- Reset clients stuck in provisioning from failed/interrupted deploys
update public.clients
set
  status = 'failed',
  provision_error = coalesce(
    nullif(provision_error, ''),
    'Deploy interrupted — click Deploy again to retry'
  )
where status = 'provisioning';

update public.provision_jobs
set
  status = 'failed',
  last_error = coalesce(nullif(last_error, ''), 'Interrupted — ready for retry'),
  finished_at = coalesce(finished_at, now())
where status = 'running';
