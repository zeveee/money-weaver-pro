CREATE TYPE public.recurrence_frequency AS ENUM ('weekly','monthly','quarterly','semiannual','annual');

CREATE TABLE public.recurring_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount numeric(20,6) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  frequency public.recurrence_frequency NOT NULL DEFAULT 'monthly',
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 31),
  start_date date NOT NULL,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_transactions_period_valid CHECK (end_date IS NULL OR end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_transactions TO authenticated;
GRANT ALL ON public.recurring_transactions TO service_role;

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage recurring transactions of own assets"
ON public.recurring_transactions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = recurring_transactions.asset_id AND public.owns_portfolio(a.portfolio_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = recurring_transactions.asset_id AND public.owns_portfolio(a.portfolio_id)));

CREATE INDEX idx_recurring_transactions_asset ON public.recurring_transactions(asset_id);
CREATE INDEX idx_recurring_transactions_active ON public.recurring_transactions(is_active) WHERE is_active;

CREATE TRIGGER trg_recurring_tx_updated
BEFORE UPDATE ON public.recurring_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.transactions
  ADD COLUMN recurring_transaction_id uuid NULL
  REFERENCES public.recurring_transactions(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_recurring
  ON public.transactions(recurring_transaction_id)
  WHERE recurring_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX uq_transactions_recurring_occurrence
  ON public.transactions(recurring_transaction_id, occurred_at)
  WHERE recurring_transaction_id IS NOT NULL;