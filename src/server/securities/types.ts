/**
 * IvestWise :: Security Master — contrato
 *
 * Catálogo GLOBAL de securities descobertas pela aplicação. É independente
 * dos `assets` do utilizador: uma holding pode referir uma ação que ninguém
 * comprou e mesmo assim tem de ser identificada.
 *
 * Nota sobre `AssetIdentifier` (domínio): esse tipo liga identificadores a um
 * ativo CONCRETO do utilizador (`assetId`), pelo que não serve como catálogo
 * global. Os campos de identificação são deliberadamente os mesmos
 * (isin/ticker/cusip/sedol/exchange/currency) para permitir, numa fase
 * futura, ligar `assets` ↔ `securities` sem conversões.
 */

/** Estado da identificação de uma holding. Espelha o enum `security_match_status`. */
export type SecurityMatchStatus = "identified" | "ambiguous" | "unidentified";

/** Tipos de identificador suportados pelo matcher (ordem de força decrescente). */
export type SecurityIdType = "isin" | "cusip" | "sedol" | "ticker";

/** Security normalizada no catálogo global. */
export interface SecurityRecord {
  id: string;
  figi: string | null;
  compositeFigi: string | null;
  shareClassFigi: string | null;
  name: string | null;
  ticker: string | null;
  isin: string | null;
  cusip: string | null;
  sedol: string | null;
  exchange: string | null;
  currency: string | null;
  securityType: string | null;
  marketSector: string | null;
  /** Origem da informação (ex.: "openfigi"). */
  source: string;
}

/** Resultado do matching de UMA holding. */
export interface HoldingMatch {
  /** Chave estável da holding dentro do snapshot (ticker/cusip/nome). */
  holdingKey: string;
  status: SecurityMatchStatus;
  security: SecurityRecord | null;
  /** Identificador que produziu o resultado (null quando não houve nenhum utilizável). */
  matchedBy: SecurityIdType | null;
  /** Nº de candidatos devolvidos pela fonte (>1 ⇒ ambígua). */
  candidateCount: number;
  /** Origem da identificação: "security_master" (cache) ou "openfigi". */
  source: string;
  message: string | null;
}

export interface HoldingsMatchSummary {
  total: number;
  identified: number;
  ambiguous: number;
  unidentified: number;
}

export interface HoldingsMatchResult {
  summary: HoldingsMatchSummary;
  matches: HoldingMatch[];
}
