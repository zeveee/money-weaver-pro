import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  AssetType,
  RecurrenceExecutionMode,
  RecurrenceFrequency,
  RecurringTransaction,
  TransactionType,
} from "@/domain/types";
import { getTransactionProfile, getTransactionTypeOptions } from "@/domain/transaction-profiles";
import { occurrencesBetween, todayISO } from "@/services/recurrence";
import type { RecurringWriteInput } from "@/repositories/recurring-transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const FREQUENCY_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];

export const MODE_OPTIONS: { value: RecurrenceExecutionMode; label: string }[] = [
  { value: "manual", label: "Manual (confirmação do utilizador)" },
  { value: "automatic", label: "Automático (débito direto)" },
];

const today = () => new Date().toISOString().slice(0, 10);

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

export function RecurringFormDialog({
  title, assetType, currency, recurring, onSubmit, loading,
}: {
  title: string;
  assetType: AssetType;
  currency: string;
  recurring?: RecurringTransaction;
  onSubmit: (input: RecurringWriteInput & { backfillHistory?: boolean }) => void;
  loading: boolean;
}) {
  const typeOptions = getTransactionTypeOptions(assetType).filter((o) =>
    ["in", "out"].includes(getTransactionProfile(o.value as TransactionType).direction),
  );

  const [type, setType] = useState<TransactionType>(
    recurring?.type ?? ((typeOptions[0]?.value as TransactionType) ?? "deposit"),
  );
  const [amount, setAmount] = useState(recurring ? String(recurring.amount) : "");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(recurring?.frequency ?? "monthly");
  const [dayOfMonth, setDayOfMonth] = useState(recurring?.dayOfMonth ? String(recurring.dayOfMonth) : "");
  const [startDate, setStartDate] = useState(recurring?.startDate ?? today());
  const [endDate, setEndDate] = useState(recurring?.endDate ?? "");
  const [isActive, setIsActive] = useState(recurring?.isActive ?? true);
  const [executionMode, setExecutionMode] = useState<RecurrenceExecutionMode>(
    recurring?.executionMode ?? "manual",
  );
  const [backfill, setBackfill] = useState(false);
  const [notes, setNotes] = useState(recurring?.notes ?? "");

  const isNew = !recurring;
  const preview = useMemo(() => {
    if (!isNew || !backfill || !startDate) return [];
    const day = dayOfMonth ? Number(dayOfMonth) : null;
    return occurrencesBetween(
      { startDate, frequency, dayOfMonth: day, endDate: endDate || null },
      todayISO(),
    );
  }, [isNew, backfill, startDate, frequency, dayOfMonth, endDate]);
  const previewTotal = preview.length * (Number(amount) || 0);


  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) return toast.error("Montante deve ser maior que zero");
    if (!startDate) return toast.error("Data de início é obrigatória");
    const day = dayOfMonth ? Number(dayOfMonth) : null;
    if (day !== null && (day < 1 || day > 31)) return toast.error("Dia de execução deve estar entre 1 e 31");
    if (endDate && endDate < startDate) return toast.error("Data de fim não pode ser anterior ao início");

    onSubmit({
      type,
      amount: value,
      currency,
      frequency,
      dayOfMonth: day,
      startDate,
      endDate: endDate || null,
      isActive,
      executionMode,
      notes: notes.trim() || null,
      ...(isNew ? { backfillHistory: backfill } : {}),
    });
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Instrução declarativa de reforço. Não gera transações nem entra em capital investido,
          rentabilidade ou XIRR.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="r-type">Tipo de movimento *</Label>
          <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
            <SelectTrigger id="r-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {typeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="r-amount">Montante ({currency}) *</Label>
            <Input id="r-amount" type="number" min={0} step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-freq">Frequência *</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
              <SelectTrigger id="r-freq"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-day">Dia de execução</Label>
            <Input id="r-day" type="number" min={1} max={31} step={1} value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-start">Início *</Label>
            <Input id="r-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-end">Fim</Label>
            <Input id="r-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox id="r-active" checked={isActive} onCheckedChange={(c) => setIsActive(Boolean(c))} />
          <Label htmlFor="r-active">Ativa</Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="r-mode">Modo de execução *</Label>
          <Select
            value={executionMode}
            onValueChange={(v) => setExecutionMode(v as RecurrenceExecutionMode)}
          >
            <SelectTrigger id="r-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {executionMode === "manual"
              ? "As ocorrências previstas ficam pendentes até serem confirmadas."
              : "As transações previstas são criadas automaticamente nas datas devidas."}
          </p>
        </div>

        {isNew && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="r-backfill"
                checked={backfill}
                onCheckedChange={(c) => setBackfill(Boolean(c))}
              />
              <Label htmlFor="r-backfill">
                Gerar histórico desde a data de início
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {backfill
                ? preview.length === 0
                  ? "Nenhuma ocorrência prevista até hoje."
                  : executionMode === "manual"
                    ? `${preview.length} ocorrências entre ${formatDateLabel(preview[0]!)} e ${formatDateLabel(preview[preview.length - 1]!)} · total ${money(previewTotal, currency)}. Ficam pendentes para confirmação — nenhuma transação é criada automaticamente.`
                    : `${preview.length} ocorrências entre ${formatDateLabel(preview[0]!)} e ${formatDateLabel(preview[preview.length - 1]!)} · total ${money(previewTotal, currency)}. Serão criadas transações reais, que contam para capital investido, rentabilidade e XIRR.`
                : "Sem histórico: a regra passa a valer apenas para o futuro."}
            </p>
          </div>
        )}

        <div className="space-y-2">

          <Label htmlFor="r-notes">Notas</Label>
          <Textarea id="r-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={loading}>{loading ? "A guardar…" : "Guardar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
