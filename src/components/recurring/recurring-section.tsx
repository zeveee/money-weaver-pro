import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Asset, RecurringTransaction } from "@/domain/types";
import { getTransactionLabel } from "@/domain/transaction-profiles";
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  listRecurringTransactions,
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

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-PT");
const freqLabel = (f: string) => FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? f;

export function RecurringSection({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["recurring", asset.id],
    queryFn: () => listRecurringTransactions(asset.id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["recurring", asset.id] });

  const createM = useMutation({
    mutationFn: (input: RecurringWriteInput) =>
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
          Instruções futuras. Não são factos financeiros: não entram em capital investido,
          rentabilidade nem XIRR.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar reforços…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não existem reforços programados.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{getTransactionLabel(asset.type, r.type)}</Badge>
                    <Badge variant={r.isActive ? "outline" : "destructive"}>
                      {r.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                  <p className="text-sm">
                    {money(r.amount, r.currency)} · {freqLabel(r.frequency)}
                    {r.dayOfMonth ? ` · dia ${r.dayOfMonth}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Início {dateLabel(r.startDate)}
                    {r.endDate ? ` · fim ${dateLabel(r.endDate)}` : " · sem fim definido"}
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
