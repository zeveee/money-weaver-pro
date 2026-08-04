import { supabase } from "@/integrations/supabase/client";
import type { Transaction, TransactionType } from "@/domain/types";
import { toTransaction } from "./mapping";

export interface TransactionWriteInput {
  type: TransactionType;
  occurredAt: string; // ISO datetime
  quantity?: number;
  unitPrice?: number;
  amount: number;
  currency?: string;
  fees?: number;
  taxes?: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  /** Regra recorrente que originou a transação; null quando manual. */
  recurringTransactionId?: string | null;
}

export async function listTransactions(assetId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("asset_id", assetId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTransaction);
}

export async function createTransaction(
  input: TransactionWriteInput & { assetId: string },
): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      asset_id: input.assetId,
      type: input.type,
      occurred_at: input.occurredAt,
      quantity: input.quantity ?? 0,
      unit_price: input.unitPrice ?? 0,
      amount: input.amount,
      currency: input.currency ?? "EUR",
      fees: input.fees ?? 0,
      taxes: input.taxes ?? 0,
      notes: input.notes ?? null,
      metadata: (input.metadata ?? {}) as never,
      recurring_transaction_id: input.recurringTransactionId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toTransaction(data);
}


export async function updateTransaction(
  id: string,
  input: TransactionWriteInput,
): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      type: input.type,
      occurred_at: input.occurredAt,
      quantity: input.quantity ?? 0,
      unit_price: input.unitPrice ?? 0,
      amount: input.amount,
      currency: input.currency ?? "EUR",
      fees: input.fees ?? 0,
      taxes: input.taxes ?? 0,
      notes: input.notes ?? null,
      metadata: (input.metadata ?? {}) as never,
      ...(input.recurringTransactionId === undefined
        ? {}
        : { recurring_transaction_id: input.recurringTransactionId }),
    })

    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toTransaction(data);
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}
