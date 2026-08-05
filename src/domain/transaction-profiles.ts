/**
 * IvestWise :: Transaction Profiles (fonte declarativa)
 *
 * Camada de domínio pura. Separa três planos:
 *  - Instrumento  → descrito em `asset-profiles.ts` (ISIN, ticker, TER, maturidade…)
 *  - Investidor   → transações (compras, vendas, reforços, resgates, rendimentos)
 *  - Posição      → derivada (ver `services/transaction-metrics.ts`)
 *
 * O enum `transaction_type` da base de dados é partilhado, mas cada AssetType
 * expõe apenas os movimentos que fazem sentido, com rótulo contextual e uma
 * classificação semântica (`incomeKind`) que preserva a distinção financeira
 * entre dividendo, distribuição, cupão, juro e renda — essencial para o
 * Financial Engine, reporting, rentabilidade e XIRR.
 */

import type { AssetType, TransactionType } from "./types";

/** Direção do fluxo face ao ativo. */
export type FlowDirection = "in" | "out" | "income" | "cost" | "neutral";

/**
 * Natureza económica do rendimento. Vive sobre o enum partilhado e é
 * persistida em `transactions.metadata.incomeKind` (sem migration), para que
 * reporting e motor financeiro nunca confundam conceitos distintos.
 */
export type IncomeKind = "dividend" | "distribution" | "coupon" | "interest" | "rent";

export interface TransactionProfile {
  type: TransactionType;
  label: string;
  direction: FlowDirection;
  /** Usa quantidade (o preço unitário é sempre derivado de montante/quantidade). */
  usesQuantity: boolean;
  /** Conta para o capital investido acumulado (entradas menos saídas de capital). */
  affectsInvestedCapital: boolean;
}

export const TRANSACTION_PROFILES: Record<TransactionType, TransactionProfile> = {
  buy: {
    type: "buy",
    label: "Compra",
    direction: "in",
    usesQuantity: true,
    affectsInvestedCapital: true,
  },
  sell: {
    type: "sell",
    label: "Venda",
    direction: "out",
    usesQuantity: true,
    affectsInvestedCapital: true,
  },
  deposit: {
    type: "deposit",
    label: "Depósito / Reforço",
    direction: "in",
    usesQuantity: false,
    affectsInvestedCapital: true,
  },
  withdrawal: {
    type: "withdrawal",
    label: "Levantamento / Resgate",
    direction: "out",
    usesQuantity: false,
    affectsInvestedCapital: true,
  },
  transfer_in: {
    type: "transfer_in",
    label: "Transferência de entrada",
    direction: "in",
    usesQuantity: false,
    affectsInvestedCapital: true,
  },
  transfer_out: {
    type: "transfer_out",
    label: "Transferência de saída",
    direction: "out",
    usesQuantity: false,
    affectsInvestedCapital: true,
  },
  dividend: {
    type: "dividend",
    label: "Dividendo",
    direction: "income",
    usesQuantity: false,
    affectsInvestedCapital: false,
  },
  interest: {
    type: "interest",
    label: "Juros",
    direction: "income",
    usesQuantity: false,
    affectsInvestedCapital: false,
  },
  coupon: {
    type: "coupon",
    label: "Cupão",
    direction: "income",
    usesQuantity: false,
    affectsInvestedCapital: false,
  },
  fee: {
    type: "fee",
    label: "Despesa",
    direction: "cost",
    usesQuantity: false,
    affectsInvestedCapital: false,
  },
  tax: {
    type: "tax",
    label: "Imposto",
    direction: "cost",
    usesQuantity: false,
    affectsInvestedCapital: false,
  },
  adjustment: {
    type: "adjustment",
    label: "Ajuste",
    direction: "neutral",
    usesQuantity: false,
    affectsInvestedCapital: false,
  },
};

export const getTransactionProfile = (t: TransactionType): TransactionProfile =>
  TRANSACTION_PROFILES[t];

