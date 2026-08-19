import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Asset, AssetType, Transaction } from "@/domain/types";
import { isUnitBased, ASSET_PROFILES } from "@/domain/asset-profiles";
import { listTransactions } from "@/repositories/transactions";
import { listValuations } from "@/repositories/valuations";
import { listByAssetIds } from "@/repositories/asset-provider-links";
import { useFxTable } from "@/hooks/use-fx-table";
import { portfolioPerformance } from "@/services/portfolio-performance";
import { formatCurrency, formatPercent } from "@/lib/number-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { BulkValuationDialog } from "@/components/performance/bulk-valuation-dialog";
import { NewTransactionDialog } from "@/components/transactions/new-transaction-dialog";
import {
  ProviderStatusDot,
  type ProviderLinkStatus,
} from "@/components/assets/provider-status-dot";
import { cn } from "@/lib/utils";


/**
 * Resumo agregado da carteira. Toda a lógica vive em
 * `src/services/portfolio-performance.ts`; aqui só há formatação e layout.
 */
export function PortfolioPerformanceSummary({
  assets,
  baseCurrency,
  loadingAssets,
}: {
  assets: Asset[];
  baseCurrency: string;
  loadingAssets?: boolean;
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

  const loading =
    !!loadingAssets ||
    loadingFx ||
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

  const assetIds = assets.map((a) => a.id);
  const { data: providerLinks } = useQuery({
    queryKey: ["asset-provider-links", assetIds],
    queryFn: () => listByAssetIds(assetIds),
    enabled: assetIds.length > 0,
  });
  const providerStatusByAssetId: Record<string, ProviderLinkStatus> = Object.fromEntries(
    assetIds.map((id) => {
      const rows = (providerLinks ?? []).filter((l) => l.assetId === id);
      const status: ProviderLinkStatus = rows.some((l) => l.status === "active")
        ? "active"
        : rows.some((l) => l.status === "not_found")
          ? "not_found"
          : "none";
      return [id, status];
    }),
  );

  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const transactionsByAssetId: Record<string, Transaction[]> = Object.fromEntries(
    assets.map((a, i) => [a.id, txQueries[i]?.data ?? []]),
  );


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Performance da carteira</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline">valores em {perf.currency}</Badge>
          <Dialog open={txOpen} onOpenChange={setTxOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                Nova transação
              </Button>
            </DialogTrigger>
            {txOpen && (
              <NewTransactionDialog
                open={txOpen}
                onOpenChange={setTxOpen}
                assets={assets}
                transactionsByAssetId={transactionsByAssetId}
                reportingCurrency={base}
                fxTable={fxTable}
                onCreated={() => undefined}
              />
            )}
          </Dialog>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                Atualizar valorizações
              </Button>
            </DialogTrigger>
            {bulkOpen && (
              <BulkValuationDialog
                assets={assets}
                transactionsByAssetId={transactionsByAssetId}
                onDone={() => {
                  for (const a of assets) {
                    qc.invalidateQueries({ queryKey: ["valuations", a.id] });
                  }
                  setBulkOpen(false);
                }}
              />
            )}
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">A calcular…</p>
        ) : perf.assetsWithTransactions === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Sem transações registadas nesta carteira — ainda não há performance a apresentar.
            </p>
            <AssetBreakdown perf={perf} assets={assets} />
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Capital investido"
                value={perf.investedCapital}
                currency={perf.currency}
                hint="Custo de aquisição das posições remanescentes"
              />
              <Metric
                label="Valor atual"
                value={perf.currentValue}
                currency={perf.currency}
                hint={
                  perf.assetsMissingValue > 0
                    ? `${perf.assetsMissingValue} ativo(s) sem valor observável`
                    : "Soma das valorizações mais recentes"
                }
              />
              <Metric
                label="Ganho total"
                value={perf.totalGain}
                currency={perf.currency}
                signed
                emphasis
                hint="Realizadas + não realizadas + rendimentos − custos"
              />
              <Metric
                label="Rentabilidade"
                percent={perf.returnPct}
                signed
                emphasis
                hint="Ganho total sobre o capital aplicado bruto"
              />
              <Metric
                label="Rentabilidade anualizada (XIRR)"
                percent={perf.xirr}
                signed
                emphasis
                hint={
                  perf.assetsExcludedFromXirr > 0
                    ? `${perf.assetsExcludedFromXirr} ativo(s) sem valorização impedem o cálculo`
                    : "Taxa anualizada sobre os fluxos combinados da carteira"
                }
              />
              {perf.fxEffect && (
                <Metric
                  label="Efeito cambial"
                  value={perf.fxEffect.total ?? perf.fxEffect.realized}
                  currency={perf.currency}
                  signed
                  hint={
                    perf.fxEffect.total == null
                      ? "Só sobre o realizado — falta valorização nalgum ativo multi-moeda"
                      : "Soma do efeito cambial de todos os ativos multi-moeda"
                  }
                />
              )}
            </div>

            <dl className="grid gap-3 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-3">
              <div>
                <dt>Capital aplicado bruto</dt>
                <dd className="text-foreground">
                  {formatCurrency(perf.grossContributions, perf.currency)}
                </dd>
              </div>
              <div>
                <dt>Rendimentos</dt>
                <dd className="text-foreground">{formatCurrency(perf.income, perf.currency)}</dd>
              </div>
              <div>
                <dt>Custos autónomos</dt>
                <dd className="text-foreground">
                  {formatCurrency(perf.autonomousCosts, perf.currency)}
                </dd>
              </div>
            </dl>

            <Notes perf={perf} />

            <AssetBreakdown perf={perf} assets={assets} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  percent,
  currency,
  hint,
  signed,
  emphasis,
}: {
  label: string;
  value?: number | null;
  percent?: number | null;
  currency?: string;
  hint?: string;
  signed?: boolean;
  emphasis?: boolean;
}) {
  const raw = percent !== undefined ? percent : value;
  const display =
    raw == null
      ? "—"
      : percent !== undefined
        ? formatPercent(percent!)
        : formatCurrency(value!, currency ?? "EUR");
  const tone =
    signed && raw != null && raw !== 0
      ? raw > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-destructive"
      : "";

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", emphasis && "text-xl", tone)}>
        {raw != null && signed && raw > 0 ? "+" : ""}
        {display}
      </p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Notes({ perf }: { perf: ReturnType<typeof portfolioPerformance> }) {
  const notes: string[] = [];
  if (perf.assetsWithoutValuation > 0) {
    notes.push(
      `${perf.assetsWithoutValuation} ativo(s) sem valorização: o total apresentado é parcial.`,
    );
  }
  if (perf.missingCurrencies.length > 0) {
    notes.push(
      `Sem taxa disponível para ${perf.missingCurrencies.join(", ")}: os totais em ${perf.currency} estão incompletos.`,
    );
  }
  if (perf.usedSettlement) {
    notes.push("Alguns eventos usaram o montante efetivamente liquidado pela corretora.");
  }
  if (perf.usedCarryForward) {
    notes.push("Alguma conversão usou a última taxa conhecida anterior à data do evento.");
  }
  if (perf.inconsistentTransactionIds.length > 0) {
    notes.push(
      `${perf.inconsistentTransactionIds.length} transação(ões) com dados incoerentes foram tratadas apenas em custo.`,
    );
  }
  if (perf.xirr == null && perf.assetsExcludedFromXirr === 0 && perf.assetsWithTransactions > 0) {
    notes.push("XIRR indisponível para este conjunto de fluxos (sem solução matemática).");
  }
  notes.push("Rentabilidade simples, não anualizada, sobre os totais agregados da carteira.");

  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

type PerAsset = ReturnType<typeof portfolioPerformance>["perAsset"][number];

interface TypeGroup {
  type: AssetType;
  label: string;
  rows: { asset: Asset; perf: PerAsset["performance"] }[];
  investedCapital: number;
  currentValue: number | null;
  totalGain: number | null;
  returnPct: number | null;
}

function buildGroups(
  perAsset: PerAsset[],
  assets: Asset[],
  ): TypeGroup[] {
  const byType = new Map<AssetType, { asset: Asset; perf: PerAsset["performance"] }[]>();

  for (const entry of perAsset) {
    const asset = assets.find((a) => a.id === entry.assetId);
    if (!asset) continue;
    const p = entry.performance;
    if (p.reported.investedCapital === 0 && p.quantity === 0) continue;
    const list = byType.get(asset.type) ?? [];
    list.push({ asset, perf: p });
    byType.set(asset.type, list);
  }

  const groups: TypeGroup[] = [];
  for (const [type, rows] of byType) {
    let investedCapital = 0;
    let gross = 0;
    let currentValue: number | null = null;
    let totalGain: number | null = null;

    for (const { perf } of rows) {
      investedCapital += perf.reported.investedCapital;
      gross += perf.reported.grossContributions;
      if (perf.reported.currentValue != null) {
        currentValue = (currentValue ?? 0) + perf.reported.currentValue;
      }
      if (perf.reported.totalGain != null) {
        totalGain = (totalGain ?? 0) + perf.reported.totalGain;
      }
    }

    rows.sort((a, b) => (b.perf.reported.currentValue ?? 0) - (a.perf.reported.currentValue ?? 0));

    groups.push({
      type,
      label: ASSET_PROFILES[type]?.label ?? type,
      rows,
      investedCapital,
      currentValue,
      totalGain,
      returnPct: totalGain == null || gross <= 0 ? null : totalGain / gross,
    });
  }

  groups.sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
  return groups;
}

function signedTone(value: number | null | undefined) {
  if (value == null || value === 0) return "";
  return value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
}

function AssetBreakdown({
  perf,
  assets,
  providerStatusByAssetId,
}: {
  perf: ReturnType<typeof portfolioPerformance>;
  assets: Asset[];
  providerStatusByAssetId: Record<string, ProviderLinkStatus>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = buildGroups(perf.perAsset, assets);
  const grouped = new Set(groups.flatMap((g) => g.rows.map((r) => r.asset.id)));
  const idleAssets = assets
    .filter((a) => !grouped.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (groups.length === 0 && idleAssets.length === 0) return null;

  const currency = perf.currency;

  return (
    <div className="space-y-2 border-t pt-3">
      {groups.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground">Detalhe por tipo de ativo</p>
      )}
      {groups.map((g) => {
        const open = !!expanded[g.type];
        return (
          <div key={g.type} className="rounded-lg border">
            <button
              type="button"
              onClick={() => setExpanded((s) => ({ ...s, [g.type]: !s[g.type] }))}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-3 py-2 text-left"
            >
              <ChevronRight
                className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")}
              />
              <span className="flex-1 text-sm font-medium">
                {g.label}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({g.rows.length})
                </span>
              </span>
              <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                {formatCurrency(g.investedCapital, currency)}
              </span>
              <span className="text-xs tabular-nums">
                {g.currentValue == null ? "—" : formatCurrency(g.currentValue, currency)}
              </span>
              <span className={cn("text-xs tabular-nums", signedTone(g.totalGain))}>
                {g.totalGain == null ? "—" : formatCurrency(g.totalGain, currency)}
              </span>
              <span className={cn("text-xs tabular-nums", signedTone(g.returnPct))}>
                {g.returnPct == null ? "—" : formatPercent(g.returnPct)}
              </span>
            </button>

            {open && (
              <div className="overflow-x-auto border-t">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-normal">Ativo</th>
                      <th className="px-3 py-2 text-right font-normal">Capital investido</th>
                      <th className="px-3 py-2 text-right font-normal">Valor atual</th>
                      <th className="px-3 py-2 text-right font-normal">Ganho total</th>
                      <th className="px-3 py-2 text-right font-normal">Rentabilidade</th>
                      <th className="px-3 py-2 text-right font-normal">XIRR</th>
                      <th className="px-3 py-2 text-right font-normal">Efeito cambial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map(({ asset, perf: p }) => {
                      const fx = p.fxEffect?.total ?? p.fxEffect?.realized ?? null;
                      return (
                        <tr key={asset.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <Link
                              to="/app/asset/$assetId"
                              params={{ assetId: asset.id }}
                              className="hover:underline"
                            >
                              {asset.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(p.reported.investedCapital, currency)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {p.reported.currentValue == null
                              ? "—"
                              : formatCurrency(p.reported.currentValue, currency)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              signedTone(p.reported.totalGain),
                            )}
                          >
                            {p.reported.totalGain == null
                              ? "—"
                              : formatCurrency(p.reported.totalGain, currency)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              signedTone(p.reported.returnPct),
                            )}
                          >
                            {p.reported.returnPct == null
                              ? "—"
                              : formatPercent(p.reported.returnPct)}
                          </td>
                          <td
                            className={cn("px-3 py-2 text-right tabular-nums", signedTone(p.xirr))}
                          >
                            {p.xirr == null ? "—" : formatPercent(p.xirr)}
                          </td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", signedTone(fx))}>
                            {fx == null ? "—" : formatCurrency(fx, currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {idleAssets.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-muted-foreground">Ativos sem transações</p>
          <ul className="divide-y rounded-lg border">
            {idleAssets.map((asset) => (
              <li key={asset.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex items-center gap-2">
                  <ProviderStatusDot
                    isin={asset.isin}
                    linkStatus={providerStatusByAssetId[asset.id] ?? "none"}
                  />
                  <Link
                    to="/app/asset/$assetId"
                    params={{ assetId: asset.id }}
                    className="text-sm hover:underline"
                  >
                    {asset.name}
                  </Link>
                </span>

                <Badge variant="secondary">
                  {ASSET_PROFILES[asset.type]?.label ?? asset.type}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
