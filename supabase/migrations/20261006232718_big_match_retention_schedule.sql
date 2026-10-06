-- Hosted Supabase retention scheduler. The portable application schema is separate.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'big-match-retention',
  '17 * * * *',
  $job$SELECT public.bm_cleanup();$job$
);
