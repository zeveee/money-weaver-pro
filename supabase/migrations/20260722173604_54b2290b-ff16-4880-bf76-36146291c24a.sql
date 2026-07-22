
-- ============ ENUMS ============
CREATE TYPE public.allocation_type AS ENUM ('sector','geography','asset_class','esg','factor','currency','custom');
CREATE TYPE public.benchmark_type AS ENUM ('equity_index','bond_index','commodity','currency','composite','custom');
CREATE TYPE public.data_provider_type AS ENUM ('market_data','fundamentals','reference_data','documents','other');
CREATE TYPE public.import_source_type AS ENUM ('csv','xlsx','pdf','api','manual');
CREATE TYPE public.import_status AS ENUM ('pending','running','completed','failed','partial');
CREATE TYPE public.asset_category_type AS ENUM ('sector','geography','asset_class','esg','factor','strategy','custom');

-- ============ asset_allocations ============
CREATE TABLE public.asset_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  allocation_type public.allocation_type NOT NULL,
  allocation_name TEXT NOT NULL,
  percentage NUMERIC(9,6) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, allocation_type, allocation_name)
);
CREATE INDEX idx_asset_allocations_asset ON public.asset_allocations(asset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_allocations TO authenticated;
GRANT ALL ON public.asset_allocations TO service_role;
ALTER TABLE public.asset_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage asset_allocations" ON public.asset_allocations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)));
CREATE TRIGGER trg_asset_allocations_updated BEFORE UPDATE ON public.asset_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ benchmarks (global catalog) ============
CREATE TABLE public.benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  benchmark_type public.benchmark_type NOT NULL,
  ticker TEXT,
  isin TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, provider)
);
GRANT SELECT ON public.benchmarks TO authenticated;
GRANT ALL ON public.benchmarks TO service_role;
ALTER TABLE public.benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read benchmarks" ON public.benchmarks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage benchmarks" ON public.benchmarks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_benchmarks_updated BEFORE UPDATE ON public.benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ portfolio_benchmarks ============
CREATE TABLE public.portfolio_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  benchmark_id UUID NOT NULL REFERENCES public.benchmarks(id) ON DELETE RESTRICT,
  weight NUMERIC(9,6) NOT NULL DEFAULT 100 CHECK (weight >= 0 AND weight <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, benchmark_id)
);
CREATE INDEX idx_portfolio_benchmarks_portfolio ON public.portfolio_benchmarks(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_benchmarks TO authenticated;
GRANT ALL ON public.portfolio_benchmarks TO service_role;
ALTER TABLE public.portfolio_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage portfolio_benchmarks" ON public.portfolio_benchmarks FOR ALL
  USING (public.owns_portfolio(portfolio_id)) WITH CHECK (public.owns_portfolio(portfolio_id));
CREATE TRIGGER trg_portfolio_benchmarks_updated BEFORE UPDATE ON public.portfolio_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ data_providers (global catalog) ============
CREATE TABLE public.data_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  provider_type public.data_provider_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.data_providers TO authenticated;
GRANT ALL ON public.data_providers TO service_role;
ALTER TABLE public.data_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read data_providers" ON public.data_providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage data_providers" ON public.data_providers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_data_providers_updated BEFORE UPDATE ON public.data_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ import_jobs ============
CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  source_type public.import_source_type NOT NULL,
  status public.import_status NOT NULL DEFAULT 'pending',
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_jobs_portfolio ON public.import_jobs(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage import_jobs" ON public.import_jobs FOR ALL
  USING (public.owns_portfolio(portfolio_id)) WITH CHECK (public.owns_portfolio(portfolio_id));
CREATE TRIGGER trg_import_jobs_updated BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ asset_identifiers ============
CREATE TABLE public.asset_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  isin TEXT,
  ticker TEXT,
  cusip TEXT,
  sedol TEXT,
  exchange TEXT,
  currency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_asset_identifiers_asset ON public.asset_identifiers(asset_id);
CREATE INDEX idx_asset_identifiers_isin ON public.asset_identifiers(isin) WHERE isin IS NOT NULL;
CREATE INDEX idx_asset_identifiers_ticker ON public.asset_identifiers(ticker) WHERE ticker IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_identifiers TO authenticated;
GRANT ALL ON public.asset_identifiers TO service_role;
ALTER TABLE public.asset_identifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage asset_identifiers" ON public.asset_identifiers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)));
CREATE TRIGGER trg_asset_identifiers_updated BEFORE UPDATE ON public.asset_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ asset_categories (global catalog) ============
CREATE TABLE public.asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_type public.asset_category_type NOT NULL,
  category_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_type, category_name)
);
GRANT SELECT ON public.asset_categories TO authenticated;
GRANT ALL ON public.asset_categories TO service_role;
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read asset_categories" ON public.asset_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage asset_categories" ON public.asset_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_asset_categories_updated BEFORE UPDATE ON public.asset_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
