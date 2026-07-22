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
  | "real_estate";

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

// ---------- Agregados (views compostas de leitura) ----------

export interface PortfolioSnapshot {
  portfolio: Portfolio;
  assets: Asset[];
  liabilities: Liability[];
}
