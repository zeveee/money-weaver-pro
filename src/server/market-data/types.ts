/**
 * IvestWise :: Market Data Providers — contrato baseado em capacidades
 *
 * Cada fornecedor declara apenas as capacidades que sabe servir. A orquestração
 * (resolve.ts) escolhe fornecedor POR CAPACIDADE, nunca "o fornecedor do ativo".
 *
 * Regra dura: a forma bruta da resposta de um fornecedor NUNCA sai do ficheiro
 * do provider. Tudo o que atravessa esta fronteira está normalizado aqui.
 */

import type { ISODate, UUID } from "@/domain/types";

// ---------- Resultado normalizado (sucesso vs. modos de falha distintos) ----------

export type ProviderFailureReason =
  /** O fornecedor respondeu bem, mas não conhece o instrumento. */
  | "not_found"
  /** Quota/plano esgotado ou pedido demasiado frequente (402/429). */
  | "rate_limit"
  /** Chave em falta, inválida ou sem permissão para o endpoint (401/403). */
  | "unauthorized"
  /** Falha de rede, timeout, DNS. */
  | "network"
  /** HTTP 2xx mas corpo inesperado, ou 5xx do fornecedor. */
  | "invalid_response";

export interface ProviderSuccess<T> {
  ok: true;
  data: T;
}

export interface ProviderFailure {
  ok: false;
  reason: ProviderFailureReason;
  message: string;
}

export type ProviderResult<T> = ProviderSuccess<T> | ProviderFailure;

export const providerOk = <T>(data: T): ProviderSuccess<T> => ({ ok: true, data });

export const providerFail = (
  reason: ProviderFailureReason,
  message: string,
): ProviderFailure => ({ ok: false, reason, message });

// ---------- Tipos normalizados ----------

export interface ResolvedInstrument {
  /** Identificador estável no fornecedor (ex.: "IWDA.AS" na EODHD). */
  providerInstrumentId: string;
  symbol: string | null;
  exchange: string | null;
  currency: string | null;
  name: string | null;
  isin: string | null;
  /** Payload bruto, apenas para auditoria/persistência opaca. */
  raw: Record<string, unknown>;
}

export interface PricePoint {
  date: ISODate;
  /** Preço de fecho (ou NAV) na moeda do instrumento. */
  close: number;
  currency: string | null;
}

export interface AllocationSlice {
  /** Dimensão: "sector" | "geography" | ... (alinhado com AllocationType). */
  dimension: string;
  name: string;
  /** 0–100. */
  percentage: number;
}

export interface HoldingLine {
  name: string;
  isin: string | null;
  weight: number;
}

export interface FundMetadata {
  name: string | null;
  currency: string | null;
  ongoingCharge: number | null;
  inceptionDate: ISODate | null;
}

export interface HistoricalRange {
  /** Inclusivo. Omitido = desde o início disponível no fornecedor. */
  from?: ISODate;
  /** Inclusivo. Omitido = até hoje. */
  to?: ISODate;
}

// ---------- Capacidades ----------

/** Pistas do ativo para desambiguar listings com o mesmo ISIN. */
export interface IdentityHints {
  ticker?: string | null;
  currency?: string | null;
}

export interface IdentityCapability {
  resolveByIsin(
    isin: string,
    hints?: IdentityHints,
  ): Promise<ProviderResult<ResolvedInstrument>>;
}

export interface PricingCapability {
  getLatestPrice(providerInstrumentId: string): Promise<ProviderResult<PricePoint>>;
}

export interface HistoricalPricingCapability {
  getHistoricalPrices(
    providerInstrumentId: string,
    range: HistoricalRange,
  ): Promise<ProviderResult<PricePoint[]>>;
}

export interface AllocationCapability {
  getAllocation(providerInstrumentId: string): Promise<ProviderResult<AllocationSlice[]>>;
}

export interface HoldingsCapability {
  getHoldings(providerInstrumentId: string): Promise<ProviderResult<HoldingLine[]>>;
}

export interface FundMetadataCapability {
  getFundMetadata(providerInstrumentId: string): Promise<ProviderResult<FundMetadata>>;
}

export interface DiscoveryCapability {
  searchInstruments(query: string): Promise<ProviderResult<ResolvedInstrument[]>>;
}

export interface MarketDataProvider {
  /** Nome canónico, gravado em asset_provider_links.provider e asset_valuations.source. */
  readonly name: string;
  readonly identity?: IdentityCapability;
  readonly pricing?: PricingCapability;
  readonly historicalPricing?: HistoricalPricingCapability;
  readonly allocation?: AllocationCapability;
  readonly holdings?: HoldingsCapability;
  readonly fundMetadata?: FundMetadataCapability;
  readonly discovery?: DiscoveryCapability;
}

export type CapabilityName =
  | "pricing"
  | "historicalPricing"
  | "allocation"
  | "holdings"
  | "fundMetadata";

// ---------- Ligação ativo ↔ fornecedor ----------

export type ProviderLinkStatus = "active" | "not_found" | "disabled";

export interface AssetProviderLink {
  id: UUID;
  assetId: UUID;
  provider: string;
  providerInstrumentId: string;
  providerSymbol: string | null;
  providerExchange: string | null;
  providerCurrency: string | null;
  status: ProviderLinkStatus;
  resolvedAt: string;
  lastVerifiedAt: string | null;
  /** Cursor de sincronização: último dia já pedido ao fornecedor. */
  lastSyncedDate: ISODate | null;
}
