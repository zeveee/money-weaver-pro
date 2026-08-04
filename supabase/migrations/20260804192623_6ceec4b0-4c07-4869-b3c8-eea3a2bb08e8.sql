UPDATE public.transactions
SET occurred_at = date_trunc('day', occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '12 hours'
WHERE recurring_transaction_id IS NOT NULL
  AND (occurred_at AT TIME ZONE 'UTC')::time = '00:00:00';