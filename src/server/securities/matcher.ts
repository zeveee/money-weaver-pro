/**
 * IvestWise :: Matcher genérico Holding → Security
 *
 * Independente do emissor: recebe `NormalizedHolding[]` (o tipo já existente
 * no módulo de holdings) e devolve, por holding, o estado da identificação.
 * Qualquer provider (Amplify, HANetf, iShares, …) usa exatamente este caminho.
 *
 * Estratégia:
 *   1. identificadores fortes primeiro: ISIN → CUSIP → SEDOL; ticker é o
 *      último recurso (fraco: colide entre bolsas).
 *   2. cada identificador é procurado primeiro no Security Master
 *      (`security_lookups` + candidatos); só o desconhecido vai ao OpenFIGI.
 *   3. o lookup guarda o CONJUNTO de candidatos da fonte (união acumulativa),
 *      nunca uma associação permanente `identificador → security`.
 *   4. a decisão é tomada por holding, cruzando os candidatos com o contexto
 *      (nome, ticker, moeda, bolsa) em `select.ts`. Um identificador isolado
 *      nunca bloqueia a descoberta de outra security.
 */

import type { NormalizedHolding } from "../holdings/types";
import { holdingKeyOf } from "@/lib/holding-key";
import { FIGI_BATCH_SIZE, figiMapping, type FigiCandidate, type FigiJob } from "./openfigi";
import { selectCandidate, type HoldingContext } from "./select";
import {
  createSupabaseSecurityStore,
  lookupKey,
  type SecurityStore,
} from "./store";
import type {
  HoldingMatch,
  HoldingsMatchResult,
  SecurityIdType,
  SecurityRecord,
} from "./types";

const SOURCE = "openfigi";

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim().toUpperCase();
  return s === "" || s === "N/A" || s === "-" ? null : s;
};

const isIsin = (v: string) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v);
const isCusip = (v: string) => /^[A-Z0-9]{9}$/.test(v);
const isSedol = (v: string) => /^[A-Z0-9]{7}$/.test(v);
/** Tickers de mercado; exclui linhas de caixa/derivados sem símbolo real. */
const isTicker = (v: string) => /^[A-Z][A-Z0-9.\-/]{0,9}$/.test(v);

export interface HoldingIdentifiers {
  idType: SecurityIdType;
  idValue: string;
}

/**
 * Identificadores utilizáveis de uma holding, por ordem de força.
 * A Amplify (e outros) publica por vezes um SEDOL no campo CUSIP — a
 * classificação é feita pela forma do valor, não pelo nome do campo.
 */
export function holdingIdentifiers(h: NormalizedHolding): HoldingIdentifiers[] {
  const out: HoldingIdentifiers[] = [];
  const raw = clean(h.cusip);
  if (raw) {
    if (isIsin(raw)) out.push({ idType: "isin", idValue: raw });
    else if (isCusip(raw)) out.push({ idType: "cusip", idValue: raw });
    else if (isSedol(raw)) out.push({ idType: "sedol", idValue: raw });
  }
  const ticker = clean(h.holdingTicker);
  if (ticker && isTicker(ticker)) out.push({ idType: "ticker", idValue: ticker });
  return out;
}

/** Reexportada para o servidor; a definição é partilhada com a UI. */
export { holdingKeyOf };

function candidateToSecurity(
  c: FigiCandidate,
  ident: HoldingIdentifiers,
  currency: string | null,
): Omit<SecurityRecord, "id"> {
  return {
    figi: c.figi,
    compositeFigi: c.compositeFigi,
    shareClassFigi: c.shareClassFigi,
    name: c.name,
    ticker: c.ticker ?? (ident.idType === "ticker" ? ident.idValue : null),
    isin: ident.idType === "isin" ? ident.idValue : null,
    cusip: ident.idType === "cusip" ? ident.idValue : null,
    sedol: ident.idType === "sedol" ? ident.idValue : null,
    exchange: c.exchange,
    currency,
    securityType: c.securityType,
    marketSector: c.marketSector,
    source: SOURCE,
    // Classificação (setor/país) é preenchida noutra fase, sobre a security
    // já identificada — o matching não a produz nem a apaga.
    sector: null,
    industry: null,
    country: null,
    classificationSource: null,
  };
}

