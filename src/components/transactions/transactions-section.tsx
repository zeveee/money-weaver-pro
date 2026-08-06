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
import { isUnitBased } from "@/domain/asset-profiles";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
  type TransactionWriteInput,
} from "@/repositories/transactions";
import { TransactionFormDialog } from "./transaction-form-dialog";
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


import { formatDateLabel } from "@/lib/date-format";
import { formatCurrency as money, formatQuantity, formatUnitPrice } from "@/lib/number-format";

const dateLabel = (iso: string) => formatDateLabel(iso);

const INCOME_KIND_LABEL: Record<string, string> = {
  dividend: "Dividendos",
  distribution: "Distribuições",
  coupon: "Cupões",
  interest: "Juros",
  rent: "Rendas",
};

export function TransactionsSection({
  asset,
  reportingCurrency,
}: {
  asset: Asset;
  reportingCurrency?: string | null;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", asset.id],
    queryFn: () => listTransactions(asset.id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["transactions", asset.id] });

  const createM = useMutation({
    mutationFn: (input: TransactionWriteInput) =>
      createTransaction({ ...input, assetId: asset.id }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      toast.success("Transação criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransactionWriteInput }) =>
      updateTransaction(id, input),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Transação atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => {
      invalidate();
      toast.success("Transação eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unitBased = isUnitBased(asset.type, asset.metadata);
  const totals = useMemo(() => transactionTotals(transactions), [transactions]);
  const position = useMemo(
    () => derivePosition(asset.type, transactions, { unitBased }),
    [asset.type, transactions],
  );

  // Camada de reporting: só entra em cena quando a moeda do ativo difere da
  // moeda base da carteira. O plano nativo acima mantém-se intocado.
  const reporting = (reportingCurrency ?? "").toUpperCase();
  const showFx = !!reporting && reporting !== asset.currency.toUpperCase();
  const { table: fxTable, isEmpty: fxEmpty } = useFxTable([asset.currency], {
    enabled: showFx,
  });
  const reported = useMemo(
    () => (showFx ? reportedTransactionTotals(fxTable, transactions, reporting) : null),
    [showFx, fxTable, transactions, reporting],
  );

  const sub = (value: number) =>
    reported ? money(value, reported.currency) : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Transações</CardTitle>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm">Nova transação</Button>
          </DialogTrigger>
          <TransactionFormDialog
            title="Nova transação"
            assetType={asset.type}
            currency={asset.currency}
            transactions={transactions}
            unitBased={unitBased}
            onSubmit={(input) => createM.mutate(input)}
            loading={createM.isPending}
          />

        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            label="Capital investido"
            value={money(totals.investedCapital, asset.currency)}
            sub={reported && sub(reported.investedCapital)}
          />
          <SummaryTile
            label="Total de entradas"
            value={money(totals.inflows, asset.currency)}
            sub={reported && sub(reported.inflows)}
          />
          <SummaryTile
            label="Total de saídas"
            value={money(totals.outflows, asset.currency)}
            sub={reported && sub(reported.outflows)}
          />
          {position.tracksQuantity && (
            <>
              <SummaryTile
                label="Quantidade (derivada)"
                value={formatQuantity(position.quantity)}
              />
              <SummaryTile
                label="Custo médio (derivado)"
                value={position.quantity > 0 ? formatUnitPrice(position.averageCost, asset.currency) : "—"}
              />
            </>
          )}
          <SummaryTile
            label="Rendimentos"
            value={money(totals.income, asset.currency)}
            sub={reported && sub(reported.income)}
          />
          <SummaryTile
            label="Custos"
            value={money(totals.costs, asset.currency)}
            sub={reported && sub(reported.costs)}
          />
          <SummaryTile
            label="Mais-valia realizada"
            value={money(position.realizedGain, asset.currency)}
          />
        </div>

        {showFx && (
          <>
            <FxFootnote
              currency={asset.currency}
              reportingCurrency={reporting}
              isEmpty={fxEmpty}
            />
            {reported && reported.missingCurrencies.length > 0 && (
              <p className="text-xs text-destructive">
                Totais parciais: sem taxa histórica para{" "}
                {reported.missingCurrencies.join(", ")}.
              </p>
            )}
          </>
        )}


        {Object.keys(totals.incomeByKind).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Rendimento por natureza:{" "}
            {Object.entries(totals.incomeByKind)
              .map(
                ([kind, value]) =>
                  `${INCOME_KIND_LABEL[kind] ?? kind}: ${money(value, asset.currency)}`,
              )
              .join(" · ")}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar transações…</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não existem transações. As transações são a fonte de verdade do histórico
            financeiro deste ativo.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {transactions.map((t) => {
              const profile = getTransactionProfile(t.type);
              const withQty = usesQuantityFor(asset.type, t.type, { unitBased });
              const inconsistent = position.inconsistentTransactionIds.includes(t.id);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{getTransactionLabel(asset.type, t.type)}</Badge>
                      {t.recurringTransactionId && <Badge variant="outline">Recorrente</Badge>}
                      {inconsistent && (
                        <Badge variant="destructive">Quantidade incoerente</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {dateLabel(t.occurredAt)}
                      </span>
                    </div>
                    <p className="text-sm">
                      {money(t.amount, t.currency)}
                      {withQty && t.quantity > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatQuantity(t.quantity)} × {formatUnitPrice(t.unitPrice, t.currency)}
                        </span>
                      )}
                      {(t.fees > 0 || t.taxes > 0) && (
                        <span className="text-muted-foreground">
                          {" "}
                          · custos {money(t.fees + t.taxes, t.currency)}
                        </span>
                      )}
                    </p>
                    {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                  </div>

                  <div className="flex gap-2">
                    <Dialog
                      open={editing?.id === t.id}
                      onOpenChange={(o) => setEditing(o ? t : null)}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          Editar
                        </Button>
                      </DialogTrigger>
                      <TransactionFormDialog
                        title="Editar transação"
                        assetType={asset.type}
                        currency={asset.currency}
                        transactions={transactions}
                        unitBased={unitBased}
                        transaction={t}
                        onSubmit={(input) => updateM.mutate({ id: t.id, input })}
                        loading={updateM.isPending}
                      />
                    </Dialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Eliminar
                        </Button>
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
                          <AlertDialogAction onClick={() => deleteM.mutate(t.id)}>
                            Eliminar
                          </AlertDialogAction>
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

function SummaryTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null | false;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">≈ {sub}</p>}
    </div>
  );
}
