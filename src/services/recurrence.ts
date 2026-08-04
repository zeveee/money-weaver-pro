/**
 * IvestWise :: Motor de recorrência (serviço puro)
 *
 * Calcula as datas previstas de uma instrução recorrente. Não faz I/O e não
 * participa em nenhum cálculo financeiro: as ocorrências só se tornam factos
 * quando existirem como `transactions`.
 */

import type { RecurrenceFrequency, RecurringTransaction, Transaction } from "@/domain/types";

const MONTHS_PER_STEP: Record<Exclude<RecurrenceFrequency, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const parse = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const lastDayOfMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** Data prevista da n-ésima ocorrência (n = 0 é a data de início). */
export function occurrenceAt(
  startDate: string,
  frequency: RecurrenceFrequency,
  dayOfMonth: number | null,
  index: number,
): string {
  const start = parse(startDate);
  if (frequency === "weekly") {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + index * 7);
    return toISO(d);
  }
  const step = MONTHS_PER_STEP[frequency];
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index * step, 1));
  const wanted = dayOfMonth ?? start.getUTCDate();
  const day = Math.min(wanted, lastDayOfMonth(target.getUTCFullYear(), target.getUTCMonth()));
  return toISO(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)));
}

export interface OccurrenceWindow {
  startDate: string;
  frequency: RecurrenceFrequency;
  dayOfMonth: number | null;
  endDate?: string | null;
}

const MAX_OCCURRENCES = 1000;

/** Todas as datas previstas em (after, upTo]. `after` exclusivo; null = desde o início. */
export function occurrencesBetween(
  rule: OccurrenceWindow,
  upTo: string,
  after: string | null = null,
): string[] {
  const dates: string[] = [];
  for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
    const date = occurrenceAt(rule.startDate, rule.frequency, rule.dayOfMonth, i);
    if (date > upTo) break;
    if (rule.endDate && date > rule.endDate) break;
    if (after === null || date > after) dates.push(date);
  }
  return dates;
}

/** Próxima data prevista estritamente depois de `from`. */
export function nextOccurrence(rule: OccurrenceWindow, from: string): string | null {
  for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
    const date = occurrenceAt(rule.startDate, rule.frequency, rule.dayOfMonth, i);
    if (rule.endDate && date > rule.endDate) return null;
    if (date > from) return date;
  }
  return null;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Datas explicitamente dispensadas, guardadas nos metadados da regra. */
export function dismissedDates(rule: Pick<RecurringTransaction, "metadata">): string[] {
  const raw = (rule.metadata as Record<string, unknown> | null)?.["dismissedDates"];
  return Array.isArray(raw) ? raw.filter((d): d is string => typeof d === "string") : [];
}

/**
 * Ocorrências ainda por processar: previstas até `upTo`, a partir da âncora
 * `lastGeneratedOn` (limite inferior fixo da regra), sem transação já ligada à
 * regra nessa data e não dispensadas individualmente.
 */
export function pendingOccurrences(
  rule: RecurringTransaction,
  transactions: Transaction[],
  upTo: string = todayISO(),
): string[] {
  if (!rule.isActive) return [];
  const taken = new Set(
    transactions
      .filter((t) => t.recurringTransactionId === rule.id)
      .map((t) => t.occurredAt.slice(0, 10)),
  );
  const dismissed = new Set(dismissedDates(rule));
  return occurrencesBetween(rule, upTo, rule.lastGeneratedOn ?? null).filter(
    (d) => !taken.has(d) && !dismissed.has(d),
  );
}