export interface MatchOptions {
  store?: SecurityStore;
  /** Bolsa preferida para pesquisas por ticker (a Amplify reporta em USD/US). */
  tickerExchCode?: string;
  /** Moeda de referência do snapshot; usada quando a holding não traz moeda. */
  currency?: string | null;
  /** Pausa entre lotes OpenFIGI (limite ~25 pedidos/min sem chave). */
  batchDelayMs?: number;
  /**
   * Orçamento de tempo para consultas externas. Ao esgotar, devolvemos o que
   * já foi resolvido (e persistido) e deixamos o resto como `pending`, para
   * ser concluído numa passagem seguinte a partir do Security Master.
   */
  budgetMs?: number;
  /** Desliga o enriquecimento setor/país (testes offline). */
  enrich?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const contextOf = (h: NormalizedHolding, fallbackCurrency: string | null): HoldingContext => ({
  name: h.holdingName,
  ticker: h.holdingTicker,
  currency: clean(h.currency) ?? fallbackCurrency,
  exchange: null,
});

export async function matchHoldings(
  holdings: NormalizedHolding[],
  options: MatchOptions = {},
): Promise<HoldingsMatchResult> {
  const store = options.store ?? createSupabaseSecurityStore();
  const exchCode = options.tickerExchCode ?? "US";
  const delay = options.batchDelayMs ?? 300;
  const deadline = options.budgetMs ? Date.now() + options.budgetMs : null;
  const fallbackCurrency = clean(options.currency ?? null);

  const idents = holdings.map(holdingIdentifiers);
  let lastError: string | null = null;

  // 1) Memória do Security Master (conjunto de candidatos por identificador).
  const allKeys = [...new Set(idents.flat().map((i) => lookupKey(i.idType, i.idValue)))];
  const known = await store.getLookups(allKeys);

  /** Candidatos conhecidos por chave de lookup (união acumulada). */
  const candidatesByKey = new Map<string, SecurityRecord[]>();
  for (const [k, entry] of known) candidatesByKey.set(k, entry.candidates);

  /** Identificadores que ficam por resolver nesta passagem. */
  const unresolved = new Set<string>();

  /**
   * Consulta a fonte externa para os identificadores indicados e faz UNIÃO
   * dos candidatos com os que já eram conhecidos. Nunca substitui o conjunto.
   */
  async function queryAndUnion(targets: HoldingIdentifiers[]): Promise<void> {
    for (const t of targets) unresolved.add(lookupKey(t.idType, t.idValue));

    for (let offset = 0; offset < targets.length; offset += FIGI_BATCH_SIZE) {
      if (deadline && Date.now() >= deadline) break;

      const batch = targets.slice(offset, offset + FIGI_BATCH_SIZE);
      const jobs: FigiJob[] = batch.map((i) =>
        i.idType === "ticker"
          ? { idType: i.idType, idValue: i.idValue, exchCode }
          : { idType: i.idType, idValue: i.idValue },
      );

      const res = await figiMapping(jobs);
      if (!res.ok) {
        // Falha transitória da fonte: nada é gravado e os identificadores
        // continuam pendentes (não são "não identificados").
        lastError = res.message;
        if (res.reason === "rate_limit") await sleep(2_000);
        continue;
      }

      for (let j = 0; j < batch.length; j++) {
        const ident = batch[j]!;
        const cands = res.data[j] ?? [];
        const key = lookupKey(ident.idType, ident.idValue);

        // Regra: só damos um identificador por resolvido DEPOIS de o conjunto
        // de candidatos estar persistido. Se a gravação falhar, fica pendente.
        try {
          const saved: SecurityRecord[] = [];
          for (const c of cands) {
            saved.push(
              await store.upsertSecurity(
                candidateToSecurity(c, ident, fallbackCurrency),
                { openfigi: c },
              ),
            );
          }
          await store.saveLookup({
            ...ident,
            candidateIds: saved.map((s) => s.id),
            source: SOURCE,
            message: null,
          });

          const merged = new Map<string, SecurityRecord>();
          for (const s of candidatesByKey.get(key) ?? []) merged.set(s.id, s);
          for (const s of saved) merged.set(s.id, s);
          candidatesByKey.set(key, [...merged.values()]);
          unresolved.delete(key);
        } catch (e) {
          // Erro de persistência: não inventamos estado, fica pendente.
          lastError = `Security Master: ${(e as Error).message}`;
        }
      }

      if (offset + FIGI_BATCH_SIZE < targets.length) await sleep(delay);
    }
  }

  // 2) Identificadores ainda sem candidatos conhecidos → fonte externa.
  const firstPass: HoldingIdentifiers[] = [];
  const seen = new Set<string>();
  for (const i of idents.flat()) {
    const k = lookupKey(i.idType, i.idValue);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!known.has(k)) firstPass.push(i);
  }
  await queryAndUnion(firstPass);

