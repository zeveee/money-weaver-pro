import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Asset, RecurringTransaction } from "@/domain/types";
import { getTransactionLabel } from "@/domain/transaction-profiles";
import { listTransactions } from "@/repositories/transactions";
import { dismissedDates, nextOccurrence, pendingOccurrences, todayISO } from "@/services/recurrence";
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  dismissOccurrences,
  generateOccurrences,
  listRecurringTransactions,
  restoreOccurrences,
  updateRecurringTransaction,
  type RecurringWriteInput,
} from "@/repositories/recurring-transactions";
import { FREQUENCY_OPTIONS, RecurringFormDialog } from "./recurring-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

import { formatDateLabel } from "@/lib/date-format";

const dateLabel = (iso: string) => formatDateLabel(iso);
const freqLabel = (f: string) => FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? f;

export function RecurringSection({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const autoRan = useRef<Set<string>>(new Set());

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["recurring", asset.id],
    queryFn: () => listRecurringTransactions(asset.id),
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", asset.id],
    queryFn: () => listTransactions(asset.id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["recurring", asset.id] });
    qc.invalidateQueries({ queryKey: ["transactions", asset.id] });
  };

  const createM = useMutation({
    mutationFn: (input: RecurringWriteInput & { backfillHistory?: boolean }) =>
      createRecurringTransaction({ ...input, assetId: asset.id }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      toast.success("Reforço programado criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecurringWriteInput }) =>
      updateRecurringTransaction(id, input),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Reforço programado atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteRecurringTransaction(id),
    onSuccess: () => {
      invalidate();
      toast.success("Reforço programado eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const generateM = useMutation({
    mutationFn: ({ rule, dates }: { rule: RecurringTransaction; dates: string[] }) =>
      generateOccurrences(rule, dates),
    onSuccess: (created) => {
      invalidate();
      toast.success(
        created.length === 1 ? "Transação criada" : `${created.length} transações criadas`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dismissM = useMutation({
    mutationFn: ({ id, dates }: { id: string; dates: string[] }) =>
      dismissOccurrences(id, dates),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(
        vars.dates.length === 1 ? "Ocorrência dispensada" : `${vars.dates.length} ocorrências dispensadas`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreM = useMutation({
    mutationFn: ({ id, dates }: { id: string; dates: string[] }) => restoreOccurrences(id, dates),
    onSuccess: () => {
      invalidate();
      toast.success("Ocorrências repostas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Recuperação idempotente das regras automáticas ao abrir o ativo.
  useEffect(() => {
    for (const rule of rules) {
      if (rule.executionMode !== "automatic" || !rule.isActive) continue;
      if (autoRan.current.has(rule.id)) continue;
      const pending = pendingOccurrences(rule, transactions);
      if (pending.length === 0) continue;
      autoRan.current.add(rule.id);
      generateOccurrences(rule, pending)
        .then(() => invalidate())
        .catch((e: Error) => toast.error(e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, transactions]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Reforços Programados</CardTitle>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm">Novo reforço</Button>
          </DialogTrigger>
          <RecurringFormDialog
            title="Novo reforço programado"
            assetType={asset.type}
            currency={asset.currency}
            onSubmit={(input) => createM.mutate(input)}
            loading={createM.isPending}
          />
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Instruções, não factos financeiros. Só as transações geradas entram em capital
          investido, rentabilidade e XIRR.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar reforços…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não existem reforços programados.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rules.map((r) => {
              const pending = pendingOccurrences(r, transactions);
              const dismissed = dismissedDates(r);
              const next = r.isActive ? nextOccurrence(r, todayISO()) : null;
              return (
                <li key={r.id} className="space-y-3 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{getTransactionLabel(asset.type, r.type)}</Badge>
                        <Badge variant={r.isActive ? "outline" : "destructive"}>
                          {r.isActive ? "Ativa" : "Inativa"}
                        </Badge>
                        <Badge variant="outline">
                          {r.executionMode === "automatic" ? "Automático" : "Manual"}
                        </Badge>
                      </div>
                      <p className="text-sm">
                        {money(r.amount, r.currency)} · {freqLabel(r.frequency)}
                        {r.dayOfMonth ? ` · dia ${r.dayOfMonth}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Início {dateLabel(r.startDate)}
                        {r.endDate ? ` · fim ${dateLabel(r.endDate)}` : " · sem fim definido"}
                        {next ? ` · próxima ${dateLabel(next)}` : ""}
                      </p>
                      {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                    </div>

                    <div className="flex gap-2">
                      <Dialog open={editing?.id === r.id} onOpenChange={(o) => setEditing(o ? r : null)}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">Editar</Button>
                        </DialogTrigger>
                        <RecurringFormDialog
                          title="Editar reforço programado"
                          assetType={asset.type}
                          currency={asset.currency}
                          recurring={r}
                          onSubmit={(input) => updateM.mutate({ id: r.id, input })}
                          loading={updateM.isPending}
                        />
                      </Dialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">Eliminar</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar reforço programado?</AlertDialogTitle>
                            <AlertDialogDescription>
                              As transações já geradas mantêm-se; apenas a instrução é removida.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteM.mutate(r.id)}>
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {pending.length > 0 && (
                    <div className="space-y-2 rounded-md bg-muted/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium">
                          {pending.length} ocorrência(s) pendente(s) ·{" "}
                          {money(pending.length * r.amount, r.currency)}
                          {r.executionMode === "automatic" ? " (a gerar…)" : ""}
                        </p>
                        {r.executionMode === "manual" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={generateM.isPending}
                              onClick={() => generateM.mutate({ rule: r, dates: pending })}
                            >
                              Confirmar todas
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={dismissM.isPending}
                              onClick={() =>
                                dismissM.mutate({ id: r.id, dates: pending })
                              }
                            >
                              Dispensar todas
                            </Button>
                          </div>
                        )}
                      </div>
                      {r.executionMode === "manual" && (
                        <ul className="space-y-1">
                          {pending.slice(0, 12).map((d) => (
                            <li key={d} className="flex items-center justify-between gap-2 text-xs">
                              <span>{dateLabel(d)} · {money(r.amount, r.currency)}</span>
                              <span className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  disabled={generateM.isPending}
                                  onClick={() => generateM.mutate({ rule: r, dates: [d] })}
                                >
                                  Confirmar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  disabled={dismissM.isPending}
                                  onClick={() => dismissM.mutate({ id: r.id, dates: [d] })}
                                >
                                  Dispensar
                                </Button>
                              </span>
                            </li>
                          ))}
                          {pending.length > 12 && (
                            <li className="text-xs text-muted-foreground">
                              … e mais {pending.length - 12}.
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}

                  {dismissed.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-2">
                      <p className="text-xs text-muted-foreground">
                        {dismissed.length} ocorrência(s) dispensada(s)
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={restoreM.isPending}
                        onClick={() => restoreM.mutate({ id: r.id, dates: dismissed })}
                      >
                        Repor
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
