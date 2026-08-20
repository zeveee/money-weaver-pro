/**
 * IvestWise :: Holdings Providers — contrato genérico por emissor
 *
 * Cada emissor (Amplify, HANetf, WisdomTree, iShares, ...) publica a carteira
 * dos seus ETFs de forma diferente. Este contrato normaliza o resultado: a
 * forma bruta da fonte NUNCA atravessa esta fronteira.
 *
 * Reutiliza `ProviderResult` do módulo de market data — os modos de falha são
 * os mesmos (not_found, network, invalid_response, ...).
 */

import type { ISODate } from "@/domain/types";
import type { ProviderResult } from "../market-data/types";

/** Identificação do ETF para o qual queremos a carteira. */
export interface FundIdentity {
  /** Identificador principal nesta fase. */
  ticker: string;
  /**
   * Emissor; determina o provider escolhido pelo registry. Quando ausente, o
   * registry tenta todos os providers (cada um valida o ticker na sua fonte).
   */
  issuer?: string | null;
  name?: string | null;
  isin?: string | null;
}

/** Linha de carteira normalizada. Campos ausentes na fonte ficam `null`. */
export interface NormalizedHolding {
  holdingName: string;
  holdingTicker: string | null;
  cusip: string | null;
  /** 0–100. */
  weightPercent: number | null;
  shares: number | null;
  marketValue: number | null;
  currency: string | null;
}

/**
 * Cobertura da composição devolvida pela fonte.
 * - `full`    — a fonte publica a carteira completa (ex.: Amplify).
 * - `partial` — a fonte só publica um subconjunto (ex.: Top 10 de agregadores).
 * - `unknown` — a fonte não permite determinar a cobertura.
 */
export type HoldingsCoverage = "full" | "partial" | "unknown";

/** Carteira + proveniência. */
export interface HoldingsSnapshot {
  fundTicker: string;
  fundName: string | null;
  fundIsin: string | null;
  asOfDate: ISODate;
  holdings: NormalizedHolding[];
  /** Cobertura declarada pelo provider — a UI nunca a infere sozinha. */
  coverage: HoldingsCoverage;
  /** Quando `coverage === "partial"`, nº total de posições do fundo, se conhecido. */
  totalHoldingsCount: number | null;
  sourceProvider: string;
  sourceUrl: string;
  retrievedAt: string;
}

export interface HoldingsProvider {
  /** Nome canónico (ex.: "amplify"). */
  readonly name: string;
  /** Emissores servidos por este provider (comparação case-insensitive). */
  readonly issuers: readonly string[];
  getHoldings(fund: FundIdentity): Promise<ProviderResult<HoldingsSnapshot>>;
}
