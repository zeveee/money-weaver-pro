/**
 * IvestWise :: XIRR (serviço puro)
 *
 * Sem I/O. Duas camadas:
 *  - `xirr()`            → solver genérico sobre uma lista de fluxos datados.
 *  - `assetXirr()`       → constrói os fluxos externos de um ativo (na moeda
 *                          de reporting, mesma conversão evento-a-evento que
 *                          `assetPerformance`) e chama o solver.
 *
 * DEFINIÇÃO DE FLUXO EXTERNO (o que entra/sai do bolso do investidor):
 *  - Compra / Depósito / Transferência de entrada  → SAI dinheiro do investidor
 *    (fluxo negativo): -(amount + fees + taxes).
 *  - Venda / Levantamento / Transferência de saída  → ENTRA dinheiro no
 *    investidor (fluxo positivo, líquido de custos): +(amount - fees - taxes).
 *  - Rendimento (dividendo/juro/cupão/renda)        → ENTRA dinheiro no
 *    investidor: +(amount - fees - taxes). Assume-se que não é reinvestido
 *    automaticamente (não existe tipo de transação de reinvestimento).
 *  - Custo autónomo (fee/tax como movimento próprio) → SAI dinheiro do
 *    investidor: -(amount + fees + taxes).
 *  - Ajuste (neutral)                                → NÃO é fluxo de caixa
 *    real (correção de posição); excluído do XIRR.
 *  - Fluxo terminal: se a posição ainda tem quantidade > 0 à data de
 *    referência, o valor atual entra como um fluxo positivo nessa data (como
 *    se a posição fosse liquidada hoje). Só é adicionado quando existe uma
 *    valorização observada (nunca ao custo — isso obrigaria XIRR = 0 %
 *    silenciosamente). Se a posição está totalmente liquidada (quantity = 0)
 *    não há fluxo terminal a acrescentar.
 *
 * MÉTODO NUMÉRICO: Newton-Raphson com fallback a bisseção sobre um bracket
 * pesquisado em grelha. ACT/365 face à data do primeiro fluxo (convenção
 * Excel/XIRR). Devolve `null` sempre que a solução não é bem definida
 * (fluxos todos com o mesmo sinal, um único fluxo, todos na mesma data, ou
 * não convergência) — nunca um número enganador.
 */

import type { AssetType, AssetValuation, ISODate, Transaction } from "@/domain/types";
import { TRANSACTION_PROFILES } from "@/domain/transaction-profiles";
import { buildPosition, positionAt } from "@/services/position-engine";
import {
  latestValuation,
  resolveValuationValue,
  todayISODate,
  type QuantityAt,
} from "@/services/valuation-metrics";
import { projectTransactions, reportCurrentValue } from "@/services/reporting";
import { EMPTY_RATE_TABLE, type FxRateTable } from "@/services/fx";

export interface CashFlow {
  date: ISODate;
  amount: number;
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;
const NPV_TOLERANCE = 1e-6;
const MIN_RATE = -0.999999; // (1+r) > 0
const MAX_RATE = 100; // 10 000 % — teto prático para o bracket

const daysBetween = (from: ISODate, to: ISODate): number =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / MS_PER_DAY);

function npv(rate: number, flows: { years: number; amount: number }[]): number {
  return flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, f.years), 0);
}

function dNpv(rate: number, flows: { years: number; amount: number }[]): number {
  return flows.reduce(
    (sum, f) => (f.years === 0 ? sum : sum - (f.years * f.amount) / Math.pow(1 + rate, f.years + 1)),
    0,
  );
}

/**
 * Solver genérico de XIRR sobre uma lista de fluxos datados.
 * Datas podem repetir-se (são somadas naturalmente pela fórmula de NPV).
 */
