import { useQuery } from "@tanstack/react-query";
import type { Asset } from "@/domain/types";
import { isUnitBased } from "@/domain/asset-profiles";
import { listTransactions } from "@/repositories/transactions";
import { listValuations } from "@/repositories/valuations";
import { useFxTable } from "@/hooks/use-fx-table";
import { assetPerformance, type PerformancePlane } from "@/services/performance";
import { formatCurrency, formatPercent } from "@/lib/number-format";
import { formatDateLabel } from "@/lib/date-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Apresentação das métricas de performance. Toda a lógica vive em
 * `src/services/performance.ts`; aqui só há formatação e layout.
 */
export function PerformanceSection({
  asset,
  reportingCurrency,
}: {
  asset: Asset;
  reportingCurrency?: string | null;
}) {
  const unitBased = isUnitBased(asset.type, asset.metadata);
  const reporting = (reportingCurrency ?? "").toUpperCase() || asset.currency.toUpperCase();
  const showFx = reporting !== asset.currency.toUpperCase();

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["transactions", asset.id],
    queryFn: () => listTransactions(asset.id),
  });
  const { data: valuations = [], isLoading: loadingVal } = useQuery({
    queryKey: ["valuations", asset.id],
    queryFn: () => listValuations(asset.id),
  });
  const { table: fxTable } = useFxTable([asset.currency], { enabled: showFx });

  const perf = assetPerformance({
    assetType: asset.type,
    transactions,
    valuations,
    nativeCurrency: asset.currency,
    reportingCurrency: reporting,
    fxTable,
    unitBased,
  });

  const r = perf.reported;
  const n = perf.native;
  const nativeNote = (value: number | null) =>
    perf.isMultiCurrency && value != null ? formatCurrency(value, n.currency) : null;

  const loading = loadingTx || loadingVal;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Performance</CardTitle>
        <Badge variant="outline">valores em {r.currency}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">A calcular…</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem transações registadas — ainda não há performance a apresentar.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Metric
                label="Capital investido"
                value={r.investedCapital}
                currency={r.currency}
                note={nativeNote(n.investedCapital)}
                hint="Custo de aquisição da posição remanescente"
              />
              <Metric
                label="Valor atual"
                value={r.currentValue}
                currency={r.currency}
                note={nativeNote(n.currentValue)}
                hint={
                  perf.valueSource === "valuation"
                    ? `Valorização de ${formatDateLabel(perf.valueAsOf!)}`
                    : "Sem valorização: assume o custo da posição"
                }
              />
              <Metric
                label="Mais-valias realizadas"
                value={r.realizedGain}
                currency={r.currency}
                note={nativeNote(n.realizedGain)}
                signed
                hint="Alienações ao custo médio vigente"
              />
              <Metric
                label="Mais-valias não realizadas"
                value={r.unrealizedGain}
                currency={r.currency}
                note={nativeNote(n.unrealizedGain)}
                signed
                hint="Valor atual − capital investido à data da valorização"
              />
              <Metric
                label="Ganho total"
                value={r.totalGain}
                currency={r.currency}
                note={nativeNote(n.totalGain)}
                signed
                emphasis
                hint="Realizadas + não realizadas + rendimentos − custos"
              />
              <Metric
                label="Rentabilidade"
                percent={r.returnPct}
                signed
                emphasis
                hint="Ganho total sobre o capital aplicado bruto"
              />
              <Metric
                label="Rentabilidade anualizada (XIRR)"
                percent={perf.xirr}
                signed
                emphasis
                hint="Taxa anualizada sobre os fluxos de caixa datados"
              />
              {perf.fxEffect && (
                <Metric
                  label="Efeito cambial"
                  value={perf.fxEffect.total ?? perf.fxEffect.realized}
                  currency={r.currency}
                  signed
                  hint={
                    perf.fxEffect.total == null
                      ? "Só sobre o realizado — sem valorização para isolar o não realizado"
                      : "Parte do ganho que resulta só da variação cambial, não do ativo"
                  }
                />
              )}
            </div>

            <dl className="grid gap-3 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-3">
              <div>
                <dt>Capital aplicado bruto</dt>
                <dd className="text-foreground">
                  {formatCurrency(r.grossContributions, r.currency)}
                </dd>
              </div>
              <div>
                <dt>Rendimentos</dt>
                <dd className="text-foreground">{formatCurrency(r.income, r.currency)}</dd>
              </div>
              <div>
                <dt>Custos autónomos</dt>
                <dd className="text-foreground">
                  {formatCurrency(r.autonomousCosts, r.currency)}
                </dd>
              </div>
            </dl>

            <Notes perf={perf} plane={r} />
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
  note,
  hint,
  signed,
  emphasis,
}: {
  label: string;
  value?: number | null;
  percent?: number | null;
  currency?: string;
  note?: string | null;
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
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Notes({
  perf,
  plane,
}: {
  perf: ReturnType<typeof assetPerformance>;
  plane: PerformancePlane;
}) {
  const notes: string[] = [];
  if (perf.isMultiCurrency) {
    notes.push(
      `Cada evento é convertido de ${perf.native.currency} para ${plane.currency} à taxa da sua data; o valor atual usa a taxa mais recente disponível.`,
    );
  }
  if (perf.usedSettlement) {
    notes.push("Alguns eventos usaram o montante efetivamente liquidado pela corretora.");
  }
  if (perf.usedCarryForward) {
    notes.push("Alguma conversão usou a última taxa conhecida anterior à data do evento.");
  }
  if (perf.missingCurrencies.length > 0) {
    notes.push(
      `Sem taxa disponível para ${perf.missingCurrencies.join(", ")}: os totais em ${plane.currency} estão incompletos.`,
    );
  }
  if (perf.inconsistentTransactionIds.length > 0) {
    notes.push(
      `${perf.inconsistentTransactionIds.length} transação(ões) com dados incoerentes foram tratadas apenas em custo.`,
    );
  }
  if (perf.xirr == null && perf.valueSource !== "none") {
    notes.push(
      perf.valueSource === "cost"
        ? "XIRR indisponível: sem valorização observada para a posição em aberto."
        : "XIRR indisponível para este conjunto de fluxos (dados incompletos ou sem solução matemática).",
    );
  }
  notes.push(
    "Rentabilidade simples: ganho total sobre o capital aplicado bruto, não anualizada. TWR fica para uma fase seguinte.",
  );

  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}