  /** Decide uma holding a partir dos candidatos atualmente conhecidos. */
  const resolve = (index: number): HoldingMatch => {
    const h = holdings[index]!;
    const holdingKey = holdingKeyOf(h);
    const context = contextOf(h, fallbackCurrency);
    const candidates = idents[index] ?? [];

    const stillPending = candidates.some((i) =>
      unresolved.has(lookupKey(i.idType, i.idValue)),
    );

    let fallback: HoldingMatch = {
      holdingKey,
      status: stillPending ? "pending" : "unidentified",
      security: null,
      matchedBy: null,
      candidateCount: 0,
      source: SOURCE,
      reason: null,
      message:
        candidates.length === 0 ? "Holding sem identificadores utilizáveis." : null,
    };

    for (const ident of candidates) {
      const key = lookupKey(ident.idType, ident.idValue);
      const pool = candidatesByKey.get(key) ?? [];
      if (pool.length === 0) continue;

      const selection = selectCandidate(context, pool);
      if (selection.status === "identified" && selection.security) {
        return {
          holdingKey,
          status: "identified",
          security: selection.security,
          matchedBy: ident.idType,
          candidateCount: selection.distinctCount,
          source: SOURCE,
          reason: selection.reason,
          message: null,
        };
      }
      if (selection.status === "ambiguous" && fallback.status !== "ambiguous") {
        fallback = {
          holdingKey,
          status: "ambiguous",
          security: null,
          matchedBy: ident.idType,
          candidateCount: selection.distinctCount,
          source: SOURCE,
          reason: selection.reason,
          message: selection.reason,
        };
      }
    }
    return fallback;
  };

  // 3) Primeira decisão por holding.
  let matches: HoldingMatch[] = holdings.map((_, i) => resolve(i));

  // 4) Revalidação: quando a cache não explica a holding (nada identificado e
  //    nada pendente), voltamos à fonte para o identificador em causa e
  //    acrescentamos (união) o que houver de novo. A cache acelera — nunca
  //    fecha a porta à descoberta de outra security.
  const revalidate: HoldingIdentifiers[] = [];
  const queued = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    if (m.status === "identified" || m.status === "pending") continue;
    for (const ident of idents[i] ?? []) {
      const key = lookupKey(ident.idType, ident.idValue);
      if (queued.has(key) || firstPass.some((f) => lookupKey(f.idType, f.idValue) === key)) {
        continue;
      }
      queued.add(key);
      revalidate.push(ident);
    }
  }
  if (revalidate.length > 0 && (!deadline || Date.now() < deadline)) {
    await queryAndUnion(revalidate);
    matches = holdings.map((_, i) => resolve(i));
  }

  // 5) Enriquecimento (setor/país) das securities identificadas que ainda não
  //    têm classificação. Não altera o matching: só acrescenta informação à
  //    security no catálogo global.
  let classificationError: string | null = null;
  const identifiedSecurities = new Map<string, SecurityRecord>();
  for (const m of matches) {
    if (m.status === "identified" && m.security) identifiedSecurities.set(m.security.id, m.security);
  }
  if (identifiedSecurities.size > 0 && options.enrich !== false) {
    const { enrichSecurities } = await import("./classification");
    const enriched = await enrichSecurities([...identifiedSecurities.values()], store);
    classificationError = enriched.error;
    for (const m of matches) {
      const next = m.security ? enriched.updated.get(m.security.id) : undefined;
      if (next) m.security = next;
    }
  }

  return {
    classificationError,
    summary: {
      total: matches.length,
      identified: matches.filter((m) => m.status === "identified").length,
      ambiguous: matches.filter((m) => m.status === "ambiguous").length,
      unidentified: matches.filter((m) => m.status === "unidentified").length,
      pending: matches.filter((m) => m.status === "pending").length,
    },
    matches,
    pendingIdentifiers: unresolved.size,
    error: lastError,
  };
}
