import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Asset, Transaction } from "@/domain/types";
import { getAssetProfile, getValuationSpec, isUnitBased } from "@/domain/asset-profiles";
import { availableQuantityAt } from "@/services/position-engine";
import { createValuation } from "@/repositories/valuations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency as money, formatQuantity } from "@/lib/number-format";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Valorização em lote: uma data comum, uma linha por ativo.
 * Linhas em branco são ignoradas. Reutiliza integralmente
 * `createValuation` e as specs declarativas por AssetType.
 */
export function BulkValuationDialog({
  assets,
  transactionsByAssetId,
  onDone,
}: {
  assets: Asset[];
  transactionsByAssetId: Record<string, Transaction[]>;
  onDone: () => void;
}) {
  const [valuationDate, setValuationDate] = useState(today());
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () =>
      assets
        .filter((a) => getAssetProfile(a.type).supportsValuations)
        .map((a) => {
          const unitBased = isUnitBased(a.type, a.metadata);
          const spec = getValuationSpec(a.type, { unitBased });
          const quantity =
            spec.mode === "unit_price"
              ? availableQuantityAt(a.type, transactionsByAssetId[a.id] ?? [], valuationDate, {
                  unitBased,
                })
              : 0;
          return { asset: a, spec, quantity };
        }),
    [assets, transactionsByAssetId, valuationDate],
  );

  const filledIds = rows
    .map((r) => r.asset.id)
    .filter((id) => {
      const raw = values[id];
      return raw != null && raw !== "" && Number.isFinite(Number(raw));
    });

  const submit = async () => {
    if (!valuationDate) return toast.error("Data é obrigatória");
    if (filledIds.length === 0) return;

    setSaving(true);
    const targets = rows.filter((r) => filledIds.includes(r.asset.id));
    const results = await Promise.allSettled(
      targets.map((r) => {
        const n = Number(values[r.asset.id]);
        const isUnit = r.spec.mode === "unit_price";
        return createValuation({
          assetId: r.asset.id,
          valuationDate,
          unitPrice: isUnit ? n : null,
          totalValue: isUnit ? n * r.quantity : n,
          currency: r.asset.currency,
          source: "Atualização em lote",
          isManual: !isUnit,
        });
      }),
    );

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    if (ok > 0) toast.success(`${ok} valorização(ões) guardada(s)`);
    if (failed > 0) toast.error(`${failed} valorização(ões) falharam`);
    setSaving(false);
    onDone();
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Atualizar valorizações</DialogTitle>
        <DialogDescription>
          Uma data comum para todos os ativos. Deixe em branco os que não quiser valorizar.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="bulk-val-date">Data da valorização</Label>
          <Input
            id="bulk-val-date"
            type="date"
            value={valuationDate}
            onChange={(e) => setValuationDate(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          {rows.map(({ asset, spec, quantity }) => {
            const raw = values[asset.id] ?? "";
            const n = Number(raw);
            const derived =
              spec.mode === "unit_price" && raw !== "" && Number.isFinite(n) ? n * quantity : null;
            return (
              <div key={asset.id} className="grid gap-1 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{asset.name}</p>
                  <span className="text-xs text-muted-foreground">{asset.currency}</span>
                </div>
                <Label htmlFor={`bulk-val-${asset.id}`} className="text-xs font-normal text-muted-foreground">
                  {spec.label}
                </Label>
                <Input
                  id={`bulk-val-${asset.id}`}
                  type="number"
                  step="any"
                  min={0}
                  value={raw}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [asset.id]: e.target.value }))
                  }
                />
                {spec.mode === "unit_price" && (
                  <p className="text-xs text-muted-foreground">
                    Quantidade detida a {valuationDate}: {formatQuantity(quantity)}
                    {derived != null && (
                      <>
                        {" "}
                        → {spec.totalLabel}: {money(derived, asset.currency)}
                      </>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {filledIds.length} de {rows.length} ativos preenchidos.
        </p>
      </div>

      <DialogFooter>
        <Button onClick={submit} disabled={saving || filledIds.length === 0}>
          {saving ? "A guardar…" : "Guardar valorizações"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
