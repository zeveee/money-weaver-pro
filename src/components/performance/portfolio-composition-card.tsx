import { useQueries, useQuery } from "@tanstack/react-query";
import type { AllocationType, Asset } from "@/domain/types";
import { isUnitBased } from "@/domain/asset-profiles";
import { listTransactions } from "@/repositories/transactions";
import { listValuations } from "@/repositories/valuations";
import { listAllocationsForAssets } from "@/repositories/allocations";
import { useFxTable } from "@/hooks/use-fx-table";
import { portfolioPerformance } from "@/services/portfolio-performance";
import { portfolioComposition } from "@/services/portfolio-composition";
import { formatCurrency, formatPercent } from "@/lib/number-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Dimensões apresentadas e respetivos rótulos em português. */
const DIMENSIONS: { key: AllocationType; label: string }[] = [
  { key: "sector", label: "Setor" },
  { key: "geography", label: "Geografia" },
];

export function PortfolioCompositionCard({
  assets,
  baseCurrency,
}: {
  assets: Asset[];
  baseCurrency: string;
}) {
  const base = (baseCurrency || "EUR").toUpperCase();
  const nativeCurrencies = [...new Set(assets.map((a) => a.currency.toUpperCase()))];
  const showFx = nativeCurrencies.some((c) => c !== base);

  const txQueries = useQueries({
    queries: assets.map((a) => ({
      queryKey: ["transactions", a.id],
      queryFn: () => listTransactions(a.id),
    })),
  });
  const valQueries = useQueries({
    queries: assets.map((a) => ({
      queryKey: ["valuations", a.id],
      queryFn: () => listValuations(a.id),
    })),
  });
  const { table: fxTable, isLoading: loadingFx } = useFxTable(nativeCurrencies, {
    enabled: showFx,
  });

  const assetIds = assets.map((a) => a.id);
  const { data: allocations = [], isLoading: loadingAlloc } = useQuery({
    queryKey: ["asset_allocations", assetIds],
    queryFn: () => listAllocationsForAssets(assetIds),
    enabled: assetIds.length > 0,
  });

  const loading =
    loadingFx ||
    loadingAlloc ||
    txQueries.some((q) => q.isLoading) ||
    valQueries.some((q) => q.isLoading);

  const perf = portfolioPerformance({
    baseCurrency: base,
    fxTable,
    assets: assets.map((a, i) => ({
      assetId: a.id,
      assetType: a.type,
      nativeCurrency: a.currency,
      transactions: txQueries[i]?.data ?? [],
      valuations: valQueries[i]?.data ?? [],
      unitBased: isUnitBased(a.type, a.metadata),
    })),
  });

  const currentValueByAsset: Record<string, number | null> = Object.fromEntries(
    perf.perAsset.map((p) => [p.assetId, p.performance.reported.currentValue ?? null]),
  );

  const composition = portfolioComposition({
    currentValueByAsset,
    allocations,
    dimensions: DIMENSIONS.map((d) => d.key),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Composição da carteira</CardTitle>
        <Badge variant="outline">valores em {base}</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">A calcular…</p>
        ) : (
          DIMENSIONS.map(({ key, label }) => {
            const slices = composition[key] ?? [];
            return (
              <section key={key} className="space-y-2">
                <h3 className="text-sm font-medium">{label}</h3>
                {slices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sem valor observável nesta carteira.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {slices.map((s) => (
                      <li key={s.allocationName} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span
                            className={cn(
                              s.isUnclassified && "text-muted-foreground italic",
                            )}
                          >
                            {s.allocationName}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(s.value, base)} ·{" "}
                            {formatPercent(s.percentage / 100)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              s.isUnclassified
                                ? "border border-dashed border-muted-foreground/60 bg-muted-foreground/20"
                                : "bg-primary",
                            )}
                            style={{
                              width: `${Math.max(0, Math.min(100, s.percentage))}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
