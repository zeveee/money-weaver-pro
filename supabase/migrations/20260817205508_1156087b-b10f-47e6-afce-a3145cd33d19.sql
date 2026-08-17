CREATE TABLE public.asset_provider_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_instrument_id text NOT NULL,
  provider_symbol text,
  provider_exchange text,
  provider_currency text,
  status text NOT NULL DEFAULT 'active',
  resolved_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  last_synced_date date,
  raw_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, provider)
);

CREATE INDEX idx_apl_asset ON public.asset_provider_links (asset_id);
CREATE INDEX idx_apl_status ON public.asset_provider_links (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_provider_links TO authenticated;
GRANT ALL ON public.asset_provider_links TO service_role;

ALTER TABLE public.asset_provider_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY apl_owner_all ON public.asset_provider_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND private.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND private.owns_portfolio(a.portfolio_id)));