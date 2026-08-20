/**
 * IvestWise :: Amplify Holdings Provider
 *
 * A Amplify publica a carteira COMPLETA dos seus ETFs numa página por fundo
 * (`https://amplifyetfs.com/{ticker}-holdings/`). Essa página não traz a tabela
 * no HTML: monta-a no browser a partir do Firestore público do emissor
 * (projeto `amplify-etfs-data-feed`), que é exatamente a mesma origem usada
 * pelo botão "Download Holdings as a CSV file" — por isso não existe endpoint
 * `.csv` estático e não é preciso browser headless: basta a REST API do
 * Firestore, acedida com a chave pública que a própria página expõe.
 *
 * Fluxo:
 *   1. descoberta — constrói a URL por convenção e valida-a por HTTP;
 *   2. validação — a página tem de declarar `data-fund="{TICKER}"`;
 *   3. metadados — `funds/{T}/fund_metadata/overview` (nome oficial, ISIN);
 *   4. carteira — documento mais recente de `funds/{T}/holdings`;
 *   5. normalização — nada da forma bruta sai deste ficheiro.
 */

import {
  providerFail,
  providerOk,
  type ProviderResult,
} from "../../market-data/types";
import type {
  FundIdentity,
  HoldingsProvider,
  HoldingsSnapshot,
  NormalizedHolding,
} from "../types";

export const AMPLIFY_PROVIDER_NAME = "amplify";

const SITE = "https://amplifyetfs.com";
const FIRESTORE = "https://firestore.googleapis.com/v1";
const PROJECT = "amplify-etfs-data-feed";
/** Chave pública do site da Amplify (exposta no bundle do próprio emissor). */
const PUBLIC_API_KEY = "AIzaSyCibhGo4lu8ZALtBvf_ZT351BDMUPqOYjc";
/** A Amplify reporta "Market Value ($)": os fundos são denominados em USD. */
const REPORTING_CURRENCY = "USD";

const docBase = (ticker: string) =>
  `${FIRESTORE}/projects/${PROJECT}/databases/(default)/documents/funds/${encodeURIComponent(ticker)}`;

// ---------- Leitura de valores Firestore (formato REST tipado) ----------

type FsValue = Record<string, unknown>;

const fsString = (v: unknown): string | null => {
  const f = v as FsValue | undefined;
  const s = f?.["stringValue"];
  return typeof s === "string" && s.trim() !== "" ? s.trim() : null;
};

