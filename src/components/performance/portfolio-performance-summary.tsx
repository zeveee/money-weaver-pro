import { useQueries } from "@tanstack/react-query";
import type { Asset } from "@/domain/types";
import { isUnitBased } from "@/domain/asset-profiles";
import { listTransactions } from "@/repositories/transactions";
import { listValuations } from "@/repositories/valuations";
import { useFxTable } from "@/hooks/use-fx-table";
import { portfolioPerformance } from "@/services/portfolio-performance";
import { formatCurrency, formatPercent } from "@/lib/number-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Performance da carteira</CardTitle>
        <Badge variant="outline">valores em {perf.currency}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">A calcular…</p>
        ) : perf.assetsWithTransactions === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem transações registadas nesta carteira — ainda não há performance a apresentar.
          </p>
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
