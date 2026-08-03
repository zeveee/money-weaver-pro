/**
 * IvestWise :: Domain types
 *
 * Camada de domínio pura. Sem dependências de Supabase, React ou I/O.
 * Estes tipos representam o modelo de negócio e são partilhados por
 * repositórios, serviços e apresentação.
 */

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // ISO 8601
export type CurrencyCode = string; // ISO 4217, ex.: "EUR"

// ---------- Enums (espelham o schema Postgres) ----------

export type AppRole = "admin" | "user";

export type AssetType =
  | "etf"
  | "stock"
  | "fund"
  | "capitalization_insurance"
  | "ppr"
  | "bond"
  | "cash"
  | "crypto"
  | "real_estate"
  | "commodity";

export type LiabilityType =
  | "mortgage"
  | "auto_loan"
  | "personal_loan"
  | "other";

export type TransactionType =
  | "buy"
  | "sell"
  | "dividend"
  | "interest"
  | "coupon"
  | "deposit"
  | "withdrawal"
  | "fee"
  | "tax"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";

export type InterestRateType = "fixed" | "variable" | "mixed";

// ---------- Entidades ----------

export interface Profile {
  id: UUID;
  displayName: string | null;
  baseCurrency: CurrencyCode;
  locale: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Portfolio {
  id: UUID;
  userId: UUID;
  groupId: UUID | null;
  name: string;
  description: string | null;
  baseCurrency: CurrencyCode;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Asset {
  id: UUID;
  portfolioId: UUID;
  type: AssetType;
  name: string;
  ticker: string | null;
  isin: string | null;
  currency: CurrencyCode;
  quantity: number;
  averageCost: number;
  currentValue: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  acquiredAt: ISODate | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Transaction {
  id: UUID;
  assetId: UUID;
  type: TransactionType;
  occurredAt: ISODateTime;
  quantity: number;
  unitPrice: number;
  amount: number;
  currency: CurrencyCode;
  fees: number;
  taxes: number;
  notes: string | null;
  metadata: Record<string, unknown>;
}

export interface AssetValuation {
  id: UUID;
  assetId: UUID;
  valuationDate: ISODate;
  unitPrice: number | null;
  totalValue: number;
  currency: CurrencyCode;
  source: string | null;
}

export interface Liability {
  id: UUID;
  portfolioId: UUID;
  type: LiabilityType;
  name: string;
  lender: string | null;
  currency: CurrencyCode;
  principalAmount: number;
  outstandingBalance: number;
  interestRate: number | null;
  rateType: InterestRateType | null;
  spread: number | null;
  referenceIndex: string | null;
  monthlyPayment: number | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
  termMonths: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
}

export interface LiabilityPayment {
  id: UUID;
  liabilityId: UUID;
  paidAt: ISODate;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  fees: number;
  notes: string | null;
}

// ---------- Novas entidades ----------

export type AllocationType =
  | "sector"
  | "geography"
  | "asset_class"
  | "esg"
  | "factor"
  | "currency"
  | "custom";

export type BenchmarkType =
  | "equity_index"
  | "bond_index"
  | "commodity"
  | "currency"
  | "composite"
  | "custom";

export type DataProviderType =
  | "market_data"
  | "fundamentals"
  | "reference_data"
  | "documents"
  | "other";

export type ImportSourceType = "csv" | "xlsx" | "pdf" | "api" | "manual";
export type ImportStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partial";

export type AssetCategoryType =
  | "sector"
  | "geography"
  | "asset_class"
  | "esg"
  | "factor"
  | "strategy"
  | "custom";

export interface AssetAllocation {
  id: UUID;
  assetId: UUID;
  allocationType: AllocationType;
  allocationName: string;
  percentage: number;
}

export interface Benchmark {
  id: UUID;
  name: string;
  benchmarkType: BenchmarkType;
  ticker: string | null;
  isin: string | null;
  provider: string | null;
}

export interface PortfolioBenchmark {
  id: UUID;
  portfolioId: UUID;
  benchmarkId: UUID;
  weight: number;
}

export interface DataProvider {
  id: UUID;
  providerName: string;
  providerType: DataProviderType;
}

export interface ImportJob {
  id: UUID;
  portfolioId: UUID;
  sourceType: ImportSourceType;
  status: ImportStatus;
  recordsCreated: number;
  recordsUpdated: number;
  errorMessage: string | null;
  startedAt: ISODateTime | null;
  finishedAt: ISODateTime | null;
}

export interface AssetIdentifier {
  id: UUID;
  assetId: UUID;
  isin: string | null;
  ticker: string | null;
  cusip: string | null;
  sedol: string | null;
  exchange: string | null;
  currency: CurrencyCode | null;
}

export interface AssetCategory {
  id: UUID;
  categoryType: AssetCategoryType;
  categoryName: string;
}

// ---------- Catálogos normalizados ----------

/** Catálogo global de tipos de ativos (ETF, Stock, Bond, ...). */
export interface AssetTypeCatalog {
  id: UUID;
  code: string; // ex.: "etf", "stock"
  name: string; // ex.: "ETF", "Stock"
}

/** Catálogo global de tipos de passivos (Mortgage, Auto Loan, ...). */
export interface LiabilityTypeCatalog {
  id: UUID;
  code: string;
  name: string;
}

/** Tipos de alocação configuráveis (Sector, Geography, ESG, ...). */
export interface AllocationTypeCatalog {
  id: UUID;
  code: string;
  name: string;
}

/** Valores possíveis para cada allocation_type (ex.: Sector → Technology). */
export interface AllocationValue {
  id: UUID;
  allocationTypeId: UUID;
  value: string;
}

// ---------- Séries temporais ----------

/** Rentabilidade histórica de um benchmark, por data. */
export interface BenchmarkReturn {
  id: UUID;
  benchmarkId: UUID;
  date: ISODate;
  returnValue: number; // ex.: 0.0123 para +1,23%
}

/** Snapshot de métricas calculadas para um ativo numa dada data. */
export interface AssetPerformanceSnapshot {
  id: UUID;
  assetId: UUID;
  snapshotDate: ISODate;
  marketValue: number;
  investedCapital: number;
  xirr: number | null;
  gainLoss: number;
}

// ---------- Agrupamento e FX ----------

/** Grupo lógico de carteiras (ex.: Reforma, Família, Investimentos). */
export interface PortfolioGroup {
  id: UUID;
  ownerId: UUID;
  name: string;
  description: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Taxa de câmbio entre duas moedas numa data (ex.: EUR/USD). */
export interface ExchangeRate {
  id: UUID;
  date: ISODate;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  exchangeRate: number;
}

// ---------- Agregados (views compostas de leitura) ----------

export interface PortfolioSnapshot {
  portfolio: Portfolio;
  assets: Asset[];
  liabilities: Liability[];
}
