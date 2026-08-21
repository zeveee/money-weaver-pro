/**
 * IvestWise :: Seleção de candidato por contexto
 *
 * Um identificador (ISIN/CUSIP/SEDOL/ticker) reduz o universo de candidatos —
 * nunca decide sozinho. A decisão final é tomada AQUI, por holding, cruzando o
 * contexto disponível (nome, ticker, moeda, bolsa, tipo) com cada candidato.
 *
 * Princípio: moeda e bolsa são CONTEXTO, não filtros duros. A mesma security
 * tem legitimamente vários listings e moedas; uma divergência penaliza, nunca
 * elimina. Só assim o caso WisdomTree (dois fundos com o mesmo ISIN e moedas
 * diferentes) é distinguível sem excluir securities válidas noutros casos.
 *
 * Função pura: sem rede, sem base de dados.
 */

import type { SecurityRecord } from "./types";

/** Contexto de uma holding, tal como publicado pelo emissor. */
export interface HoldingContext {
  name: string;
  ticker: string | null;
  currency: string | null;
  exchange?: string | null;
}

export interface CandidateScore {
  security: SecurityRecord;
  score: number;
  reasons: string[];
}

export interface Selection {
  /** `identified` ⇒ há um vencedor claro; `ambiguous` ⇒ empate entre candidatos distintos. */
  status: "identified" | "ambiguous" | "unidentified";
  security: SecurityRecord | null;
  /** Nº de candidatos distintos considerados (por FIGI composto). */
  distinctCount: number;
  /** Motivo legível do desempate (ou da ambiguidade). */
  reason: string | null;
  /** Score do vencedor; útil para decidir se vale a pena reconsultar a fonte. */
  topScore: number;
}

/** Margem mínima entre o 1.º e o 2.º candidato distinto para haver vencedor. */
export const MIN_MARGIN = 2;

const up = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim().toUpperCase();
  return s === "" ? null : s;
};

const STOP = new Set([
  "INC",
  "INC.",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LTD",
  "LIMITED",
  "PLC",
  "SA",
  "NV",
  "AG",
  "THE",
  "CLASS",
  "A",
  "B",
  "C",
  "COM",
  "ORD",
  "SHS",
  "SHARES",
  "HOLDINGS",
  "GROUP",
]);

const tokens = (v: string | null | undefined): Set<string> =>
  new Set(
    (v ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );

/** Semelhança de nomes: fração de tokens significativos partilhados (0–1). */
export function nameSimilarity(a: string | null, b: string | null): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.min(ta.size, tb.size);
}

/** Grupo de candidatos distintos: mesma empresa em várias bolsas conta uma vez. */
const groupKey = (s: SecurityRecord): string => s.compositeFigi ?? s.figi ?? s.id;

export function scoreCandidate(
  holding: HoldingContext,
  candidate: SecurityRecord,
): CandidateScore {
  const reasons: string[] = [];
  let score = 0;

  const hTicker = up(holding.ticker);
  const cTicker = up(candidate.ticker);
  if (hTicker && cTicker) {
    if (hTicker === cTicker) {
      score += 4;
      reasons.push("ticker igual");
    } else if (hTicker.split(/[.\-/]/)[0] === cTicker.split(/[.\-/]/)[0]) {
      score += 2;
      reasons.push("ticker base igual");
    } else {
      score -= 1;
    }
  }

  const hCur = up(holding.currency);
  const cCur = up(candidate.currency);
  if (hCur && cCur) {
    if (hCur === cCur) {
      score += 3;
      reasons.push(`moeda ${hCur}`);
    } else {
      // Contexto, não filtro: penaliza mas mantém o candidato em jogo.
      score -= 1.5;
    }
  }

  const hExch = up(holding.exchange);
  const cExch = up(candidate.exchange);
  if (hExch && cExch) {
    if (hExch === cExch) {
      score += 2;
      reasons.push(`bolsa ${hExch}`);
    } else {
      score -= 0.5;
    }
  }

  const sim = nameSimilarity(holding.name, candidate.name);
  if (sim > 0) {
    score += sim * 3;
    if (sim >= 0.5) reasons.push("nome semelhante");
  }

  if (candidate.figi && candidate.figi === candidate.compositeFigi) {
    score += 0.5;
    reasons.push("linha primária");
  }

  return { security: candidate, score, reasons };
}

/**
 * Escolhe o candidato que melhor explica a holding.
 * Empate (ou margem insuficiente) entre candidatos DISTINTOS ⇒ ambíguo.
 */
export function selectCandidate(
  holding: HoldingContext,
  candidates: SecurityRecord[],
): Selection {
  if (candidates.length === 0) {
    return {
      status: "unidentified",
      security: null,
      distinctCount: 0,
      reason: null,
      topScore: 0,
    };
  }

  const scored = candidates
    .map((c) => scoreCandidate(holding, c))
    .sort((a, b) => b.score - a.score);

  // Melhor score por grupo distinto (mesmo composite FIGI = mesma security).
  const best = new Map<string, CandidateScore>();
  for (const s of scored) {
    const k = groupKey(s.security);
    const cur = best.get(k);
    if (!cur || s.score > cur.score) best.set(k, s);
  }
  const groups = [...best.values()].sort((a, b) => b.score - a.score);
  const winner = groups[0]!;

  if (groups.length === 1) {
    return {
      status: "identified",
      security: winner.security,
      distinctCount: 1,
      reason: winner.reasons.length > 0 ? winner.reasons.join(", ") : "candidato único",
      topScore: winner.score,
    };
  }

  const runnerUp = groups[1]!;
  if (winner.score - runnerUp.score >= MIN_MARGIN) {
    return {
      status: "identified",
      security: winner.security,
      distinctCount: groups.length,
      reason:
        winner.reasons.length > 0
          ? `desempate por ${winner.reasons.join(", ")}`
          : "melhor candidato pelo contexto",
      topScore: winner.score,
    };
  }

  return {
    status: "ambiguous",
    security: null,
    distinctCount: groups.length,
    reason: `${groups.length} candidatos distintos e o contexto não desempata.`,
    topScore: winner.score,
  };
}
