/**
 * IvestWise :: Métricas de transações (serviço puro)
 *
 * Sem I/O. Calcula agregados a partir do histórico de transações,
 * que é a fonte de verdade financeira de cada ativo.
 */

import type { Transaction } from "@/domain/types";
import { TRANSACTION_PROFILES } from "@/domain/transaction-profiles";

export interface TransactionTotals {
  /** Soma dos montantes de entrada (compras, depósitos, transferências de entrada). */
  inflows: number;
  /** Soma dos montantes de saída (vendas, levantamentos, transferências de saída). */
  outflows: number;
  /** Rendimentos recebidos (dividendos, juros, cupões). */
  income: number;
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
      case "income":
        income += amount;
        break;
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
    costs,
    investedCapital: Math.max(0, inflows - outflows),
    count: transactions.length,
  };
}
