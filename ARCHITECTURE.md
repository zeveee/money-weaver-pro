# IvestWise — Arquitetura

Aplicação de gestão patrimonial e análise de investimentos, desenhada
desde o início para múltiplos utilizadores e futura comercialização SaaS.

## Princípios

1. **Separação estrita de camadas.** Dados, negócio e apresentação nunca se misturam.
2. **Lógica financeira em serviços puros.** Sem I/O, sem Supabase, sem React — testáveis isoladamente.
3. **Multi-tenant desde o dia 1.** RLS ao nível da base de dados; a app nunca "confia" no cliente.
4. **Domínio em camelCase, DB em snake_case.** Mapeadores explícitos entre os dois mundos.

## Camadas

```text
┌──────────────────────────────────────────────────────────────┐
│  Apresentação (TanStack Router + React)                      │
│  src/routes/**, src/components/**                            │
│  → só consome serviços e repositórios, nunca fala com o DB   │
├──────────────────────────────────────────────────────────────┤
│  Serviços de negócio (puros, sem I/O)                        │
│  src/services/**                                             │
│  → portfolio-metrics, loan-math, (futuro: performance, risk) │
├──────────────────────────────────────────────────────────────┤
│  Repositórios (I/O — única fronteira com Supabase)           │
│  src/repositories/**                                         │
│  → listMyPortfolios, createAsset, ...                        │
├──────────────────────────────────────────────────────────────┤
│  Domínio (tipos partilhados)                                 │
│  src/domain/types.ts                                         │
├──────────────────────────────────────────────────────────────┤
│  Persistência (Postgres / Lovable Cloud)                     │
│  migrations SQL + RLS                                        │
└──────────────────────────────────────────────────────────────┘
```

## Modelo de dados

### Entidades

- **profiles** — 1:1 com `auth.users`; preferências (moeda base, locale).
- **user_roles** — papéis (`admin`, `user`), tabela separada para evitar escalada de privilégios.
- **portfolios** — carteiras de um utilizador.
- **assets** — ativos dentro de uma carteira.
- **transactions** — histórico de operações sobre um ativo.
- **asset_valuations** — snapshots mark-to-market por data.
- **liabilities** — passivos dentro de uma carteira.
- **liability_payments** — histórico de pagamentos de um passivo.

### Relações

```text
auth.users 1───1 profiles
auth.users 1───* portfolio_groups 1───* portfolios
auth.users 1───* portfolios
portfolios 1───* assets       1───* transactions
portfolios 1───* assets       1───* asset_valuations
portfolios 1───* assets       1───* asset_allocations ──* allocation_values
                                                            └─ allocation_types
portfolios 1───* assets       1───* asset_identifiers
portfolios 1───* assets       1───* asset_performance_snapshots
portfolios 1───* liabilities  1───* liability_payments
portfolios *───* benchmarks (via portfolio_benchmarks)
benchmarks 1───* benchmark_returns

exchange_rates (base_currency, quote_currency, date) — catálogo global de FX
  usado para consolidar carteiras multi-moeda numa moeda de referência.

Catálogos globais (leitura pública, escrita admin):
  asset_types, liability_types, allocation_types, allocation_values,
  benchmarks, data_providers, asset_categories, exchange_rates
```

### Catálogos normalizados

- **asset_types** — `id, code, name`. Substitui o enum `asset_type` por
  tabela extensível sem migração.
- **liability_types** — `id, code, name`. Análogo para passivos.
- **allocation_types** — `id, code, name` (Sector, Geography, ESG,
  MarketCap, Factor, ...).
- **allocation_values** — `allocation_type_id, value`. Enumera valores
  válidos por tipo (Sector → Technology, Energy, ...).

### Séries temporais

- **benchmark_returns** — `benchmark_id, date, return_value`. Histórico
  de rentabilidades por benchmark.
- **asset_performance_snapshots** — `asset_id, snapshot_date,
  market_value, invested_capital, xirr, gain_loss`. Métricas materializadas
  para análise histórica sem recomputar tudo.


### Tipos suportados

**Ativos (`asset_type`)**
`etf`, `stock`, `fund`, `capitalization_insurance`, `ppr`, `bond`,
`cash`, `crypto`, `real_estate`.

**Passivos (`liability_type`)**
`mortgage`, `auto_loan`, `personal_loan`, `other`.

**Transações (`transaction_type`)**
`buy`, `sell`, `dividend`, `interest`, `coupon`, `deposit`, `withdrawal`,
`fee`, `tax`, `transfer_in`, `transfer_out`, `adjustment`.

## Segurança

- RLS ativo em **todas** as tabelas.
- Um utilizador só vê linhas onde `auth.uid()` coincide com o dono da
  carteira. Cascatas usam a função `SECURITY DEFINER` `owns_portfolio()`
  (não invocável diretamente).
- Papéis vivem em `user_roles`, nunca em `profiles`. A verificação usa
  `has_role()` (`SECURITY DEFINER`), preparando permissões futuras.
- Criação de `profile` automática no signup via trigger.

## Pontos de extensão (SaaS)

- **Organizações / equipas**: adicionar `organizations` + `organization_members` e
  substituir `portfolios.user_id` por `owner_id` (user ou org). RLS passa a
  usar `is_member_of(org_id)`.
- **Planos / limites**: `subscriptions` ligada a Stripe / Paddle.
- **Cotações e câmbios**: tabelas `price_history` e `fx_rates` alimentadas
  por um job (`pg_cron` + endpoint TanStack em `src/routes/api/public/`).
- **Serviços avançados**: adicionar `services/performance.ts` (TWR/MWR),
  `services/risk.ts` (volatilidade, drawdown), `services/tax.ts` — todos
  puros, seguindo o padrão de `portfolio-metrics.ts`.
