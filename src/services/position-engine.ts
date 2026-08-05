/**
 * IvestWise :: Position Engine (serviço puro)
 *
 * Reconstrói cronologicamente a posição de um ativo a partir das transações.
 * Sem I/O, sem dependências de React ou Supabase.
 *
 * Regras (ver plano "Position Engine"):
 *  - Aquisições somam unidades e custo, e são o ÚNICO ponto de recálculo do custo médio.
 *  - Alienações consomem unidades e custo ao custo médio vigente e produzem mais-valia
 *    realizada; nunca recalculam o custo médio da posição remanescente.
 *  - Rendimentos, custos e ajustes não alteram quantidade nem custo médio.
 *  - A ordem cronológica é determinante: Compra→Compra→Venda ≠ Compra→Venda→Compra.
 */

import type { AssetType, ISODate, ISODateTime, Transaction } from "@/domain/types";
import {
  TRANSACTION_PROFILES,
  getTransactionOption,
  usesQuantity as usesQuantityFor,
  type QuantityContext,
} from "@/domain/transaction-profiles";

export interface Position {
  /** Unidades detidas (aquisições − alienações). 0 em ativos sem unidades. */
  quantity: number;
  /** Custo médio unitário, recalculado apenas em aquisições. */
  averageCost: number;
  /** Custo da posição remanescente. */
  costBasis: number;
  /** Mais-valias realizadas acumuladas. */
  realizedGain: number;
  /** O ativo é modelado por unidades neste contexto. */
  tracksQuantity: boolean;
  /** Data de referência da reconstrução (null = todo o histórico). */
  asOf: ISODate | ISODateTime | null;
  /** Transações de tipo com unidades gravadas sem quantidade (dados incoerentes). */
  inconsistentTransactionIds: string[];
}

export interface PositionOptions extends QuantityContext {
  /** Reconstrói a posição apenas até esta data (inclusive). */
  asOf?: ISODate | ISODateTime | null;
}

const EPSILON = 1e-9;

/** Fim do dia quando `asOf` é apenas uma data (YYYY-MM-DD). */
const asOfTime = (asOf: string): number =>
  new Date(asOf.length === 10 ? `${asOf}T23:59:59.999Z` : asOf).getTime();

/** Ordem cronológica estável: data, depois id (desempate determinístico). */
export function chronological(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Reconstrói a posição evento a evento.
 */
export function buildPosition(
  assetType: AssetType,
  transactions: Transaction[],
  options: PositionOptions = {},
): Position {
  const { asOf = null, unitBased = false } = options;
  const limit = asOf ? asOfTime(asOf) : null;

  const events = chronological(transactions).filter(
    (t) => limit == null || new Date(t.occurredAt).getTime() <= limit,
  );

  const ctx: QuantityContext = { unitBased };
  const modelUsesUnits =
    usesQuantityFor(assetType, "buy", ctx) ||
    usesQuantityFor(assetType, "deposit", ctx) ||
    usesQuantityFor(assetType, "transfer_in", ctx);

  let quantity = 0;
  let costBasis = 0;
  let averageCost = 0;
  let realizedGain = 0;
  const inconsistentTransactionIds: string[] = [];

  for (const t of events) {
    const direction = TRANSACTION_PROFILES[t.type]?.direction;
    if (direction !== "in" && direction !== "out") continue;

    const amount = Number(t.amount) || 0;
    const costs = (Number(t.fees) || 0) + (Number(t.taxes) || 0);
    const declaredQty = Number(t.quantity) || 0;
    const expectsQty =
      usesQuantityFor(assetType, t.type, ctx) ||
      (getTransactionOption(assetType, t.type)?.usesQuantity ?? false);

    if (expectsQty && declaredQty <= 0) {
      // Nunca cair silenciosamente no modelo sem unidades: sinaliza incoerência
      // e trata o movimento apenas em custo, sem corromper a quantidade.
      inconsistentTransactionIds.push(t.id);
    }

    const withUnits = expectsQty && declaredQty > 0;

    if (direction === "in") {
      costBasis += amount + costs;
      if (withUnits) {
        quantity += declaredQty;
        averageCost = quantity > EPSILON ? costBasis / quantity : 0;
      } else if (!modelUsesUnits) {
        averageCost = 0;
      }
      continue;
    }

    // direction === "out"
    const proceeds = amount - costs;
    if (withUnits) {
      const qtyOut = Math.min(declaredQty, quantity);
      const costOut = qtyOut * averageCost;
      realizedGain += proceeds - costOut;
      quantity = Math.max(0, quantity - qtyOut);
      costBasis = Math.max(0, costBasis - costOut);
      // custo médio permanece inalterado numa alienação
      if (quantity <= EPSILON) costBasis = 0;
    } else {
      const costOut = Math.min(costBasis, amount);
      realizedGain += proceeds - costOut;
      costBasis = Math.max(0, costBasis - costOut);
    }
  }

  return {
    quantity: quantity <= EPSILON ? 0 : quantity,
    averageCost: quantity > EPSILON ? averageCost : 0,
    costBasis,
    realizedGain,
    tracksQuantity: modelUsesUnits,
    asOf,
    inconsistentTransactionIds,
  };
}

/** Posição a uma data (inclusive). Mesmo algoritmo, histórico truncado. */
export function positionAt(
  assetType: AssetType,
  transactions: Transaction[],
  asOf: ISODate | ISODateTime,
  options: QuantityContext = {},
): Position {
  return buildPosition(assetType, transactions, { ...options, asOf });
}

/** Quantidade disponível para alienação numa data. */
export function availableQuantityAt(
  assetType: AssetType,
  transactions: Transaction[],
  asOf: ISODate | ISODateTime,
  options: QuantityContext = {},
): number {
  return positionAt(assetType, transactions, asOf, options).quantity;
}
