
-- =========================================================
-- IvestWise :: schema inicial
-- =========================================================

-- ------- ENUMS -------
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TYPE public.asset_type AS ENUM (
  'etf',
  'stock',
  'fund',
  'capitalization_insurance',
  'ppr',
  'bond',
  'cash',
  'crypto',
  'real_estate'
);

CREATE TYPE public.liability_type AS ENUM (
  'mortgage',
  'auto_loan',
  'personal_loan',
  'other'
);

CREATE TYPE public.transaction_type AS ENUM (
  'buy',
  'sell',
  'dividend',
  'interest',
  'coupon',
  'deposit',
  'withdrawal',
  'fee',
  'tax',
  'transfer_in',
  'transfer_out',
  'adjustment'
);

CREATE TYPE public.interest_rate_type AS ENUM ('fixed', 'variable', 'mixed');

-- ------- shared trigger -------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ------- PROFILES -------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  base_currency TEXT NOT NULL DEFAULT 'EUR',
  locale TEXT NOT NULL DEFAULT 'pt-PT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------- USER ROLES -------
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- ------- PORTFOLIOS -------
CREATE TABLE public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_portfolios_user ON public.portfolios(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolios_all_own" ON public.portfolios FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_portfolios_updated_at BEFORE UPDATE ON public.portfolios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- helper: is this portfolio mine?
CREATE OR REPLACE FUNCTION public.owns_portfolio(_portfolio_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE id = _portfolio_id AND user_id = auth.uid()
  );
$$;

-- ------- ASSETS -------
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  type public.asset_type NOT NULL,
  name TEXT NOT NULL,
  ticker TEXT,
  isin TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  quantity NUMERIC(20,8) NOT NULL DEFAULT 0,
  average_cost NUMERIC(20,8) NOT NULL DEFAULT 0,
  current_value NUMERIC(20,4),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acquired_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_portfolio ON public.assets(portfolio_id);
CREATE INDEX idx_assets_type ON public.assets(type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_all_own" ON public.assets FOR ALL TO authenticated
  USING (public.owns_portfolio(portfolio_id))
  WITH CHECK (public.owns_portfolio(portfolio_id));
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------- ASSET TRANSACTIONS -------
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantity NUMERIC(20,8) NOT NULL DEFAULT 0,
  unit_price NUMERIC(20,8) NOT NULL DEFAULT 0,
  amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  fees NUMERIC(20,4) NOT NULL DEFAULT 0,
  taxes NUMERIC(20,4) NOT NULL DEFAULT 0,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_asset ON public.transactions(asset_id);
CREATE INDEX idx_transactions_occurred_at ON public.transactions(occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_all_own" ON public.transactions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assets a
    WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assets a
    WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)
  ));
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------- ASSET VALUATIONS (marking-to-market snapshots) -------
CREATE TABLE public.asset_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  valuation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  unit_price NUMERIC(20,8),
  total_value NUMERIC(20,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, valuation_date)
);
CREATE INDEX idx_valuations_asset_date ON public.asset_valuations(asset_id, valuation_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_valuations TO authenticated;
GRANT ALL ON public.asset_valuations TO service_role;
ALTER TABLE public.asset_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "valuations_all_own" ON public.asset_valuations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.owns_portfolio(a.portfolio_id)));

-- ------- LIABILITIES -------
CREATE TABLE public.liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  type public.liability_type NOT NULL,
  name TEXT NOT NULL,
  lender TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  principal_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  interest_rate NUMERIC(9,6),
  rate_type public.interest_rate_type,
  spread NUMERIC(9,6),
  reference_index TEXT,
  monthly_payment NUMERIC(20,4),
  start_date DATE,
  end_date DATE,
  term_months INT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_liabilities_portfolio ON public.liabilities(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liabilities TO authenticated;
GRANT ALL ON public.liabilities TO service_role;
ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liabilities_all_own" ON public.liabilities FOR ALL TO authenticated
  USING (public.owns_portfolio(portfolio_id))
  WITH CHECK (public.owns_portfolio(portfolio_id));
CREATE TRIGGER trg_liabilities_updated_at BEFORE UPDATE ON public.liabilities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------- LIABILITY PAYMENTS -------
CREATE TABLE public.liability_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id UUID NOT NULL REFERENCES public.liabilities(id) ON DELETE CASCADE,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  principal_portion NUMERIC(20,4) NOT NULL DEFAULT 0,
  interest_portion NUMERIC(20,4) NOT NULL DEFAULT 0,
  fees NUMERIC(20,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_liability_payments_liability ON public.liability_payments(liability_id, paid_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liability_payments TO authenticated;
GRANT ALL ON public.liability_payments TO service_role;
ALTER TABLE public.liability_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liability_payments_all_own" ON public.liability_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.liabilities l WHERE l.id = liability_id AND public.owns_portfolio(l.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.liabilities l WHERE l.id = liability_id AND public.owns_portfolio(l.portfolio_id)));
