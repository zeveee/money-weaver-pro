
-- =========================================================================
-- IvestWise :: Final schema (approved)
-- Rebuild from scratch: drops previous public objects to converge on the
-- approved model. Safe because there is no production data yet.
-- =========================================================================

-- 1. DROP existing objects ------------------------------------------------
DROP TABLE IF EXISTS
  public.liability_payments,
  public.liabilities,
  public.import_jobs,
  public.portfolio_benchmarks,
  public.benchmark_returns,
  public.benchmarks,
  public.asset_performance_snapshots,
  public.asset_allocations,
  public.asset_identifiers,
  public.asset_valuations,
  public.transactions,
  public.assets,
  public.portfolios,
  public.portfolio_groups,
  public.allocation_values,
  public.allocation_types,
  public.asset_categories,
  public.asset_types,
  public.liability_types,
  public.data_providers,
  public.exchange_rates,
  public.user_roles,
  public.profiles
CASCADE;

DROP FUNCTION IF EXISTS public.owns_portfolio(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.asset_type CASCADE;
DROP TYPE IF EXISTS public.liability_type CASCADE;
DROP TYPE IF EXISTS public.transaction_type CASCADE;
DROP TYPE IF EXISTS public.interest_rate_type CASCADE;
DROP TYPE IF EXISTS public.benchmark_type CASCADE;
DROP TYPE IF EXISTS public.data_provider_type CASCADE;
DROP TYPE IF EXISTS public.import_source_type CASCADE;
DROP TYPE IF EXISTS public.import_status CASCADE;
DROP TYPE IF EXISTS public.asset_category_type CASCADE;

-- 2. ENUMS ----------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TYPE public.asset_type AS ENUM (
  'etf','stock','fund','capitalization_insurance','ppr','bond',
  'cash','crypto','real_estate','commodity'
);

CREATE TYPE public.liability_type AS ENUM (
  'mortgage','auto_loan','personal_loan','other'
);

CREATE TYPE public.transaction_type AS ENUM (
  'buy','sell','dividend','interest','coupon','deposit','withdrawal',
  'fee','tax','transfer_in','transfer_out','adjustment'
);

CREATE TYPE public.interest_rate_type AS ENUM ('fixed','variable','mixed');

CREATE TYPE public.benchmark_type AS ENUM (
  'equity_index','bond_index','commodity','currency','composite','custom'
);

CREATE TYPE public.data_provider_type AS ENUM (
  'market_data','fundamentals','reference_data','documents','other'
);

CREATE TYPE public.import_source_type AS ENUM ('csv','xlsx','pdf','api','manual');

CREATE TYPE public.import_status AS ENUM (
  'pending','running','completed','failed','partial'
);

CREATE TYPE public.asset_category_type AS ENUM (
  'sector','geography','asset_class','esg','factor','strategy','custom'
);

-- 3. Shared functions -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 4. profiles + user_roles -----------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  base_currency char(3) NOT NULL DEFAULT 'EUR'
    CHECK (base_currency ~ '^[A-Z]{3}$'),
  locale text NOT NULL DEFAULT 'pt-PT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Global catalogs ------------------------------------------------------
CREATE TABLE public.asset_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.liability_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.allocation_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.allocation_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_type_id uuid NOT NULL REFERENCES public.allocation_types(id) ON DELETE RESTRICT,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (allocation_type_id, value)
);
CREATE TABLE public.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_type public.asset_category_type NOT NULL,
  category_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_type, category_name)
);
CREATE TABLE public.data_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  provider_type public.data_provider_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  benchmark_type public.benchmark_type NOT NULL,
  ticker text,
  isin text,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, benchmark_type)
);
CREATE TABLE public.benchmark_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id uuid NOT NULL REFERENCES public.benchmarks(id) ON DELETE CASCADE,
  date date NOT NULL,
  return_value numeric(12,8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (benchmark_id, date)
);
CREATE INDEX idx_benchmark_returns_bench_date
  ON public.benchmark_returns (benchmark_id, date DESC);

CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  base_currency char(3) NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  quote_currency char(3) NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,10) NOT NULL CHECK (exchange_rate > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, base_currency, quote_currency)
);
CREATE INDEX idx_exchange_rates_pair_date
  ON public.exchange_rates (base_currency, quote_currency, date DESC);

-- Catalog GRANTs + RLS (read for authenticated, write for admin)
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'asset_types','liability_types','allocation_types','allocation_values',
    'asset_categories','data_providers','benchmarks','benchmark_returns','exchange_rates'
  ] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY "%I_read_auth" ON public.%I FOR SELECT TO authenticated USING (true);', t, t);
    EXECUTE format('CREATE POLICY "%I_write_admin" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(),''admin'')) WITH CHECK (public.has_role(auth.uid(),''admin''));', t, t);
  END LOOP;
END $$;

-- 6. portfolio_groups + portfolios ---------------------------------------
CREATE TABLE public.portfolio_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_groups TO authenticated;
GRANT ALL ON public.portfolio_groups TO service_role;
ALTER TABLE public.portfolio_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pg_owner_all" ON public.portfolio_groups FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_pg_updated BEFORE UPDATE ON public.portfolio_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.portfolio_groups(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  base_currency char(3) NOT NULL DEFAULT 'EUR' CHECK (base_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolios_owner_all" ON public.portfolios FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_portfolios_updated BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_portfolio(_portfolio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.portfolios WHERE id = _portfolio_id AND user_id = auth.uid());
$$;

-- 7. assets and dependents ------------------------------------------------
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  type public.asset_type NOT NULL,
  name text NOT NULL,
  ticker text,
  isin text,
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  -- Derived / cache fields (NOT the source of truth for financial calc):
  quantity numeric(28,10) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  average_cost numeric(20,4) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
  current_value numeric(20,4),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acquired_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_owner_all" ON public.assets FOR ALL TO authenticated
  USING (public.owns_portfolio(portfolio_id))
  WITH CHECK (public.owns_portfolio(portfolio_id));
CREATE INDEX idx_assets_portfolio ON public.assets (portfolio_id);
CREATE INDEX idx_assets_metadata_gin ON public.assets USING GIN (metadata);
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  occurred_at timestamptz NOT NULL,
  quantity numeric(28,10) NOT NULL DEFAULT 0,
  unit_price numeric(20,4) NOT NULL DEFAULT 0,
  amount numeric(20,4) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  fees numeric(20,4) NOT NULL DEFAULT 0,
  taxes numeric(20,4) NOT NULL DEFAULT 0,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx_owner_all" ON public.transactions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)));
CREATE INDEX idx_tx_asset_date ON public.transactions (asset_id, occurred_at DESC);
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.asset_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  valuation_date date NOT NULL,
  unit_price numeric(20,4),
  total_value numeric(20,4) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, valuation_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_valuations TO authenticated;
GRANT ALL ON public.asset_valuations TO service_role;
ALTER TABLE public.asset_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "val_owner_all" ON public.asset_valuations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)));
CREATE INDEX idx_val_asset_date ON public.asset_valuations (asset_id, valuation_date DESC);

CREATE TABLE public.asset_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  isin text,
  ticker text,
  cusip text,
  sedol text,
  exchange text,
  currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_asset_ident_isin ON public.asset_identifiers (asset_id, isin) WHERE isin IS NOT NULL;
CREATE UNIQUE INDEX ux_asset_ident_ticker ON public.asset_identifiers (asset_id, ticker, exchange) WHERE ticker IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_identifiers TO authenticated;
GRANT ALL ON public.asset_identifiers TO service_role;
ALTER TABLE public.asset_identifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ident_owner_all" ON public.asset_identifiers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)));

