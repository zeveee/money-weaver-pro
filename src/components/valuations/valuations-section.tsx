import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Asset, AssetValuation } from "@/domain/types";
import { getValuationSpec, isUnitBased } from "@/domain/asset-profiles";
import { formatDateLabel } from "@/lib/date-format";
import { listTransactions } from "@/repositories/transactions";
import { derivePosition } from "@/services/transaction-metrics";
import { availableQuantityAt, positionAt } from "@/services/position-engine";
import {
  referenceValuation,
  referenceValue,
  resolveValuationValue,
  todayISODate,
  unrealizedGain,
  valuationMode,
} from "@/services/valuation-metrics";
import {
  createValuation,
  deleteValuation,
  listValuations,
  updateValuation,
  type ValuationWriteInput,
} from "@/repositories/valuations";
import { ValuationFormDialog } from "./valuation-form-dialog";
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

export function ValuationsSection({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AssetValuation | null>(null);
  const unitBased = isUnitBased(asset.type, asset.metadata);
  const spec = getValuationSpec(asset.type, { unitBased });

  const { data: valuations = [], isLoading } = useQuery({
    queryKey: ["valuations", asset.id],
    queryFn: () => listValuations(asset.id),
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", asset.id],
    queryFn: () => listTransactions(asset.id),
  });

  const position = derivePosition(asset.type, transactions, { unitBased });
  const quantityAt = (date: string) =>
    availableQuantityAt(asset.type, transactions, date, { unitBased });
  const latest = referenceValuation(valuations);
  // Valorizações derivadas são recalculadas aqui (NAV × quantidade à data),
  // pelo que refletem de imediato alterações ao histórico de transações.
  const current = referenceValue(valuations, position.costBasis, asset.currency, quantityAt);
  // Todas as métricas derivadas usam a POSIÇÃO À DATA da valorização de
  // referência — nunca a posição atual.
  const refPosition = latest
    ? positionAt(asset.type, transactions, latest.valuationDate, { unitBased })
    : position;
  const gain = unrealizedGain(current, refPosition.costBasis);
  const isFuture = !!latest && latest.valuationDate > todayISODate();
  const asOfLabel = latest ? formatDateLabel(latest.valuationDate) : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["valuations", asset.id] });
    qc.invalidateQueries({ queryKey: ["asset", asset.id] });
  };

  const createMut = useMutation({
    mutationFn: (input: ValuationWriteInput) => createValuation({ ...input, assetId: asset.id }),
    onSuccess: () => {
      toast.success("Valorização registada");
      setCreating(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ValuationWriteInput }) =>
      updateValuation(id, input),
    onSuccess: () => {
      toast.success("Valorização atualizada");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteValuation(id),
    onSuccess: () => {
      toast.success("Valorização eliminada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Valorações</CardTitle>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm">Nova valorização</Button>
          </DialogTrigger>
          {creating && (
            <ValuationFormDialog
              title="Nova valorização"
              assetType={asset.type}
              currency={asset.currency}
              quantityAt={quantityAt}
              unitBased={unitBased}
              onSubmit={(input) => createMut.mutate(input)}
              loading={createMut.isPending}
            />
          )}
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Valor de mercado</p>
            <p className="text-lg font-semibold">{money(current.value, current.currency)}</p>
            <p className="text-xs text-muted-foreground">
              {current.source === "valuation"
                ? `Valorização de ${asOfLabel}${isFuture ? " (data futura)" : ""}`
                : current.source === "cost"
                  ? "Custo da posição (sem valorização)"
                  : "Sem dados"}
            </p>
            {current.mode === "derived" && latest?.unitPrice != null && (
              <p className="text-xs text-muted-foreground">
                Derivada: {money(latest.unitPrice, current.currency)} ×{" "}
                {Number(refPosition.quantity.toFixed(8))} un.
              </p>
            )}
            {current.mode === "manual" && (
              <p className="text-xs text-muted-foreground">Valor manual (congelado)</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Custo da posição{asOfLabel ? ` a ${asOfLabel}` : ""}
            </p>
            <p className="text-lg font-semibold">{money(refPosition.costBasis, asset.currency)}</p>
            {refPosition.tracksQuantity && (
              <p className="text-xs text-muted-foreground">
                {Number(refPosition.quantity.toFixed(8))} un. · custo médio{" "}
                {money(refPosition.averageCost, asset.currency)}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mais-valia não realizada</p>
            <p className="text-lg font-semibold">
              {gain == null ? "—" : money(gain, current.currency)}
            </p>
            {latest?.unitPrice != null && (
              <p className="text-xs text-muted-foreground">
                {spec.label}: {money(latest.unitPrice, latest.currency)}
              </p>
            )}
          </div>
        </div>
        {asOfLabel && (
          <p className="text-xs text-muted-foreground">
            Métricas calculadas com a posição reconstruída a {asOfLabel}, não com a posição atual.
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : valuations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem valorizações registadas. O valor atual usa o custo da posição.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">{spec.label}</th>
                  <th className="py-2 pr-3">{spec.totalLabel}</th>
                  <th className="py-2 pr-3">Origem</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {valuations.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        {formatDateLabel(v.valuationDate)}
                        {latest?.id === v.id && <Badge variant="secondary">Atual</Badge>}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {v.unitPrice == null ? "—" : money(v.unitPrice, v.currency)}
                    </td>
                    <td className="py-2 pr-3">{money(v.totalValue, v.currency)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{v.source ?? "—"}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        <Dialog
                          open={editing?.id === v.id}
                          onOpenChange={(open) => setEditing(open ? v : null)}
                        >
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost">Editar</Button>
                          </DialogTrigger>
                          {editing?.id === v.id && (
                            <ValuationFormDialog
                              title="Editar valorização"
                              assetType={asset.type}
                              currency={asset.currency}
                              quantityAt={quantityAt}
                              unitBased={unitBased}
                              valuation={v}
                              onSubmit={(input) => updateMut.mutate({ id: v.id, input })}
                              loading={updateMut.isPending}
                            />
                          )}
                        </Dialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost">Eliminar</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminar valorização?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser revertida.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMut.mutate(v.id)}>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
