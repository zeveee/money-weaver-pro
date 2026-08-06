ALTER TABLE public.exchange_rates ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rates_pair_date_key
  ON public.exchange_rates (base_currency, quote_currency, date);

CREATE INDEX IF NOT EXISTS exchange_rates_pair_date_desc_idx
  ON public.exchange_rates (base_currency, quote_currency, date DESC);

GRANT SELECT ON public.exchange_rates TO anon, authenticated;
GRANT ALL ON public.exchange_rates TO service_role;

DROP POLICY IF EXISTS "exchange_rates_write_admin" ON public.exchange_rates;
CREATE POLICY "exchange_rates_write_admin"
  ON public.exchange_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));