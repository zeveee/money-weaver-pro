/**
 * IvestWise :: Métricas de transações (serviço puro)
 *
 * Sem I/O. Calcula agregados e a POSIÇÃO DERIVADA a partir do histórico de
 * transações, que é a fonte de verdade financeira de cada ativo.
 * A posição nunca é introduzida manualmente; `assets.quantity`,
 * `assets.average_cost` e `assets.current_value` são apenas cache informativa.
 */

import type { AssetType, Transaction } from "@/domain/types";
import { buildPosition, type PositionOptions } from "@/services/position-engine";
import {
  TRANSACTION_PROFILES,
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
        const kind =
          (t.metadata?.["incomeKind"] as IncomeKind | undefined) ?? inferIncomeKind(t.type);
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
  /** Custo médio unitário, recalculado apenas em aquisições. */
  averageCost: number;
  /** Custo total da posição remanescente. */
  costBasis: number;
  /** Mais/menos-valia realizada nas saídas. */
  realizedGain: number;
  /** Verdadeiro quando o ativo tem quantidade (ETF, ações, fundos, UPs…). */
  tracksQuantity: boolean;
  /** Transações com unidades em falta (dados incoerentes). */
  inconsistentTransactionIds: string[];
}

/**
 * Posição derivada. Delega no Position Engine, que reconstrói cronologicamente
 * quantidade, custo médio e mais-valias realizadas.
 */
export function derivePosition(
  assetType: AssetType,
  transactions: Transaction[],
  options: PositionOptions = {},
): DerivedPosition {
  const p = buildPosition(assetType, transactions, options);
  return {
    quantity: p.quantity,
    averageCost: p.averageCost,
    costBasis: p.costBasis,
    realizedGain: p.realizedGain,
    tracksQuantity: p.tracksQuantity,
    inconsistentTransactionIds: p.inconsistentTransactionIds,
  };
}

