import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Asset, Transaction } from "@/domain/types";
import {
  getTransactionLabel,
  getTransactionProfile,
  usesQuantity as usesQuantityFor,
} from "@/domain/transaction-profiles";
import { derivePosition, transactionTotals } from "@/services/transaction-metrics";
import {
  createTransaction, deleteTransaction, listTransactions, updateTransaction,
  type TransactionWriteInput,
} from "@/repositories/transactions";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-PT");

export function TransactionsSection({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", asset.id],
    queryFn: () => listTransactions(asset.id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["transactions", asset.id] });

  const createM = useMutation({
    mutationFn: (input: TransactionWriteInput) => createTransaction({ ...input, assetId: asset.id }),
    onSuccess: () => { invalidate(); setCreating(false); toast.success("Transação criada"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransactionWriteInput }) => updateTransaction(id, input),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Transação atualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => { invalidate(); toast.success("Transação eliminada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => transactionTotals(transactions), [transactions]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Transações</CardTitle>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild><Button size="sm">Nova transação</Button></DialogTrigger>
          <TransactionFormDialog
            title="Nova transação"
            assetType={asset.type}
            currency={asset.currency}
            onSubmit={(input) => createM.mutate(input)}
            loading={createM.isPending}
          />
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Capital investido" value={money(totals.investedCapital, asset.currency)} />
          <SummaryTile label="Total de entradas" value={money(totals.inflows, asset.currency)} />
          <SummaryTile label="Total de saídas" value={money(totals.outflows, asset.currency)} />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar transações…</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não existem transações. As transações são a fonte de verdade do histórico financeiro deste ativo.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {transactions.map((t) => {
              const profile = getTransactionProfile(t.type);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{profile.label}</Badge>
                      <span className="text-xs text-muted-foreground">{dateLabel(t.occurredAt)}</span>
                    </div>
                    <p className="text-sm">
                      {money(t.amount, t.currency)}
                      {profile.usesQuantity && t.quantity > 0 && (
                        <span className="text-muted-foreground">
                          {" "}· {t.quantity} × {money(t.unitPrice, t.currency)}
                        </span>
                      )}
                      {(t.fees > 0 || t.taxes > 0) && (
                        <span className="text-muted-foreground">
                          {" "}· custos {money(t.fees + t.taxes, t.currency)}
                        </span>
                      )}
                    </p>
                    {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                  </div>

                  <div className="flex gap-2">
                    <Dialog open={editing?.id === t.id} onOpenChange={(o) => setEditing(o ? t : null)}>
                      <DialogTrigger asChild><Button variant="outline" size="sm">Editar</Button></DialogTrigger>
                      <TransactionFormDialog
                        title="Editar transação"
                        assetType={asset.type}
                        currency={asset.currency}
                        transaction={t}
                        onSubmit={(input) => updateM.mutate({ id: t.id, input })}
                        loading={updateM.isPending}
                      />
                    </Dialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">Eliminar</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar transação?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação é irreversível e altera o histórico financeiro do ativo.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteM.mutate(t.id)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
