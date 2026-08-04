/**
 * IvestWise :: Mapeadores DB <-> Domínio
 *
 * Isolam o formato snake_case do Supabase do modelo camelCase do domínio.
 * Assim, se o schema mudar, só estes ficheiros precisam de ser atualizados.
 */

import type {
  Asset,
  AssetValuation,
  Liability,
  LiabilityPayment,
  Portfolio,
  Profile,
  Transaction,
} from "@/domain/types";

type Row = Record<string, unknown>;

export const toProfile = (r: Row): Profile => ({
  id: r.id as string,
  displayName: (r.display_name as string) ?? null,
  baseCurrency: r.base_currency as string,
  locale: r.locale as string,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export const toPortfolio = (r: Row): Portfolio => ({
  id: r.id as string,
  userId: r.user_id as string,
  groupId: (r.group_id as string) ?? null,
  name: r.name as string,
  description: (r.description as string) ?? null,
  baseCurrency: r.base_currency as string,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export const toPortfolioGroup = (r: Row): import("@/domain/types").PortfolioGroup => ({
  id: r.id as string,
  ownerId: r.owner_id as string,
  name: r.name as string,
  description: (r.description as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export const toExchangeRate = (r: Row): import("@/domain/types").ExchangeRate => ({
  id: r.id as string,
  date: r.date as string,
  baseCurrency: r.base_currency as string,
  quoteCurrency: r.quote_currency as string,
  exchangeRate: Number(r.exchange_rate ?? 0),
});

export const toAsset = (r: Row): Asset => ({
  id: r.id as string,
  portfolioId: r.portfolio_id as string,
  type: r.type as Asset["type"],
  name: r.name as string,
  ticker: (r.ticker as string) ?? null,
  isin: (r.isin as string) ?? null,
  currency: r.currency as string,
  quantity: Number(r.quantity ?? 0),
  averageCost: Number(r.average_cost ?? 0),
  currentValue: r.current_value == null ? null : Number(r.current_value),
  notes: (r.notes as string) ?? null,
  metadata: (r.metadata as Record<string, unknown>) ?? {},
  acquiredAt: (r.acquired_at as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export const toTransaction = (r: Row): Transaction => ({
  id: r.id as string,
  assetId: r.asset_id as string,
  type: r.type as Transaction["type"],
  occurredAt: r.occurred_at as string,
  quantity: Number(r.quantity ?? 0),
  unitPrice: Number(r.unit_price ?? 0),
  amount: Number(r.amount ?? 0),
  currency: r.currency as string,
  fees: Number(r.fees ?? 0),
  taxes: Number(r.taxes ?? 0),
  notes: (r.notes as string) ?? null,
  metadata: (r.metadata as Record<string, unknown>) ?? {},
  recurringTransactionId: (r.recurring_transaction_id as string) ?? null,
});

export const toRecurringTransaction = (
  r: Row,
): import("@/domain/types").RecurringTransaction => ({
  id: r.id as string,
  assetId: r.asset_id as string,
  type: r.type as Transaction["type"],
  amount: Number(r.amount ?? 0),
  currency: r.currency as string,
  frequency: r.frequency as import("@/domain/types").RecurrenceFrequency,
  dayOfMonth: r.day_of_month == null ? null : Number(r.day_of_month),
  startDate: r.start_date as string,
  endDate: (r.end_date as string) ?? null,
  isActive: Boolean(r.is_active),
  executionMode:
    (r.execution_mode as import("@/domain/types").RecurrenceExecutionMode) ?? "manual",
  lastGeneratedOn: (r.last_generated_on as string) ?? null,
  notes: (r.notes as string) ?? null,
  metadata: (r.metadata as Record<string, unknown>) ?? {},
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});


export const toValuation = (r: Row): AssetValuation => ({
  id: r.id as string,
  assetId: r.asset_id as string,
  valuationDate: r.valuation_date as string,
  unitPrice: r.unit_price == null ? null : Number(r.unit_price),
  totalValue: Number(r.total_value ?? 0),
  currency: r.currency as string,
  source: (r.source as string) ?? null,
});

export const toLiability = (r: Row): Liability => ({
  id: r.id as string,
  portfolioId: r.portfolio_id as string,
  type: r.type as Liability["type"],
  name: r.name as string,
  lender: (r.lender as string) ?? null,
  currency: r.currency as string,
  principalAmount: Number(r.principal_amount ?? 0),
  outstandingBalance: Number(r.outstanding_balance ?? 0),
  interestRate: r.interest_rate == null ? null : Number(r.interest_rate),
  rateType: (r.rate_type as Liability["rateType"]) ?? null,
  spread: r.spread == null ? null : Number(r.spread),
  referenceIndex: (r.reference_index as string) ?? null,
  monthlyPayment: r.monthly_payment == null ? null : Number(r.monthly_payment),
  startDate: (r.start_date as string) ?? null,
  endDate: (r.end_date as string) ?? null,
  termMonths: r.term_months == null ? null : Number(r.term_months),
  notes: (r.notes as string) ?? null,
  metadata: (r.metadata as Record<string, unknown>) ?? {},
});

export const toLiabilityPayment = (r: Row): LiabilityPayment => ({
  id: r.id as string,
  liabilityId: r.liability_id as string,
  paidAt: r.paid_at as string,
  amount: Number(r.amount ?? 0),
  principalPortion: Number(r.principal_portion ?? 0),
  interestPortion: Number(r.interest_portion ?? 0),
  fees: Number(r.fees ?? 0),
  notes: (r.notes as string) ?? null,
});

// ---------- Novas entidades ----------

import type {
  AssetAllocation,
  AssetCategory,
  AssetIdentifier,
  Benchmark,
  DataProvider,
  ImportJob,
  PortfolioBenchmark,
} from "@/domain/types";

export const toAssetAllocation = (r: Row): AssetAllocation => ({
  id: r.id as string,
  assetId: r.asset_id as string,
  allocationType: r.allocation_type as AssetAllocation["allocationType"],
  allocationName: r.allocation_name as string,
  percentage: Number(r.percentage ?? 0),
});

export const toBenchmark = (r: Row): Benchmark => ({
  id: r.id as string,
  name: r.name as string,
  benchmarkType: r.benchmark_type as Benchmark["benchmarkType"],
  ticker: (r.ticker as string) ?? null,
  isin: (r.isin as string) ?? null,
  provider: (r.provider as string) ?? null,
});

export const toPortfolioBenchmark = (r: Row): PortfolioBenchmark => ({
  id: r.id as string,
  portfolioId: r.portfolio_id as string,
  benchmarkId: r.benchmark_id as string,
  weight: Number(r.weight ?? 0),
});

export const toDataProvider = (r: Row): DataProvider => ({
  id: r.id as string,
  providerName: r.provider_name as string,
  providerType: r.provider_type as DataProvider["providerType"],
});

export const toImportJob = (r: Row): ImportJob => ({
  id: r.id as string,
  portfolioId: r.portfolio_id as string,
  sourceType: r.source_type as ImportJob["sourceType"],
  status: r.status as ImportJob["status"],
  recordsCreated: Number(r.records_created ?? 0),
  recordsUpdated: Number(r.records_updated ?? 0),
  errorMessage: (r.error_message as string) ?? null,
  startedAt: (r.started_at as string) ?? null,
  finishedAt: (r.finished_at as string) ?? null,
});

export const toAssetIdentifier = (r: Row): AssetIdentifier => ({
  id: r.id as string,
  assetId: r.asset_id as string,
  isin: (r.isin as string) ?? null,
  ticker: (r.ticker as string) ?? null,
  cusip: (r.cusip as string) ?? null,
  sedol: (r.sedol as string) ?? null,
  exchange: (r.exchange as string) ?? null,
  currency: (r.currency as string) ?? null,
});

export const toAssetCategory = (r: Row): AssetCategory => ({
  id: r.id as string,
  categoryType: r.category_type as AssetCategory["categoryType"],
  categoryName: r.category_name as string,
});

// ---------- Catálogos normalizados & séries temporais ----------

import type {
  AllocationTypeCatalog,
  AllocationValue,
  AssetPerformanceSnapshot,
  AssetTypeCatalog,
  BenchmarkReturn,
  LiabilityTypeCatalog,
} from "@/domain/types";

export const toAssetTypeCatalog = (r: Row): AssetTypeCatalog => ({
  id: r.id as string,
  code: r.code as string,
  name: r.name as string,
});

export const toLiabilityTypeCatalog = (r: Row): LiabilityTypeCatalog => ({
  id: r.id as string,
  code: r.code as string,
  name: r.name as string,
});

export const toAllocationTypeCatalog = (r: Row): AllocationTypeCatalog => ({
  id: r.id as string,
  code: r.code as string,
  name: r.name as string,
});

export const toAllocationValue = (r: Row): AllocationValue => ({
  id: r.id as string,
  allocationTypeId: r.allocation_type_id as string,
  value: r.value as string,
});

export const toBenchmarkReturn = (r: Row): BenchmarkReturn => ({
  id: r.id as string,
  benchmarkId: r.benchmark_id as string,
  date: r.date as string,
  returnValue: Number(r.return_value ?? 0),
});

export const toAssetPerformanceSnapshot = (
  r: Row,
): AssetPerformanceSnapshot => ({
  id: r.id as string,
  assetId: r.asset_id as string,
  snapshotDate: r.snapshot_date as string,
  marketValue: Number(r.market_value ?? 0),
  investedCapital: Number(r.invested_capital ?? 0),
  xirr: r.xirr == null ? null : Number(r.xirr),
  gainLoss: Number(r.gain_loss ?? 0),
});
