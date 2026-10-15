-- Hosted Supabase scheduler for Impersonae pre-order retention.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'big-match-preorder-retention',
  '37 * * * *',
  $job$SELECT public.bm_preorder_cleanup();$job$
);

-- Verify:
-- SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='big-match-preorder-retention';
