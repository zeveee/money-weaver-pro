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
 *      (`security_lookups`); só o que ainda não é conhecido vai ao OpenFIGI.
 *   3. um único candidato (agrupado por FIGI composto) ⇒ identificada e
 *      guardada; vários candidatos distintos ⇒ ambígua (nunca escolhemos ao
 *      acaso); zero ⇒ tenta o identificador seguinte, e no fim fica como não
 *      identificada — registada na mesma, para resolução posterior.
 */

import type { NormalizedHolding } from "../holdings/types";
import { FIGI_BATCH_SIZE, figiMapping, type FigiCandidate, type FigiJob } from "./openfigi";
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
  };
}

/** Candidatos distintos = FIGIs compostos distintos (mesma empresa em várias bolsas conta 1). */
const distinctCount = (cands: FigiCandidate[]) =>
  new Set(cands.map((c) => c.compositeFigi ?? c.figi)).size;

const pickPrimary = (cands: FigiCandidate[]): FigiCandidate => {
  const composite = cands[0]!.compositeFigi;
  return cands.find((c) => c.figi === composite) ?? cands[0]!;
};

export interface MatchOptions {
  store?: SecurityStore;
  /** Bolsa preferida para pesquisas por ticker (a Amplify reporta em USD/US). */
  tickerExchCode?: string;
  currency?: string | null;
  /** Pausa entre lotes OpenFIGI (limite ~25 pedidos/min sem chave). */
  batchDelayMs?: number;
  /**
   * Orçamento de tempo para consultas externas. Ao esgotar, devolvemos o que
   * já foi resolvido (e persistido) e deixamos o resto como `pending`, para
   * ser concluído numa passagem seguinte a partir do Security Master.
   */
  budgetMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function matchHoldings(
  holdings: NormalizedHolding[],
  options: MatchOptions = {},
): Promise<HoldingsMatchResult> {
  const store = options.store ?? createSupabaseSecurityStore();
  const exchCode = options.tickerExchCode ?? "US";
  const delay = options.batchDelayMs ?? 300;
  const deadline = options.budgetMs ? Date.now() + options.budgetMs : null;

  const idents = holdings.map(holdingIdentifiers);
  let lastError: string | null = null;

  // 1) Memória do Security Master para todos os identificadores em jogo.
  const allKeys = [...new Set(idents.flat().map((i) => lookupKey(i.idType, i.idValue)))];
  const known = await store.getLookups(allKeys);

  // 2) Identificadores ainda desconhecidos → OpenFIGI, em lotes.
  const pending: HoldingIdentifiers[] = [];
  for (const i of idents.flat()) {
    const k = lookupKey(i.idType, i.idValue);
    if (!known.has(k) && !pending.some((p) => lookupKey(p.idType, p.idValue) === k)) {
      pending.push(i);
    }
  }
  /** Identificadores que ficam por resolver nesta passagem. */
  const unresolved = new Set(pending.map((i) => lookupKey(i.idType, i.idValue)));

  for (let offset = 0; offset < pending.length; offset += FIGI_BATCH_SIZE) {
    if (deadline && Date.now() >= deadline) break;

    const batch = pending.slice(offset, offset + FIGI_BATCH_SIZE);
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

      // Regra: só damos um resultado por assente DEPOIS de estar persistido no
      // Security Master. Se a gravação falhar, o identificador fica pendente.
      try {
        if (cands.length === 0) {
          await store.saveLookup({
            ...ident,
            status: "unidentified",
            securityId: null,
            candidateCount: 0,
            source: SOURCE,
            message: null,
          });
          known.set(key, {
            status: "unidentified",
            security: null,
            candidateCount: 0,
            source: SOURCE,
            message: null,
          });
          unresolved.delete(key);
          continue;
        }

        const n = distinctCount(cands);
        if (n > 1) {
          const message = `${n} candidatos distintos no OpenFIGI.`;
          await store.saveLookup({
            ...ident,
            status: "ambiguous",
            securityId: null,
            candidateCount: n,
            source: SOURCE,
            message,
          });
          known.set(key, {
            status: "ambiguous",
            security: null,
            candidateCount: n,
            source: SOURCE,
            message,
          });
          unresolved.delete(key);
          continue;
        }

        const primary = pickPrimary(cands);
        const security = await store.upsertSecurity(
          candidateToSecurity(primary, ident, options.currency ?? null),
          { openfigi: primary },
        );
        await store.saveLookup({
          ...ident,
          status: "identified",
          securityId: security.id,
          candidateCount: 1,
          source: SOURCE,
          message: null,
        });
        known.set(key, {
          status: "identified",
          security,
          candidateCount: 1,
          source: SOURCE,
          message: null,
        });
        unresolved.delete(key);
      } catch (e) {
        // Erro de persistência: não inventamos estado, fica pendente.
        lastError = `Security Master: ${(e as Error).message}`;
      }
    }


    if (offset + FIGI_BATCH_SIZE < pending.length) await sleep(delay);
  }

  // 3) Resolução por holding, respeitando a ordem de força dos identificadores.
  const matches: HoldingMatch[] = holdings.map((h, index) => {
    const holdingKey = holdingKeyOf(h);
    const candidates = idents[index] ?? [];
    // Se algum identificador ficou por consultar, a holding está pendente —
    // nunca "não identificada" (isso seria esconder trabalho por fazer).
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
      message:
        candidates.length === 0 ? "Holding sem identificadores utilizáveis." : null,
    };

    for (const ident of candidates) {
      const entry = known.get(lookupKey(ident.idType, ident.idValue));
      if (!entry) continue;
      if (entry.status === "identified" && entry.security) {
        return {
          holdingKey,
          status: "identified",
          security: entry.security,
          matchedBy: ident.idType,
          candidateCount: entry.candidateCount,
          source: entry.source,
          message: null,
        };
      }
      if (entry.status === "ambiguous" && fallback.status !== "ambiguous") {
        fallback = {
          holdingKey,
          status: "ambiguous",
          security: null,
          matchedBy: ident.idType,
          candidateCount: entry.candidateCount,
          source: entry.source,
          message: entry.message,
        };
      }
    }
    return fallback;
  });

  return {
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
