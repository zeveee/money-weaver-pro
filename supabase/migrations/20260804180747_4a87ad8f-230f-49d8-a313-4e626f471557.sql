CREATE TYPE public.recurrence_execution_mode AS ENUM ('manual','automatic');

ALTER TABLE public.recurring_transactions
  ADD COLUMN execution_mode public.recurrence_execution_mode NOT NULL DEFAULT 'manual',
  ADD COLUMN last_generated_on date;

CREATE UNIQUE INDEX idx_transactions_recurring_occurrence
  ON public.transactions (recurring_transaction_id, occurred_at)
  WHERE recurring_transaction_id IS NOT NULL;