-- asset_allocations normalized via allocation_value_id
CREATE TABLE public.asset_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  allocation_value_id uuid NOT NULL REFERENCES public.allocation_values(id) ON DELETE RESTRICT,
  percentage numeric(9,6) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, allocation_value_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_allocations TO authenticated;
GRANT ALL ON public.asset_allocations TO service_role;
ALTER TABLE public.asset_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alloc_owner_all" ON public.asset_allocations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)));

CREATE TABLE public.asset_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  market_value numeric(20,4) NOT NULL,
  invested_capital numeric(20,4) NOT NULL,
  xirr numeric(12,8),
  gain_loss numeric(20,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, snapshot_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_performance_snapshots TO authenticated;
GRANT ALL ON public.asset_performance_snapshots TO service_role;
ALTER TABLE public.asset_performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf_owner_all" ON public.asset_performance_snapshots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)));
CREATE INDEX idx_perf_asset_date ON public.asset_performance_snapshots (asset_id, snapshot_date DESC);

-- 8. portfolio_benchmarks + import_jobs -----------------------------------
CREATE TABLE public.portfolio_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  benchmark_id uuid NOT NULL REFERENCES public.benchmarks(id) ON DELETE RESTRICT,
  weight numeric(9,6) NOT NULL DEFAULT 100 CHECK (weight >= 0 AND weight <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, benchmark_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_benchmarks TO authenticated;
GRANT ALL ON public.portfolio_benchmarks TO service_role;
ALTER TABLE public.portfolio_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pb_owner_all" ON public.portfolio_benchmarks FOR ALL TO authenticated
  USING (public.owns_portfolio(portfolio_id)) WITH CHECK (public.owns_portfolio(portfolio_id));

CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  source_type public.import_source_type NOT NULL,
  status public.import_status NOT NULL DEFAULT 'pending',
  records_created integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_owner_all" ON public.import_jobs FOR ALL TO authenticated
  USING (public.owns_portfolio(portfolio_id)) WITH CHECK (public.owns_portfolio(portfolio_id));
CREATE TRIGGER trg_imp_updated BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. liabilities + payments ----------------------------------------------
CREATE TABLE public.liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  type public.liability_type NOT NULL,
  name text NOT NULL,
  lender text,
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  principal_amount numeric(20,4) NOT NULL CHECK (principal_amount >= 0),
  outstanding_balance numeric(20,4) NOT NULL DEFAULT 0 CHECK (outstanding_balance >= 0),
  interest_rate numeric(9,6),
  rate_type public.interest_rate_type,
  spread numeric(9,6),
  reference_index text,
  monthly_payment numeric(20,4),
  start_date date,
  end_date date,
  term_months integer,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liabilities TO authenticated;
GRANT ALL ON public.liabilities TO service_role;
ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liab_owner_all" ON public.liabilities FOR ALL TO authenticated
  USING (public.owns_portfolio(portfolio_id)) WITH CHECK (public.owns_portfolio(portfolio_id));
CREATE INDEX idx_liab_portfolio ON public.liabilities (portfolio_id);
CREATE TRIGGER trg_liab_updated BEFORE UPDATE ON public.liabilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.liability_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id uuid NOT NULL REFERENCES public.liabilities(id) ON DELETE CASCADE,
  paid_at date NOT NULL,
  amount numeric(20,4) NOT NULL CHECK (amount >= 0),
  principal_portion numeric(20,4) NOT NULL DEFAULT 0,
  interest_portion numeric(20,4) NOT NULL DEFAULT 0,
  fees numeric(20,4) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liability_payments TO authenticated;
GRANT ALL ON public.liability_payments TO service_role;
ALTER TABLE public.liability_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liab_pay_owner_all" ON public.liability_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.liabilities l WHERE l.id = liability_id AND public.owns_portfolio(l.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.liabilities l WHERE l.id = liability_id AND public.owns_portfolio(l.portfolio_id)));
CREATE INDEX idx_liab_pay_date ON public.liability_payments (liability_id, paid_at DESC);
