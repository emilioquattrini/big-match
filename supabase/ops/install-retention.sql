-- Run in the dedicated Supabase project after reviewing retention.
-- Kept outside the portable migration because pg_cron is a platform extension.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'big-match-retention',
  '17 * * * *',
  $job$SELECT public.bm_cleanup();$job$
);
-- Verify that the job is active and that its first hosted run succeeds:
-- SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='big-match-retention';
-- SELECT status,start_time,end_time,return_message FROM cron.job_run_details
-- WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname='big-match-retention')
-- ORDER BY start_time DESC LIMIT 10;
