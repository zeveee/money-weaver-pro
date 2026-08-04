import { supabase } from "@/integrations/supabase/client";
import type {
  RecurrenceExecutionMode,
  RecurrenceFrequency,
  RecurringTransaction,
  Transaction,
  TransactionType,
} from "@/domain/types";
import { toRecurringTransaction, toTransaction } from "./mapping";
import { occurrencesBetween, todayISO } from "@/services/recurrence";

export interface RecurringWriteInput {
  type: TransactionType;
  amount: number;
  currency?: string;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
  isActive?: boolean;
  executionMode?: RecurrenceExecutionMode;
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
  execution_mode: input.executionMode ?? "manual",
  notes: input.notes ?? null,
  metadata: (input.metadata ?? {}) as never,
});

export async function createRecurringTransaction(
  input: RecurringWriteInput & { assetId: string; backfillHistory?: boolean },
): Promise<RecurringTransaction> {
  const mode = input.executionMode ?? "manual";
  // Histórico pedido → marca vazia, para que as ocorrências passadas existam.
  // Em modo manual ficam apenas pendentes; em automático são materializadas já.
  const backfill = Boolean(input.backfillHistory);

  const { data, error } = await supabase
    .from("recurring_transactions")
    .insert({
      asset_id: input.assetId,
      ...payload(input),
      // Opção A (apenas futuro): nada retroativo é gerado nem fica pendente.
      last_generated_on: backfill ? null : todayISO(),
    })
    .select("*")
    .single();
  if (error) throw error;
  const rule = toRecurringTransaction(data);

  if (backfill && mode === "automatic") {
    await generateOccurrences(rule);
  }
  return rule;
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

/** Avança a marca de processamento sem criar transações (dispensar ocorrências). */
export async function markGeneratedUpTo(
  id: string,
  date: string,
): Promise<RecurringTransaction> {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .update({ last_generated_on: date })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toRecurringTransaction(data);
}

/** Cria as transações das datas indicadas (ou de todas as previstas até hoje). */
export async function generateOccurrences(
  rule: RecurringTransaction,
  dates?: string[],
  upTo: string = todayISO(),
): Promise<Transaction[]> {
  const targets =
    dates ?? occurrencesBetween(rule, upTo, rule.lastGeneratedOn ?? null);
  if (targets.length === 0) return [];

  const rows = targets.map((date) => ({
    asset_id: rule.assetId,
    type: rule.type,
    occurred_at: `${date}T00:00:00.000Z`,
    quantity: 0,
    unit_price: 0,
    amount: rule.amount,
    currency: rule.currency,
    fees: 0,
    taxes: 0,
    notes: rule.notes,
    metadata: {} as never,
    recurring_transaction_id: rule.id,
  }));

  const { data, error } = await supabase
    .from("transactions")
    .upsert(rows, {
      onConflict: "recurring_transaction_id,occurred_at",
      ignoreDuplicates: true,
    })
    .select("*");
  if (error) throw error;

  const latest = targets[targets.length - 1]!;
  if (!rule.lastGeneratedOn || latest > rule.lastGeneratedOn) {
    await markGeneratedUpTo(rule.id, latest);
  }
  return (data ?? []).map(toTransaction);
}