/** Entrada da matriz: tipo do enum + rótulo contextual + semântica. */
export interface TransactionOption {
  type: TransactionType;
  label: string;
  /** Sobrepõe o default do perfil (ex.: aquisição de imóvel não usa quantidade). */
  usesQuantity: boolean;
  incomeKind?: IncomeKind;
  help?: string;
}

const tradedIncome = (
  type: TransactionType,
  label: string,
  incomeKind: IncomeKind,
): TransactionOption => ({ type, label, usesQuantity: false, incomeKind });

const buy = (label = "Compra", usesQuantity = true): TransactionOption => ({
  type: "buy",
  label,
  usesQuantity,
});
const sell = (label = "Venda", usesQuantity = true): TransactionOption => ({
  type: "sell",
  label,
  usesQuantity,
});

/**
 * Matriz AssetType → movimentos disponíveis.
 * `fee` e `tax` deixaram de ser tipos autónomos genéricos: comissões e impostos
 * são campos da própria transação. Só permanecem onde representam um custo
 * verdadeiramente independente do movimento principal (imobiliário).
 */
export const TRANSACTION_MATRIX: Record<AssetType, TransactionOption[]> = {
  etf: [buy(), sell(), tradedIncome("dividend", "Dividendo", "dividend")],
  stock: [buy(), sell(), tradedIncome("dividend", "Dividendo", "dividend")],
  fund: [
    buy("Subscrição"),
    sell("Resgate"),
    tradedIncome("dividend", "Distribuição", "distribution"),
  ],
  bond: [buy(), sell(), tradedIncome("coupon", "Cupão", "coupon")],
  crypto: [
    buy(),
    sell(),
    { type: "transfer_in", label: "Transferência de entrada", usesQuantity: true },
    { type: "transfer_out", label: "Transferência de saída", usesQuantity: true },
  ],
  commodity: [buy(), sell()],
  capitalization_insurance: [
    { type: "deposit", label: "Reforço", usesQuantity: false },
    { type: "withdrawal", label: "Resgate", usesQuantity: false },
    tradedIncome("interest", "Juros", "interest"),
  ],
  ppr: [
    { type: "deposit", label: "Reforço", usesQuantity: false },
    { type: "withdrawal", label: "Resgate", usesQuantity: false },
  ],
  cash: [
    { type: "deposit", label: "Depósito", usesQuantity: false },
    { type: "withdrawal", label: "Levantamento", usesQuantity: false },
    { type: "transfer_in", label: "Transferência de entrada", usesQuantity: false },
    { type: "transfer_out", label: "Transferência de saída", usesQuantity: false },
  ],
  real_estate: [
    buy("Aquisição", false),
    sell("Venda", false),
    tradedIncome("dividend", "Renda", "rent"),
    {
      type: "fee",
      label: "Despesa",
      usesQuantity: false,
      help: "Custo independente do movimento principal (condomínio, obras, IMI).",
    },
  ],
};

/** Opções contextuais para um AssetType. */
export const getTransactionOptions = (assetType: AssetType): TransactionOption[] =>
  TRANSACTION_MATRIX[assetType] ?? [];

/** Tipos de transação permitidos para um AssetType. */
export const getTransactionTypes = (assetType: AssetType): TransactionType[] =>
  getTransactionOptions(assetType).map((o) => o.type);

export const getTransactionOption = (
  assetType: AssetType,
  type: TransactionType,
): TransactionOption | undefined => getTransactionOptions(assetType).find((o) => o.type === type);

/** Rótulo contextual (ex.: dividend → "Renda" em imobiliário). */
export const getTransactionLabel = (assetType: AssetType, type: TransactionType): string =>
  getTransactionOption(assetType, type)?.label ?? TRANSACTION_PROFILES[type].label;

export const getTransactionTypeOptions = (assetType: AssetType) =>
  getTransactionOptions(assetType).map((o) => ({ value: o.type, label: o.label }));


