-- Rewards ledger report for the client (read-only).
-- Produces one CSV with sections: meta, live_ledger, pending_by_milestone,
-- failed_by_reason, archived_after_learner_erased_her_data,
-- all_time_including_archive, failed_other_detail (phone numbers of the
-- failures that are neither wallet-empty nor provider-duplicate).
-- Run through the Cloud SQL Auth Proxy, never against a copied dump:
--   cloud-sql-proxy shetrades-staging-12345:us-central1:shetrades-pg-staging --port 15433
--   psql "$PGLOCAL" -X -q --csv -o rewards-report.csv -f docs/ops/rewards-report.sql
-- The output carries personal data (phone numbers). Keep it out of the repo.
SET default_transaction_read_only = on;
SET TIME ZONE 'UTC';
WITH p AS (SELECT (SELECT MAX("issuedAt") FROM rewards) AS wallet_empty_at)
SELECT section, line_item, rewards, amount_ngn, learners, phone, reason, module, created_utc, last_attempt_utc, attempts, note FROM (
  SELECT 1 AS ord, 'meta' AS section, 'snapshot_utc' AS line_item,
         to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS rewards, '' AS amount_ngn, '' AS learners,
         '' AS phone, '' AS reason, '' AS module, '' AS created_utc, '' AS last_attempt_utc, '' AS attempts,
         'All times are UTC (West Africa Time = UTC+1). Amounts in naira.' AS note
  UNION ALL SELECT 1,'meta','dispatcher','PAUSED','','','','','','','','','Cloud Scheduler job shetrades-payouts-dispatcher-staging, paused 2026-09-17 19:19 UTC. Nothing is paid, retried or failed while paused.'
  UNION ALL SELECT 1,'meta','reward_rule','DISABLED','','','','','','','','','Reward Rule v3 published 2026-09-17 19:01 UTC. No new rewards are created; the bot, lessons and certificates continue.'
  UNION ALL SELECT 1,'meta','last_payment_utc', to_char((SELECT MAX("issuedAt") FROM rewards),'YYYY-MM-DD HH24:MI:SS'),'','','','','','','','','Africa''s Talking wallet ran out at this moment.'
  UNION ALL SELECT 1,'meta','last_dispatcher_activity_utc', to_char((SELECT MAX("updatedAt") FROM rewards WHERE "updatedAt" > "createdAt"),'YYYY-MM-DD HH24:MI:SS'),'','','','','','','','','Last time any reward was paid, retried or failed.'

  UNION ALL SELECT 2,'live_ledger', status, COUNT(*)::text, SUM(amount)::bigint::text, COUNT(DISTINCT "userId")::text,'','','','','','',
         CASE status WHEN 'Issued' THEN 'Paid.' WHEN 'Pending' THEN 'Owed. Paid automatically once the wallet is funded and the dispatcher resumes.' ELSE 'Not paid. See failed_by_reason.' END
  FROM rewards GROUP BY status

  UNION ALL SELECT 3,'pending_by_milestone', module, COUNT(*)::text, SUM(amount)::bigint::text, COUNT(DISTINCT "userId")::text,'','','','','','',''
  FROM rewards WHERE status='Pending' GROUP BY module

  UNION ALL SELECT 4,'failed_by_reason',
         CASE WHEN "failureReason" ILIKE '%Insufficient Credit%' THEN 'Wallet empty'
              WHEN "failureReason" ILIKE '%duplicate request%' AND "updatedAt" >= p.wallet_empty_at THEN 'Provider duplicate-request, after wallet emptied'
              WHEN "failureReason" ILIKE '%duplicate request%' THEN 'Provider duplicate-request, before wallet emptied'
              ELSE COALESCE("failureReason",'(no reason recorded)') END,
         COUNT(*)::text, SUM(amount)::bigint::text, COUNT(DISTINCT "userId")::text,'','','','','','',
         CASE WHEN "failureReason" ILIKE '%Insufficient Credit%' THEN 'Unpaid. Can be requeued and paid once the wallet is funded.'
              WHEN "failureReason" ILIKE '%duplicate request%' AND "updatedAt" >= p.wallet_empty_at THEN 'Unpaid: the retry hit the provider''s 5-minute duplicate window while the wallet was empty. Requeue with the wallet-empty rows.'
              WHEN "failureReason" ILIKE '%duplicate request%' THEN 'Uncertain: the earlier attempt may have been paid. Reconcile against the Africa''s Talking transaction log before requeueing.'
              ELSE 'See failed_other_detail below.' END
  FROM rewards, p WHERE status='Failed'
  GROUP BY 3, 13

  UNION ALL SELECT 5,'archived_after_learner_erased_her_data', status, COUNT(*)::text, SUM(amount)::bigint::text,'','','','','','','',
         CASE status WHEN 'Pending' THEN 'Cannot be paid: the learner deleted her data, so the phone number is gone.' WHEN 'Issued' THEN 'Paid before the learner deleted her data.' ELSE '' END
  FROM reward_archive GROUP BY status

  UNION ALL SELECT 6,'all_time_including_archive', status, SUM(rows)::text, SUM(ngn)::bigint::text,'','','','','','','',''
  FROM (SELECT status, COUNT(*) AS rows, SUM(amount) AS ngn FROM rewards GROUP BY 1
        UNION ALL SELECT status, COUNT(*), SUM(amount) FROM reward_archive GROUP BY 1) t GROUP BY status

  UNION ALL SELECT 7,'failed_other_detail','reward','1', amount::bigint::text,'', "learnerPhone", COALESCE("failureReason",''), module,
         to_char("createdAt",'YYYY-MM-DD HH24:MI:SS'), to_char("updatedAt",'YYYY-MM-DD HH24:MI:SS'), "retryCount"::text,
         CASE WHEN "learnerPhone" !~ '^\+?234[0-9]{10}$' THEN 'Not a Nigerian mobile number in +234 format' ELSE 'Number format looks valid' END
  FROM rewards WHERE status='Failed' AND COALESCE("failureReason",'') NOT ILIKE '%Insufficient Credit%' AND COALESCE("failureReason",'') NOT ILIKE '%duplicate request%'
) x ORDER BY ord, section, line_item, phone;