export function xirr(rawFlows: CashFlow[]): number | null {
  const flows = rawFlows.filter((f) => Number.isFinite(f.amount) && f.amount !== 0);
  if (flows.length < 2) return null;

  const hasPositive = flows.some((f) => f.amount > 0);
  const hasNegative = flows.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null; // nunca cruza zero: sem solução

  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const t0 = sorted[0].date;
  const dated = sorted.map((f) => ({ years: daysBetween(t0, f.date) / DAYS_PER_YEAR, amount: f.amount }));

  if (dated.every((f) => f.years === 0)) return null; // tudo no mesmo dia: período indefinido

  // --- Tentativa 1: Newton-Raphson a partir de 10% ------------------------
  let rate = 0.1;
  for (let i = 0; i < 50; i++) {
    const value = npv(rate, dated);
    if (Math.abs(value) < NPV_TOLERANCE) return rate;
    const slope = dNpv(rate, dated);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= MIN_RATE) break;
    rate = next;
  }
  if (Number.isFinite(rate) && rate > MIN_RATE && Math.abs(npv(rate, dated)) < NPV_TOLERANCE) {
    return rate;
  }

  // --- Tentativa 2: bracket em grelha + bisseção ---------------------------
  const STEPS = 400;
  let lo = MIN_RATE;
  let loVal = npv(lo, dated);
  let bracketLo: number | null = null;
  let bracketHi: number | null = null;

  for (let i = 1; i <= STEPS; i++) {
    const hi = MIN_RATE + ((MAX_RATE - MIN_RATE) * i) / STEPS;
    const hiVal = npv(hi, dated);
    if (Number.isFinite(hiVal) && Number.isFinite(loVal) && loVal * hiVal <= 0) {
      bracketLo = lo;
      bracketHi = hi;
      break;
    }
    lo = hi;
    loVal = hiVal;
  }

  if (bracketLo == null || bracketHi == null) return null; // sem bracket: não converge

  let a = bracketLo;
  let b = bracketHi;
  let fa = npv(a, dated);
  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2;
    const fm = npv(mid, dated);
    if (Math.abs(fm) < NPV_TOLERANCE || (b - a) / 2 < 1e-9) return mid;
    if (fa * fm <= 0) {
      b = mid;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

export interface AssetXirrInput {
  assetType: AssetType;
  transactions: Transaction[];
  valuations: AssetValuation[];
  nativeCurrency: string;
  reportingCurrency?: string | null;
  fxTable?: FxRateTable;
  asOf?: ISODate;
  unitBased?: boolean;
}

export interface AssetXirrResult {
  xirr: number | null;
  cashFlows: CashFlow[];
  /** Falso quando a posição ainda está aberta e não há valorização observada
   *  (não é seguro construir um fluxo terminal, logo `xirr` fica `null`). */
  hasTerminalValue: boolean;
}

const cashFlowForTransaction = (t: Transaction): CashFlow | null => {  const direction = TRANSACTION_PROFILES[t.type]?.direction;
  const amount = Number(t.amount) || 0;
  const costs = (Number(t.fees) || 0) + (Number(t.taxes) || 0);
  const date = t.occurredAt.slice(0, 10);
  switch (direction) {
    case "in":
      return { date, amount: -(amount + costs) };
    case "cost":
      return { date, amount: -(amount + costs) };
    case "out":
    case "income":
      return { date, amount: amount - costs };
    default:
      return null; // "neutral" (adjustment): não é fluxo de caixa real
  }
};

/**
 * Fluxos de caixa externos e XIRR de um ativo, na moeda de reporting.
 */
export function assetXirr(input: AssetXirrInput): AssetXirrResult {
  const {
    assetType,
    transactions,
    valuations,
    nativeCurrency,
    fxTable = EMPTY_RATE_TABLE,
    asOf = todayISODate(),
    unitBased = false,
  } = input;

  const options = { unitBased } as const;

  const native = (nativeCurrency || "").toUpperCase();
  const reporting = (input.reportingCurrency || "").toUpperCase() || native;
  const isMultiCurrency = reporting !== native;

  const projected = isMultiCurrency
    ? projectTransactions(fxTable, transactions, reporting)
    : { transactions, missingCurrencies: [], usedCarryForward: false, usedSettlement: false };

  const inWindow = projected.transactions.filter((t) => t.occurredAt.slice(0, 10) <= asOf);
  const cashFlows = inWindow
    .map(cashFlowForTransaction)
    .filter((f): f is CashFlow => f !== null);

  const position = buildPosition(assetType, inWindow, { ...options, asOf });
  let hasTerminalValue = true;

  // "Posição ainda aberta" tem de valer tanto para ativos com unidades
  // (quantity > 0) como para ativos valorizados por valor absoluto do
  // contrato, onde quantity nunca é preenchida por desenho — nesse caso
  // costBasis > 0 é o sinal de que ainda há capital por recuperar.
  const stillOpen = position.quantity > 0 || position.costBasis > 1e-9;

  if (stillOpen) {
    const reference = latestValuation(valuations, asOf);
    if (!reference) {
      hasTerminalValue = false;
    } else {
      const quantityAt: QuantityAt = (date) =>
        positionAt(assetType, inWindow, date, options).quantity;
      const nativeValue = resolveValuationValue(reference, quantityAt);
      const converted = isMultiCurrency
        ? reportCurrentValue(fxTable, { amount: nativeValue, currency: reference.currency || native }, reporting)
            .reported?.amount ?? null
        : nativeValue;
      if (converted == null) {
        hasTerminalValue = false;
      } else {
        cashFlows.push({ date: asOf, amount: converted });
      }
    }
  }

  return {
    xirr: hasTerminalValue ? xirr(cashFlows) : null,
    cashFlows,
    hasTerminalValue,
  };
}
