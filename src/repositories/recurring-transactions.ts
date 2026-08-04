import { supabase } from "@/integrations/supabase/client";
import type { RecurrenceFrequency, RecurringTransaction, TransactionType } from "@/domain/types";
import { toRecurringTransaction } from "./mapping";

export interface RecurringWriteInput {
  type: TransactionType;
  amount: number;
  currency?: string;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
  isActive?: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export async function listRecurringTransactions(assetId: string): Promise<RecurringTransaction[]> {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("asset_id", assetId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRecurringTransaction);
}

const payload = (input: RecurringWriteInput) => ({
  type: input.type,
  amount: input.amount,
  currency: input.currency ?? "EUR",
  frequency: input.frequency,
  day_of_month: input.dayOfMonth ?? null,
  start_date: input.startDate,
  end_date: input.endDate ?? null,
  is_active: input.isActive ?? true,
  notes: input.notes ?? null,
  metadata: (input.metadata ?? {}) as never,
});

export async function createRecurringTransaction(
  input: RecurringWriteInput & { assetId: string },
): Promise<RecurringTransaction> {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .insert({ asset_id: input.assetId, ...payload(input) })
    .select("*")
    .single();
  if (error) throw error;
  return toRecurringTransaction(data);
}

export async function updateRecurringTransaction(
  id: string,
  input: RecurringWriteInput,
): Promise<RecurringTransaction> {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .update(payload(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toRecurringTransaction(data);
}

export async function deleteRecurringTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
  if (error) throw error;
}
