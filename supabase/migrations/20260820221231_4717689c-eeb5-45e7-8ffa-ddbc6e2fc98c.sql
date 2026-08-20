CREATE TYPE public.security_match_status AS ENUM ('identified','ambiguous','unidentified');

CREATE TABLE public.securities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  figi text UNIQUE,
  composite_figi text,
  share_class_figi text,
  name text,
  ticker text,
  isin text,
  cusip text,
  sedol text,
  exchange text,
  currency text,
  security_type text,
  market_sector text,
  source text NOT NULL DEFAULT 'openfigi',
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_securities_isin ON public.securities (isin);
CREATE INDEX idx_securities_cusip ON public.securities (cusip);
CREATE INDEX idx_securities_ticker ON public.securities (ticker);

GRANT SELECT ON public.securities TO authenticated;
GRANT ALL ON public.securities TO service_role;
ALTER TABLE public.securities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Securities are readable by authenticated users"
  ON public.securities FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_securities_updated BEFORE UPDATE ON public.securities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.security_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key text NOT NULL UNIQUE,
  id_type text NOT NULL,
  id_value text NOT NULL,
  status public.security_match_status NOT NULL,
  security_id uuid REFERENCES public.securities(id) ON DELETE SET NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'openfigi',
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_lookups TO authenticated;
GRANT ALL ON public.security_lookups TO service_role;
ALTER TABLE public.security_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Security lookups are readable by authenticated users"
  ON public.security_lookups FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_security_lookups_updated BEFORE UPDATE ON public.security_lookups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();