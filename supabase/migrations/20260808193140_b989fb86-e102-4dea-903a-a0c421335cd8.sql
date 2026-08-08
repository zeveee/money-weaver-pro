CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION private.owns_portfolio(_portfolio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.portfolios WHERE id = _portfolio_id AND user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.owns_portfolio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_portfolio(uuid) TO authenticated, service_role;

-- Catálogos: escrita apenas admin
ALTER POLICY allocation_types_write_admin ON public.allocation_types USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY allocation_values_write_admin ON public.allocation_values USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY asset_categories_write_admin ON public.asset_categories USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY asset_types_write_admin ON public.asset_types USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY benchmark_returns_write_admin ON public.benchmark_returns USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY benchmarks_write_admin ON public.benchmarks USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY data_providers_write_admin ON public.data_providers USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY exchange_rates_write_admin ON public.exchange_rates USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY liability_types_write_admin ON public.liability_types USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- Propriedade via carteira
ALTER POLICY assets_owner_all ON public.assets USING (private.owns_portfolio(portfolio_id)) WITH CHECK (private.owns_portfolio(portfolio_id));
ALTER POLICY imp_owner_all ON public.import_jobs USING (private.owns_portfolio(portfolio_id)) WITH CHECK (private.owns_portfolio(portfolio_id));
ALTER POLICY liab_owner_all ON public.liabilities USING (private.owns_portfolio(portfolio_id)) WITH CHECK (private.owns_portfolio(portfolio_id));
ALTER POLICY pb_owner_all ON public.portfolio_benchmarks USING (private.owns_portfolio(portfolio_id)) WITH CHECK (private.owns_portfolio(portfolio_id));

ALTER POLICY alloc_owner_all ON public.asset_allocations
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_allocations.asset_id AND private.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_allocations.asset_id AND private.owns_portfolio(a.portfolio_id)));
ALTER POLICY ident_owner_all ON public.asset_identifiers
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_identifiers.asset_id AND private.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_identifiers.asset_id AND private.owns_portfolio(a.portfolio_id)));
ALTER POLICY perf_owner_all ON public.asset_performance_snapshots
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_performance_snapshots.asset_id AND private.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_performance_snapshots.asset_id AND private.owns_portfolio(a.portfolio_id)));
ALTER POLICY val_owner_all ON public.asset_valuations
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_valuations.asset_id AND private.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_valuations.asset_id AND private.owns_portfolio(a.portfolio_id)));
ALTER POLICY tx_owner_all ON public.transactions
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = transactions.asset_id AND private.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = transactions.asset_id AND private.owns_portfolio(a.portfolio_id)));
ALTER POLICY "Users manage recurring transactions of own assets" ON public.recurring_transactions
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = recurring_transactions.asset_id AND private.owns_portfolio(a.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = recurring_transactions.asset_id AND private.owns_portfolio(a.portfolio_id)));
ALTER POLICY liab_pay_owner_all ON public.liability_payments
  USING (EXISTS (SELECT 1 FROM public.liabilities l WHERE l.id = liability_payments.liability_id AND private.owns_portfolio(l.portfolio_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.liabilities l WHERE l.id = liability_payments.liability_id AND private.owns_portfolio(l.portfolio_id)));