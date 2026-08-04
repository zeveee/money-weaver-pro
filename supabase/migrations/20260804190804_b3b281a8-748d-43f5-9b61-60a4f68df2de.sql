DROP INDEX IF EXISTS public.uq_transactions_recurring_occurrence;
DROP INDEX IF EXISTS public.idx_transactions_recurring_occurrence;
CREATE UNIQUE INDEX uq_transactions_recurring_occurrence
  ON public.transactions (recurring_transaction_id, occurred_at);