/**
 * IvestWise :: Métricas de transações (serviço puro)
 *
 * Sem I/O. Calcula agregados e a POSIÇÃO DERIVADA a partir do histórico de
 * transações, que é a fonte de verdade financeira de cada ativo.
 * A posição nunca é introduzida manualmente; `assets.quantity`,
 * `assets.average_cost` e `assets.current_value` são apenas cache informativa.
 */

import type { AssetType, Transaction } from "@/domain/types";
import {
  TRANSACTION_PROFILES,
  getTransactionOption,
  usesQuantity as usesQuantityFor,
  type IncomeKind,
} from "@/domain/transaction-profiles";

export interface TransactionTotals {
  /** Soma dos montantes de entrada (compras, depósitos, transferências de entrada). */
  inflows: number;
  /** Soma dos montantes de saída (vendas, levantamentos, transferências de saída). */
  outflows: number;
  /** Rendimentos recebidos (dividendos, distribuições, cupões, juros, rendas). */
  income: number;
  /** Rendimento decomposto por natureza económica. */
  incomeByKind: Partial<Record<IncomeKind, number>>;
  /** Comissões e impostos (transações de custo + campos fees/taxes). */
  costs: number;
  /** Capital investido acumulado = entradas - saídas de capital. */
  investedCapital: number;
  count: number;
}

export function transactionTotals(transactions: Transaction[]): TransactionTotals {
  let inflows = 0;
  let outflows = 0;
  let income = 0;
  let costs = 0;
  const incomeByKind: Partial<Record<IncomeKind, number>> = {};

  for (const t of transactions) {
    const profile = TRANSACTION_PROFILES[t.type];
    const amount = Number(t.amount) || 0;
    costs += (Number(t.fees) || 0) + (Number(t.taxes) || 0);

    switch (profile?.direction) {
      case "in":
        inflows += amount;
        break;
      case "out":
        outflows += amount;
        break;
      case "income": {
        income += amount;
        const kind = (t.metadata?.["incomeKind"] as IncomeKind | undefined) ?? inferIncomeKind(t.type);
        if (kind) incomeByKind[kind] = (incomeByKind[kind] ?? 0) + amount;
        break;
      }
      case "cost":
        costs += amount;
        break;
      default:
        break;
    }
  }

  return {
    inflows,
    outflows,
    income,
    incomeByKind,
    costs,
    investedCapital: Math.max(0, inflows - outflows),
    count: transactions.length,
  };
}

const inferIncomeKind = (type: Transaction["type"]): IncomeKind | undefined => {
  if (type === "dividend") return "dividend";
  if (type === "coupon") return "coupon";
  if (type === "interest") return "interest";
  return undefined;
};

/** Posição derivada de um ativo (nunca introduzida manualmente). */
export interface DerivedPosition {
  quantity: number;
  /** Custo médio unitário, incluindo comissões e impostos das entradas. */
  averageCost: number;
  /** Custo total da posição atual (quantidade × custo médio). */
  costBasis: number;
  /** Mais/menos-valia realizada nas saídas. */
  realizedGain: number;
  /** Verdadeiro quando o ativo tem quantidade (ETF, ações, fundos, obrigações, cripto…). */
  tracksQuantity: boolean;
}

/**
 * Média móvel ponderada sobre as transações ordenadas cronologicamente.
 * Para ativos sem quantidade, `quantity` fica a 0 e o custo é o capital líquido investido.
 */
export function derivePosition(
  assetType: AssetType,
  transactions: Transaction[],
): DerivedPosition {
  const ordered = [...transactions].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  let quantity = 0;
  let costBasis = 0;
  let realizedGain = 0;
  let tracksQuantity = false;

  for (const t of ordered) {
    const profile = TRANSACTION_PROFILES[t.type];
    const amount = Number(t.amount) || 0;
    const costs = (Number(t.fees) || 0) + (Number(t.taxes) || 0);
    const withQty = usesQuantityFor(assetType, t.type) && (Number(t.quantity) || 0) > 0;
    if (withQty) tracksQuantity = true;

    if (profile?.direction === "in") {
      if (withQty) {
        quantity += Number(t.quantity);
        costBasis += amount + costs;
      } else {
        costBasis += amount + costs;
      }
    } else if (profile?.direction === "out") {
      if (withQty) {
        const qtyOut = Math.min(Number(t.quantity), quantity);
        const unitCost = quantity > 0 ? costBasis / quantity : 0;
        const removed = unitCost * qtyOut;
        realizedGain += amount - costs - removed;
        quantity -= qtyOut;
        costBasis = Math.max(0, costBasis - removed);
      } else {
        const removed = Math.min(costBasis, amount);
        realizedGain += amount - costs - removed;
        costBasis = Math.max(0, costBasis - removed);
      }
    }
  }

  const hasQuantityModel =
    tracksQuantity || getTransactionOption(assetType, "buy")?.usesQuantity === true;

  return {
    quantity,
    averageCost: quantity > 0 ? costBasis / quantity : 0,
    costBasis,
    realizedGain,
    tracksQuantity: hasQuantityModel,
  };
}
