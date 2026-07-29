-- Applied to Supabase as migration 20260725020631_schedule_mpesa_reconciliation_sweep.
--
-- Scheduled reconciliation sweep.
-- Without this a customer can pay, close the app, and stay uncredited forever:
-- client polling would be the only thing that ever revisits their row.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The project URL is not a secret, but the sweep call reads it from the same
-- place as the key so the cron body has no literals in it.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret(
      'https://jnjpivplulsfystxinvd.supabase.co',
      'project_url',
      'Base URL for scheduled Edge Function calls'
    );
  end if;
end
$$;

-- The 'mpesa_sweep_key' secret is NOT created here. It holds the dedicated
-- "mpesa-sweep" secret API key from Project Settings -> API Keys, which only a
-- human with dashboard access can mint. Until it exists the job below is a
-- no-op by its own WHERE clause, so nothing fails and nothing is logged.
select cron.unschedule('mpesa-reconcile-sweep')
  where exists (select 1 from cron.job where jobname = 'mpesa-reconcile-sweep');

select cron.schedule(
  'mpesa-reconcile-sweep',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/mpesa-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'mpesa_sweep_key')
    ),
    body := '{}'::jsonb
  )
  -- Only call out when there is something to reconcile AND the sweep key has
  -- been configured. Keeps the job silent before launch and idle when quiet.
  where exists (
    select 1 from public.payments
     where status in ('pending', 'reconciling')
       and checkout_request_id is not null
       and created_at < now() - interval '3 minutes'
       and created_at > now() - interval '7 days'
  )
  and (
    select count(*) from vault.decrypted_secrets
     where name in ('project_url', 'mpesa_sweep_key')
  ) = 2;
  $job$
);