const fsNumber = (v: unknown): number | null => {
  const f = v as FsValue | undefined;
  if (!f) return null;
  const raw = f["doubleValue"] ?? f["integerValue"];
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "1.33%" | 1.33 → 1.33 */
const toPercent = (v: unknown): number | null => {
  const s = fsString(v);
  if (s !== null) {
    const n = Number(s.replace("%", "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return fsNumber(v);
};

const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------- HTTP ----------

async function getJson<T>(url: string, init?: RequestInit): Promise<ProviderResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return providerFail("network", e instanceof Error ? e.message : String(e));
  }
  if (res.status === 404) return providerFail("not_found", `Amplify: 404 em ${url}`);
  if (res.status === 429) return providerFail("rate_limit", "Amplify: rate limit");
  if (!res.ok) return providerFail("invalid_response", `Amplify: HTTP ${res.status}`);
  try {
    return providerOk((await res.json()) as T);
  } catch (e) {
    return providerFail("invalid_response", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Estratégia de descoberta: convenção `/{ticker}-holdings/`, sempre validada.
 * Se a página não existir ou não pertencer ao ticker pedido, devolve
 * `not_found` — nunca se assume a URL às cegas.
 */
async function discoverHoldingsPage(ticker: string): Promise<ProviderResult<string>> {
  const url = `${SITE}/${ticker.toLowerCase()}-holdings/`;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (e) {
    return providerFail("network", e instanceof Error ? e.message : String(e));
  }
  if (res.status === 404) {
    return providerFail("not_found", `Amplify: holdings source not found para ${ticker}`);
  }
  if (!res.ok) return providerFail("invalid_response", `Amplify: HTTP ${res.status} em ${url}`);

  const html = await res.text();
  const declared = new RegExp(`data-fund="${ticker.toUpperCase()}"`, "i").test(html);
  if (!declared) {
    return providerFail(
      "not_found",
      `Amplify: a página ${url} não corresponde ao ETF ${ticker}`,
    );
  }
  return providerOk(url);
}

interface FsDoc {
  name?: string;
  fields?: Record<string, unknown>;
}

async function fetchMetadata(
  ticker: string,
): Promise<ProviderResult<{ name: string | null; isin: string | null }>> {
  const res = await getJson<FsDoc>(
    `${docBase(ticker)}/fund_metadata/overview?key=${PUBLIC_API_KEY}`,
  );
  if (!res.ok) return res;

  const fields = res.data.fields ?? {};
  const declaredTicker = fsString(fields["Ticker"]);
  if (declaredTicker && declaredTicker.toUpperCase() !== ticker.toUpperCase()) {
    return providerFail("not_found", `Amplify: metadados de ${declaredTicker} ≠ ${ticker}`);
  }
  return providerOk({
    name: fsString(fields["DisplayName"]),
    isin: fsString(fields["ISIN"]),
  });
}

/** Documento de holdings mais recente (o id do documento é a as-of date). */
async function fetchLatestHoldingsDoc(
  ticker: string,
): Promise<ProviderResult<{ asOfDate: string; rows: unknown[] }>> {
  const res = await getJson<Array<{ document?: FsDoc }>>(
    `${docBase(ticker)}:runQuery?key=${PUBLIC_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "holdings" }],
          orderBy: [{ field: { fieldPath: "__name__" }, direction: "DESCENDING" }],
          limit: 1,
        },
      }),
    },
  );
  if (!res.ok) return res;

  const doc = Array.isArray(res.data) ? res.data[0]?.document : undefined;
  if (!doc?.fields) {
    return providerFail("not_found", `Amplify: sem holdings publicadas para ${ticker}`);
  }

  const docId = (doc.name ?? "").split("/").pop() ?? "";
  const asOfDate = fsString(doc.fields["asOfDate"]) ?? docId;
  if (!isIsoDate(asOfDate)) {
    return providerFail("invalid_response", `Amplify: as-of date inválida (${asOfDate})`);
  }

  const arr = (doc.fields["holdings"] as FsValue | undefined)?.["arrayValue"] as
    | { values?: unknown[] }
    | undefined;
  const rows = arr?.values ?? [];
  if (rows.length === 0) {
    return providerFail("not_found", `Amplify: carteira vazia para ${ticker}`);
  }
  return providerOk({ asOfDate, rows });
}

function toHolding(row: unknown): NormalizedHolding | null {
  const fields = ((row as FsValue | undefined)?.["mapValue"] as FsValue | undefined)?.[
    "fields"
  ] as Record<string, unknown> | undefined;
  if (!fields) return null;

  const holdingName = fsString(fields["SecurityName"]);
  if (!holdingName) return null;

  return {
    holdingName,
    holdingTicker: fsString(fields["StockTicker"]),
    cusip: fsString(fields["CUSIP"]),
    weightPercent: toPercent(fields["Weightings"]),
    shares: fsNumber(fields["Shares"]),
    marketValue: fsNumber(fields["MarketValue"]),
    currency: REPORTING_CURRENCY,
  };
}

async function getHoldings(fund: FundIdentity): Promise<ProviderResult<HoldingsSnapshot>> {
  const ticker = fund.ticker.trim().toUpperCase();
  if (!ticker) return providerFail("not_found", "Amplify: ticker em falta");

  const page = await discoverHoldingsPage(ticker);
  if (!page.ok) return page;

  const meta = await fetchMetadata(ticker);
  if (!meta.ok) return meta;

  const wantedIsin = fund.isin?.trim().toUpperCase();
  if (wantedIsin && meta.data.isin && meta.data.isin.toUpperCase() !== wantedIsin) {
    return providerFail(
      "not_found",
      `Amplify: ISIN da fonte (${meta.data.isin}) ≠ pedido (${wantedIsin})`,
    );
  }

  const latest = await fetchLatestHoldingsDoc(ticker);
  if (!latest.ok) return latest;

  const holdings = latest.data.rows
    .map(toHolding)
    .filter((h): h is NormalizedHolding => h !== null);

  if (holdings.length === 0) {
    return providerFail("invalid_response", `Amplify: nenhuma linha válida para ${ticker}`);
  }

  return providerOk({
    fundTicker: ticker,
    fundName: meta.data.name ?? fund.name ?? null,
    fundIsin: meta.data.isin,
    asOfDate: latest.data.asOfDate,
    holdings,
    sourceProvider: AMPLIFY_PROVIDER_NAME,
    sourceUrl: page.data,
    retrievedAt: new Date().toISOString(),
  });
}

export const amplifyHoldingsProvider: HoldingsProvider = {
  name: AMPLIFY_PROVIDER_NAME,
  issuers: ["amplify", "amplify etfs", "amplify investments llc"],
  getHoldings,
};
