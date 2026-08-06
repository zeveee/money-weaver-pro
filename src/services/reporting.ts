/**
 * IvestWise :: Camada de reporting multi-moeda (serviço puro)
 *
 * Sem I/O. Converte factos (transações e valorizações) para a moeda de
 * reporting da carteira, SEMPRE evento a evento e à data do evento.
 *
 * Regra de ouro: converter no evento, nunca no total. Somar em moeda nativa
 * e converter o somatório com a taxa de hoje daria resultados errados e
 * impediria a decomposição do efeito cambial.
 *
 * O plano nativo (Position Engine, custo médio, quantidade, NAV) permanece
 * intocado: este módulo é uma camada paralela, não uma substituição.
 */

import type { AssetValuation, ISODate, Transaction } from "@/domain/types";
import { TRANSACTION_PROFILES } from "@/domain/transaction-profiles";
import {
  convert,
  rateAt,
  toRateDate,
  type FxRate,
  type FxRateTable,
  type Money,
} from "@/services/fx";
import { resolveValuationValue, type QuantityAt } from "@/services/valuation-metrics";

/** Valor com o seu par nativo/reporting e a taxa aplicada — base da análise cambial. */
export interface ReportedAmount {
  native: Money;
  reported: Money | null;
  rate: FxRate | null;
  date: ISODate;
}

const report = (
  table: FxRateTable,
  native: Money,
  to: string,
  date: ISODate,
): ReportedAmount => {
  const c = convert(table, native, to, date);
  return c.status === "ok"
    ? { native, reported: c.money, rate: c.rate, date }
    : { native, reported: null, rate: null, date };
};

/** Converte uma transação à taxa da SUA data (nunca à taxa de hoje). */
export function reportTransaction(
  table: FxRateTable,
  transaction: Transaction,
  reportingCurrency: string,
): ReportedAmount {
  const date = toRateDate(transaction.occurredAt);
  const gross =
    (Number(transaction.amount) || 0) +
    (Number(transaction.fees) || 0) +
    (Number(transaction.taxes) || 0);
  return report(table, { amount: gross, currency: transaction.currency }, reportingCurrency, date);
}

/** Converte uma valorização à taxa da SUA data. */
export function reportValuation(
  table: FxRateTable,
  valuation: AssetValuation,
  reportingCurrency: string,
  quantityAt?: QuantityAt,
): ReportedAmount {
  const native = {
    amount: resolveValuationValue(valuation, quantityAt),
    currency: valuation.currency,
  };
  return report(table, native, reportingCurrency, valuation.valuationDate);
}

/**
 * Valor atual em moeda de reporting.
 * Excepção deliberada: usa a taxa MAIS RECENTE disponível (é uma foto de
 * "quanto vale agora"), enquanto o histórico usa sempre a taxa da data.
 */
export function reportCurrentValue(
  table: FxRateTable,
  native: Money,
  reportingCurrency: string,
): ReportedAmount {
  const c = convert(table, native, reportingCurrency, null);
  const date = c.status === "ok" ? c.rate.rateDate : toRateDate(new Date().toISOString());
  return c.status === "ok"
    ? { native, reported: c.money, rate: c.rate, date }
    : { native, reported: null, rate: null, date };
}

export interface ReportedTotals {
  currency: string;
  /** Entradas de capital convertidas evento a evento. */
  inflows: number;
  outflows: number;
  income: number;
  costs: number;
  /** Capital investido líquido em moeda de reporting. */
  investedCapital: number;
  /** Moedas para as quais faltou taxa; os totais são parciais quando não vazio. */
  missingCurrencies: string[];
  /** Verdadeiro quando alguma conversão usou carry-forward da última taxa conhecida. */
  usedCarryForward: boolean;
}

/**
 * Totais de transações já convertidos para a moeda de reporting.
 * Espelha `transactionTotals` (moeda nativa) sem o substituir.
 */
export function reportedTransactionTotals(
  table: FxRateTable,
  transactions: Transaction[],
  reportingCurrency: string,
): ReportedTotals {
  let inflows = 0;
  let outflows = 0;
  let income = 0;
  let costs = 0;
  let usedCarryForward = false;
  const missing = new Set<string>();
  const to = (reportingCurrency || "").toUpperCase();

  for (const t of transactions) {
    const date = toRateDate(t.occurredAt);
    const resolution = rateAt(table, t.currency, to, date);
    if (resolution.status === "missing") {
      missing.add((t.currency || "").toUpperCase());
      continue;
    }
    if (resolution.carriedForward) usedCarryForward = true;

    const fx = resolution.rate;
    const amount = (Number(t.amount) || 0) * fx;
    costs += ((Number(t.fees) || 0) + (Number(t.taxes) || 0)) * fx;

    switch (TRANSACTION_PROFILES[t.type]?.direction) {
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
    currency: to,
    inflows,
    outflows,
    income,
    costs,
    investedCapital: Math.max(0, inflows - outflows),
    missingCurrencies: [...missing].sort(),
    usedCarryForward,
  };
}

/**
 * Decomposição do ganho entre performance do ativo e efeito cambial.
 *
 *   ganho(reporting) = ganho do ativo × taxa base + efeito cambial + termo cruzado
 *
 * `baseRate` é a taxa à data de entrada (custo); `currentRate` a taxa da
 * avaliação. Permite responder a "subiu em USD mas perdi em EUR?".
 */
export interface FxAttribution {
  /** Ganho em moeda nativa, convertido à taxa de entrada. */
  assetEffect: number;
  /** Efeito da variação cambial sobre o capital investido. */
  currencyEffect: number;
  /** Interação entre valorização do ativo e variação cambial. */
  crossEffect: number;
  /** Soma dos três — igual ao ganho medido em moeda de reporting. */
  total: number;
}

export function attributeFxPerformance(
  costNative: number,
  valueNative: number,
  baseRate: number,
  currentRate: number,
): FxAttribution {
  const assetGain = valueNative - costNative;
  const rateDelta = currentRate - baseRate;
  const assetEffect = assetGain * baseRate;
  const currencyEffect = costNative * rateDelta;
  const crossEffect = assetGain * rateDelta;
  return {
    assetEffect,
    currencyEffect,
    crossEffect,
    total: assetEffect + currencyEffect + crossEffect,
  };
}