/**
 * Contexto do ativo que altera a semântica de unidades.
 * `unitBased`: produto segurador/PPR baseado em Unidades de Participação (Unit Linked),
 * onde reforços e resgates são expressos em UPs.
 */
export interface QuantityContext {
  unitBased?: boolean;
}

/** Tipos com unidades quando o produto é baseado em UPs. */
const UNIT_LINKED_MOVEMENTS: TransactionType[] = ["deposit", "withdrawal", "buy", "sell"];

/** Tipos de ativo que podem ser baseados em Unidades de Participação. */
export const UNIT_BASED_CAPABLE: AssetType[] = ["capitalization_insurance", "ppr"];

/** Usa quantidade neste contexto (AssetType + tipo + características do ativo). */
export const usesQuantity = (
  assetType: AssetType,
  type: TransactionType,
  ctx: QuantityContext = {},
): boolean => {
  if (
    ctx.unitBased &&
    UNIT_BASED_CAPABLE.includes(assetType) &&
    UNIT_LINKED_MOVEMENTS.includes(type)
  ) {
    return true;
  }
  return getTransactionOption(assetType, type)?.usesQuantity ?? TRANSACTION_PROFILES[type].usesQuantity;
};


export interface TransactionFormValues {
  type: TransactionType;
  occurredAt: string;
  quantity: string;
  amount: string;
  currency: string;
  fees: string;
  taxes: string;
  notes: string;
}

/** Preço unitário derivado do montante e quantidade (nunca introduzido). */
export const derivedUnitPrice = (amount: number, quantity: number): number =>
  quantity > 0 && Number.isFinite(amount) ? amount / quantity : 0;

/**
 * Preço unitário efetivo: inclui comissões e impostos.
 * Numa entrada os custos aumentam o custo unitário; numa saída reduzem o encaixe.
 */
export function effectiveUnitPrice(
  direction: FlowDirection,
  amount: number,
  quantity: number,
  fees = 0,
  taxes = 0,
): number {
  if (!(quantity > 0)) return 0;
  const costs = (fees || 0) + (taxes || 0);
  const total = direction === "out" ? amount - costs : amount + costs;
  return total / quantity;
}

/** Contexto de validação: características do ativo + posição disponível à data. */
export interface TransactionValidationContext extends QuantityContext {
  /** Quantidade detida à data do movimento (para validar alienações). */
  availableQuantity?: number;
}

/** Validação pura do formulário de transação. */
export function validateTransactionForm(
  assetType: AssetType,
  v: TransactionFormValues,
  ctx: TransactionValidationContext = {},
): { ok: true } | { ok: false; message: string } {
  if (!getTransactionTypes(assetType).includes(v.type)) {
    return { ok: false, message: "Tipo de transação não suportado por este ativo." };
  }
  if (!v.occurredAt) return { ok: false, message: "A data da transação é obrigatória." };
  if (!/^[A-Z]{3}$/.test(v.currency))
    return { ok: false, message: "Moeda deve ser ISO 4217 (ex.: EUR)." };

  const num = (s: string) => (s === "" ? NaN : Number(s));

  if (usesQuantity(assetType, v.type, ctx)) {
    const q = num(v.quantity);
    if (!Number.isFinite(q) || q <= 0)
      return { ok: false, message: "Quantidade deve ser maior que zero." };

    const isDisposal = TRANSACTION_PROFILES[v.type].direction === "out";
    if (isDisposal && ctx.availableQuantity != null && q > ctx.availableQuantity + 1e-9) {
      return {
        ok: false,
        message: `Quantidade superior à posição disponível nesta data (${Number(
          ctx.availableQuantity.toFixed(8),
        )}).`,
      };
    }
  }


  const amount = num(v.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "O montante deve ser maior que zero." };
  }
  for (const [key, label] of [
    ["fees", "Comissões"],
    ["taxes", "Impostos"],
  ] as const) {
    const raw = v[key];
    if (raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      return { ok: false, message: `${label} inválidos.` };
    }
  }
  return { ok: true };
}
