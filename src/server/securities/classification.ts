/**
 * IvestWise :: Enriquecimento do Security Master com setor e geografia
 *
 * Fonte: Nasdaq Stock Screener (api.nasdaq.com), o mesmo diretório público que
 * alimenta o site da Nasdaq. Publica, por símbolo cotado nos EUA (NASDAQ/NYSE/
 * AMEX): `sector`, `industry` e `country` (país da empresa). É gratuito, sem
 * chave, e cobre exatamente o universo em que a maioria das holdings de ETFs
 * americanos vive.
 *
 * Regras duras:
 *  - NUNCA inferimos. Sem linha na fonte ⇒ a security fica sem classificação
 *    (a UI mostra "Não classificado").
 *  - A classificação pertence à SECURITY (catálogo global), nunca ao asset do
 *    utilizador.
 *  - Não toca no matching/OpenFIGI: corre depois, sobre securities já
 *    identificadas.
 */

import type { SecurityRecord } from "./types";
import type { SecurityStore } from "./store";

export const CLASSIFICATION_SOURCE = "nasdaq_screener";

const URL =
  "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25000&download=true";

/** Cache do diretório (o ficheiro é grande e muda no máximo uma vez por dia). */
const TTL_MS = 6 * 60 * 60 * 1000;

export interface ClassificationRow {
  sector: string | null;
  industry: string | null;
  country: string | null;
}

let cache: { at: number; rows: Map<string, ClassificationRow> } | null = null;

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" || s === "N/A" ? null : s;
};

/** Normaliza símbolos para comparação (BRK/B ↔ BRK.B ↔ BRK-B). */
export const normalizeSymbol = (v: string): string =>
  v.trim().toUpperCase().replace(/[./]/g, "-");

export async function fetchDirectory(): Promise<Map<string, ClassificationRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const res = await fetch(URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; IvestWise/1.0)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Nasdaq screener ${res.status}`);

  const body = (await res.json()) as {
    data?: { rows?: Record<string, unknown>[] | null } | null;
  };
  const rows = body.data?.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Nasdaq screener: resposta sem linhas");
  }

  const map = new Map<string, ClassificationRow>();
  for (const r of rows) {
    const symbol = clean(r["symbol"]);
    if (!symbol) continue;
    map.set(normalizeSymbol(symbol), {
      sector: clean(r["sector"]),
      industry: clean(r["industry"]),
      country: clean(r["country"]),
    });
  }

  cache = { at: Date.now(), rows: map };
  return map;
}

export interface EnrichResult {
  /** Securities atualizadas (id → registo já com classificação). */
  updated: Map<string, SecurityRecord>;
  classified: number;
  /** Securities consultadas sem linha na fonte. */
  notFound: number;
  error: string | null;
}

/**
 * Enriquece as securities que ainda não têm classificação. Idempotente: uma
 * security já classificada nunca é reconsultada.
 */
export async function enrichSecurities(
  securities: SecurityRecord[],
  store: SecurityStore,
): Promise<EnrichResult> {
  const updated = new Map<string, SecurityRecord>();
  const todo = securities.filter((s) => s.classificationSource === null);
  if (todo.length === 0) {
    return { updated, classified: 0, notFound: 0, error: null };
  }

  let directory: Map<string, ClassificationRow>;
  try {
    directory = await fetchDirectory();
  } catch (e) {
    return { updated, classified: 0, notFound: 0, error: (e as Error).message };
  }

  let classified = 0;
  let notFound = 0;
  let error: string | null = null;

  for (const sec of todo) {
    const ticker = sec.ticker ? normalizeSymbol(sec.ticker) : null;
    const row = ticker ? directory.get(ticker) : undefined;
    if (!row || (!row.sector && !row.country)) {
      notFound += 1;
      continue;
    }
    try {
      const next = await store.updateClassification(sec.id, {
        sector: row.sector,
        industry: row.industry,
        country: row.country,
        classificationSource: CLASSIFICATION_SOURCE,
      });
      updated.set(sec.id, next);
      classified += 1;
    } catch (e) {
      error = `Security Master: ${(e as Error).message}`;
    }
  }

  return { updated, classified, notFound, error };
}
