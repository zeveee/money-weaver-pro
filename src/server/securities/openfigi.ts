/**
 * IvestWise :: OpenFIGI — cliente de reference data
 *
 * Primeira fonte externa de identificação de securities. A API `v3/mapping`
 * aceita lotes de jobs (identificador → instrumentos). Sem chave: 10 jobs por
 * pedido e ~25 pedidos/minuto; com `OPENFIGI_API_KEY` os limites sobem.
 *
 * Regra dura (igual aos restantes providers): a forma bruta da resposta NUNCA
 * sai deste ficheiro.
 */

import { providerFail, providerOk, type ProviderResult } from "../market-data/types";
import type { SecurityIdType } from "./types";

const ENDPOINT = "https://api.openfigi.com/v3/mapping";

const ID_TYPE_MAP: Record<SecurityIdType, string> = {
  isin: "ID_ISIN",
  cusip: "ID_CUSIP",
  sedol: "ID_SEDOL",
  ticker: "TICKER",
};

/** Candidato normalizado devolvido pelo OpenFIGI. */
export interface FigiCandidate {
  figi: string;
  compositeFigi: string | null;
  shareClassFigi: string | null;
  name: string | null;
  ticker: string | null;
  exchange: string | null;
  securityType: string | null;
  marketSector: string | null;
}

export interface FigiJob {
  idType: SecurityIdType;
  idValue: string;
  /** Restringe a pesquisa (usado sobretudo para tickers, ex.: "US"). */
  exchCode?: string;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

function normalizeCandidates(raw: unknown): FigiCandidate[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: FigiCandidate[] = [];
  for (const r of rows) {
    const o = r as Record<string, unknown>;
    const figi = str(o["figi"]);
    if (!figi) continue;
    out.push({
      figi,
      compositeFigi: str(o["compositeFIGI"]),
      shareClassFigi: str(o["shareClassFIGI"]),
      name: str(o["name"]),
      ticker: str(o["ticker"]),
      exchange: str(o["exchCode"]),
      securityType: str(o["securityType2"]) ?? str(o["securityType"]),
      marketSector: str(o["marketSector"]),
    });
  }
  return out;
}

/** Lote: devolve, para cada job (mesma ordem), os candidatos encontrados. */
export async function figiMapping(
  jobs: FigiJob[],
): Promise<ProviderResult<FigiCandidate[][]>> {
  if (jobs.length === 0) return providerOk([]);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env["OPENFIGI_API_KEY"];
  if (apiKey) headers["X-OPENFIGI-APIKEY"] = apiKey;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(
        jobs.map((j) => ({
          idType: ID_TYPE_MAP[j.idType],
          idValue: j.idValue,
          ...(j.exchCode ? { exchCode: j.exchCode } : {}),
        })),
      ),
    });
  } catch (e) {
    return providerFail("network", `OpenFIGI inacessível: ${(e as Error).message}`);
  }

  if (res.status === 429) return providerFail("rate_limit", "OpenFIGI: limite de pedidos atingido.");
  if (res.status === 401 || res.status === 403)
    return providerFail("unauthorized", "OpenFIGI: chave inválida ou sem permissão.");
  if (!res.ok) return providerFail("invalid_response", `OpenFIGI HTTP ${res.status}`);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return providerFail("invalid_response", "OpenFIGI devolveu um corpo não-JSON.");
  }
  if (!Array.isArray(body) || body.length !== jobs.length)
    return providerFail("invalid_response", "OpenFIGI devolveu um formato inesperado.");

  return providerOk(
    body.map((entry) => {
      const o = entry as Record<string, unknown>;
      return normalizeCandidates(o["data"]);
    }),
  );
}

/** Máximo de jobs por pedido sem chave de API. */
export const FIGI_BATCH_SIZE = 10;
