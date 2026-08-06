/**
 * IvestWise :: Liquidação efetiva (serviço puro)
 *
 * O BCE publica uma taxa de referência diária única; a corretora liquida com
 * spread e à hora da execução. Quando o utilizador conhece o montante
 * efetivamente debitado/creditado na moeda da carteira, esse valor prevalece
 * sobre a taxa BCE — apenas nessa transação.
 *
 * O facto continua registado na moeda nativa: a liquidação é apenas uma
 * observação adicional guardada em `transactions.metadata.settlement`.
 * A taxa efetiva é sempre derivada, nunca introduzida pelo utilizador.
 */

import type { Transaction } from "@/domain/types";

export interface Settlement {
  amount: number;
  currency: string;
}

/** Bruto nativo do evento: montante + comissões + impostos. */
export function grossNative(transaction: Pick<Transaction, "amount" | "fees" | "taxes">): number {
  return (
    (Number(transaction.amount) || 0) +
    (Number(transaction.fees) || 0) +
    (Number(transaction.taxes) || 0)
  );
}

/**
 * Lê a liquidação guardada nos metadados.
 * Devolve `null` quando ausente, malformada, não positiva ou numa moeda
 * diferente da moeda de reporting pedida.
 */
export function readSettlement(
  metadata: Record<string, unknown> | null | undefined,
  reportingCurrency?: string | null,
): Settlement | null {
  const raw = (metadata ?? {})["settlement"];
  if (!raw || typeof raw !== "object") return null;
  const { amount, currency } = raw as { amount?: unknown; currency?: unknown };
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (typeof currency !== "string" || currency.trim() === "") return null;
  const code = currency.toUpperCase();
  const to = (reportingCurrency ?? "").toUpperCase();
  if (to && code !== to) return null;
  return { amount: value, currency: code };
}

/** Taxa efetiva derivada: `liquidado / bruto nativo`. `null` se indeterminada. */
export function effectiveRate(settlementAmount: number, gross: number): number | null {
  if (!Number.isFinite(settlementAmount) || !Number.isFinite(gross) || gross === 0) return null;
  const rate = settlementAmount / gross;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Taxa efetiva de uma transação, quando tem liquidação utilizável. */
export function settlementRate(
  transaction: Pick<Transaction, "amount" | "fees" | "taxes" | "metadata">,
  reportingCurrency: string,
): number | null {
  const settlement = readSettlement(transaction.metadata, reportingCurrency);
  if (!settlement) return null;
  return effectiveRate(settlement.amount, grossNative(transaction));
}

/** Escreve (ou remove) a liquidação num objeto de metadados. */
export function withSettlement(
  metadata: Record<string, unknown>,
  settlement: Settlement | null,
): Record<string, unknown> {
  const next = { ...metadata };
  if (settlement) next["settlement"] = { amount: settlement.amount, currency: settlement.currency };
  else delete next["settlement"];
  return next;
}
