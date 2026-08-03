/**
 * IvestWise :: Transaction Profiles (fonte declarativa)
 *
 * Camada de domínio pura. Descreve, por TransactionType, o rótulo,
 * a direção do fluxo de caixa e se usa quantidade/preço unitário.
 * Os tipos disponíveis por AssetType vêm de `asset-profiles.ts`.
 */

import type { AssetType, TransactionType } from "./types";
import { getAssetProfile } from "./asset-profiles";

/** Direção do fluxo face ao ativo. */
export type FlowDirection = "in" | "out" | "income" | "cost" | "neutral";

export interface TransactionProfile {
  type: TransactionType;
  label: string;
  direction: FlowDirection;
  /** Usa quantidade e preço unitário (ex.: buy/sell). */
  usesQuantity: boolean;
  /** Conta para o capital investido acumulado (entradas menos saídas de capital). */
  affectsInvestedCapital: boolean;
}

export const TRANSACTION_PROFILES: Record<TransactionType, TransactionProfile> = {
  buy: { type: "buy", label: "Compra", direction: "in", usesQuantity: true, affectsInvestedCapital: true },
  sell: { type: "sell", label: "Venda", direction: "out", usesQuantity: true, affectsInvestedCapital: true },
  deposit: { type: "deposit", label: "Depósito / Reforço", direction: "in", usesQuantity: false, affectsInvestedCapital: true },
  withdrawal: { type: "withdrawal", label: "Levantamento / Resgate", direction: "out", usesQuantity: false, affectsInvestedCapital: true },
  transfer_in: { type: "transfer_in", label: "Transferência de entrada", direction: "in", usesQuantity: false, affectsInvestedCapital: true },
  transfer_out: { type: "transfer_out", label: "Transferência de saída", direction: "out", usesQuantity: false, affectsInvestedCapital: true },
  dividend: { type: "dividend", label: "Dividendo", direction: "income", usesQuantity: false, affectsInvestedCapital: false },
  interest: { type: "interest", label: "Juros", direction: "income", usesQuantity: false, affectsInvestedCapital: false },
  coupon: { type: "coupon", label: "Cupão", direction: "income", usesQuantity: false, affectsInvestedCapital: false },
  fee: { type: "fee", label: "Comissão", direction: "cost", usesQuantity: false, affectsInvestedCapital: false },
  tax: { type: "tax", label: "Imposto", direction: "cost", usesQuantity: false, affectsInvestedCapital: false },
  adjustment: { type: "adjustment", label: "Ajuste", direction: "neutral", usesQuantity: false, affectsInvestedCapital: false },
};

export const getTransactionProfile = (t: TransactionType): TransactionProfile =>
  TRANSACTION_PROFILES[t];

/** Tipos de transação permitidos para um AssetType. */
export const getTransactionTypes = (assetType: AssetType): TransactionType[] =>
  getAssetProfile(assetType).transactionTypes;

export const getTransactionTypeOptions = (assetType: AssetType) =>
  getTransactionTypes(assetType).map((t) => ({ value: t, label: TRANSACTION_PROFILES[t].label }));

export interface TransactionFormValues {
  type: TransactionType;
  occurredAt: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  currency: string;
  fees: string;
  taxes: string;
  notes: string;
}

/** Validação pura do formulário de transação. */
export function validateTransactionForm(
  assetType: AssetType,
  v: TransactionFormValues,
): { ok: true } | { ok: false; message: string } {
  if (!getTransactionTypes(assetType).includes(v.type)) {
    return { ok: false, message: "Tipo de transação não suportado por este ativo." };
  }
  if (!v.occurredAt) return { ok: false, message: "A data da transação é obrigatória." };
  if (!/^[A-Z]{3}$/.test(v.currency)) return { ok: false, message: "Moeda deve ser ISO 4217 (ex.: EUR)." };

  const profile = TRANSACTION_PROFILES[v.type];
  const num = (s: string) => (s === "" ? NaN : Number(s));

  if (profile.usesQuantity) {
    const q = num(v.quantity);
    const p = num(v.unitPrice);
    if (!Number.isFinite(q) || q <= 0) return { ok: false, message: "Quantidade deve ser maior que zero." };
    if (!Number.isFinite(p) || p < 0) return { ok: false, message: "Preço unitário inválido." };
  }

  const amount = num(v.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "O montante deve ser maior que zero." };
  }
  for (const [key, label] of [["fees", "Comissões"], ["taxes", "Impostos"]] as const) {
    const raw = v[key];
    if (raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      return { ok: false, message: `${label} inválidos.` };
    }
  }
  return { ok: true };
}
