import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AssetType, AssetValuation } from "@/domain/types";
import { getValuationSpec } from "@/domain/asset-profiles";
import type { ValuationWriteInput } from "@/repositories/valuations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const today = () => new Date().toISOString().slice(0, 10);

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

export function ValuationFormDialog({
  title, assetType, currency, quantityAt, unitBased = false, valuation, onSubmit, loading,
}: {
  title: string;
  assetType: AssetType;
  currency: string;
  /** Quantidade derivada das transações à data indicada (modo unit_price). */
  quantityAt: (date: string) => number;
  /** Produto baseado em Unidades de Participação (Unit Linked). */
  unitBased?: boolean;
  valuation?: AssetValuation;
  onSubmit: (input: ValuationWriteInput) => void;
  loading: boolean;
}) {
  const spec = getValuationSpec(assetType, { unitBased });
  const derivable = spec.mode === "unit_price";
  const [valuationDate, setValuationDate] = useState(valuation?.valuationDate ?? today());
  const [unitPrice, setUnitPrice] = useState(
    valuation?.unitPrice != null ? String(valuation.unitPrice) : "",
  );
  const [totalValue, setTotalValue] = useState(
    valuation ? String(valuation.totalValue) : "",
  );
  // O modo manual NUNCA é inferido da presença de NAV: só o estado persistido
  // `isManual` (ou a inexistência de modo derivado) o pode ativar.
  const [manual, setManual] = useState(
    derivable ? Boolean(valuation?.isManual) : true,
  );
  const [source, setSource] = useState(valuation?.source ?? "");

  /** Quantidade detida à data da valorização (posição reconstruída cronologicamente). */
  const quantity = useMemo(
    () => (valuationDate ? quantityAt(valuationDate) : 0),
    [quantityAt, valuationDate],
  );

  const derivedTotal = useMemo(() => {
    const p = Number(unitPrice);
    if (!Number.isFinite(p) || unitPrice === "") return null;
    return p * quantity;
  }, [unitPrice, quantity]);

  const effectiveTotal = manual ? Number(totalValue) : (derivedTotal ?? 0);

  const submit = () => {
    if (!valuationDate) return toast.error("Data é obrigatória");
    if (!manual && unitPrice === "") return toast.error(`${spec.label} é obrigatório`);
    if (!Number.isFinite(effectiveTotal) || effectiveTotal < 0)
      return toast.error("Valor total inválido");

    onSubmit({
      valuationDate,
      unitPrice: derivable && unitPrice !== "" ? Number(unitPrice) : null,
      totalValue: effectiveTotal,
      currency,
      source: source.trim() || null,
      isManual: manual,
    });
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Facto observado de valor numa data. Não substitui transações.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="val-date">Data da valorização</Label>
          <Input
            id="val-date"
            type="date"
            value={valuationDate}
            onChange={(e) => setValuationDate(e.target.value)}
          />
        </div>

        {derivable ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="val-unit">{spec.label} ({currency})</Label>
              <Input
                id="val-unit"
                type="number"
                step="any"
                min={0}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                disabled={manual}
              />
              <p className="text-xs text-muted-foreground">
                Quantidade detida a {valuationDate}: {Number(quantity.toFixed(8))}
                {derivedTotal != null && (
                  <> → {spec.totalLabel}: {money(derivedTotal, currency)}</>
                )}
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <input
                  id="val-override"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={manual}
                  onChange={(e) => {
                    setManual(e.target.checked);
                    if (e.target.checked && totalValue === "" && derivedTotal != null) {
                      setTotalValue(String(derivedTotal));
                    }
                  }}
                />
                <Label htmlFor="val-override" className="text-sm font-normal">
                  Definir {spec.totalLabel.toLowerCase()} manualmente
                </Label>
              </div>
              {manual ? (
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={totalValue}
                  onChange={(e) => setTotalValue(e.target.value)}
                  placeholder={spec.totalLabel}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Valorização <strong>derivada</strong>: o {spec.totalLabel.toLowerCase()} é sempre
                  recalculado como {spec.label.toLowerCase()} × quantidade à data, acompanhando
                  alterações às transações. Marque a opção acima para congelar um valor manual.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="val-total">{spec.label} ({currency})</Label>
            <Input
              id="val-total"
              type="number"
              step="any"
              min={0}
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value)}
            />
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="val-source">Origem (opcional)</Label>
          <Input
            id="val-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="manual, corretora, avaliação…"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Valor registado em {currency}. A conversão cambial será aplicada apenas na leitura,
          quando existirem taxas de câmbio.
        </p>
      </div>

      <DialogFooter>
        <Button onClick={submit} disabled={loading}>
          {loading ? "A guardar…" : "Guardar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
