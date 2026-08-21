/**
 * IvestWise :: Composição do ativo (holdings + distribuição)
 *
 * Fonte dos dados:
 *  - Holdings → server function `getAssetHoldings`, que usa o registry de
 *    holdings providers (`src/server/holdings/*`). Genérico por emissor:
 *    nenhum ticker está hardcoded aqui.
 *  - Setor / Geografia → `asset_allocations` (a MESMA fonte que alimenta o
 *    cartão "Composição da carteira"), através do serviço puro
 *    `portfolioComposition`.
 *
 * LIMITAÇÃO CONHECIDA (fase seguinte): os providers de holdings devolvem
 * `cusip`/`holdingTicker`, mas NÃO devolvem setor nem país por holding, e o
 * projeto ainda não tem matching CUSIP/SEDOL → ISIN → ativo classificado.
 * Por isso a distribuição só é calculada a partir das classificações
 * manuais do próprio ativo; sem elas mostramos "não disponível" em vez de
 * inventar valores.
 */

import { useQuery } from "@tanstack/react-query";
import type { AllocationType, Asset } from "@/domain/types";
import { getAssetHoldings } from "@/lib/holdings.functions";
import { getAssetHoldingMatches } from "@/lib/securities.functions";
import type { HoldingMatch } from "@/server/securities/types";
import { listAllocationsForAssets } from "@/repositories/allocations";
import { portfolioComposition } from "@/services/portfolio-composition";
import { formatPercent } from "@/lib/number-format";
import { formatDateLabel } from "@/lib/date-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DIMENSIONS: { key: AllocationType; label: string }[] = [
  { key: "sector", label: "Setor" },
  { key: "geography", label: "Geografia" },
];

function DistributionList({
  asset,
  dimension,
}: {
  asset: Asset;
  dimension: AllocationType;
}) {
  const { data: allocations = [], isLoading } = useQuery({
    queryKey: ["asset_allocations", [asset.id]],
    queryFn: () => listAllocationsForAssets([asset.id]),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  const hasClassification = allocations.some((a) => a.allocationType === dimension);
  if (!hasClassification) {
    return (
      <p className="text-sm text-muted-foreground">
        Distribuição não disponível: as holdings desta fonte não incluem classificação e o
        ativo não tem classificações manuais nesta dimensão.
      </p>
    );
  }

  // Reutiliza o serviço puro usado pela página da carteira (base 100 = o ativo).
  const slices = portfolioComposition({
    currentValueByAsset: { [asset.id]: 100 },
    allocations,
    dimensions: [dimension],
  })[dimension];

  return (
    <ul className="space-y-2">
      {slices.map((s) => (
        <li key={s.allocationName} className="flex items-center justify-between gap-4 text-sm">
          <span className={s.isUnclassified ? "text-muted-foreground" : undefined}>
            {s.allocationName}
          </span>
          <span className="tabular-nums">{formatPercent(s.percentage / 100)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Estado da identificação de uma holding contra o Security Master global. */
function MatchBadge({ match, loading }: { match?: HoldingMatch; loading: boolean }) {
  if (!match || match.status === "pending") {
    return (
      <span className="text-xs text-muted-foreground">
        {loading || match?.status === "pending" ? "A identificar…" : "—"}
      </span>
    );
  }
  if (match.status === "identified") {
    return (
      <Badge variant="secondary" title={match.security?.name ?? undefined}>
        Identificada
      </Badge>
    );
  }
  if (match.status === "ambiguous") {
    return (
      <Badge variant="outline" title={match.message ?? undefined}>
        Ambígua
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground" title={match.message ?? undefined}>
      Não identificada
    </Badge>
  );
}

export function AssetCompositionSection({ asset }: { asset: Asset }) {
  const { data, isLoading } = useQuery({
    queryKey: ["asset-holdings", asset.id],
    queryFn: () => getAssetHoldings({ data: { assetId: asset.id } }),
    staleTime: 5 * 60 * 1000,
  });

  // Identificação das holdings (Security Master + OpenFIGI), em segundo plano.
  // Cada passagem tem orçamento de tempo: enquanto houver pendentes e houver
  // progresso, voltamos a pedir — a passagem seguinte arranca do Security
  // Master, sem repetir chamadas externas.
  const {
    data: matchData,
    isLoading: matching,
    isFetching: matchFetching,
    isError: matchFailed,
    error: matchError,
    refetch: refetchMatches,
  } = useQuery({
    queryKey: ["asset-holding-matches", asset.id],
    queryFn: () => getAssetHoldingMatches({ data: { assetId: asset.id } }),
    enabled: data?.status === "ok",
    staleTime: 30 * 60 * 1000,
    retry: false,
    refetchInterval: (q) => {
      const r = q.state.data;
      // Só continuamos enquanto houver pendentes E não houver erro da fonte.
      return r && r.status === "ok" && r.pendingIdentifiers > 0 && !r.error ? 1_000 : false;
    },
  });

  const matchesByKey =
    matchData?.status === "ok"
      ? new Map(matchData.matches.map((m) => [m.holdingKey, m]))
      : undefined;
  const matchProblem =
    matchFailed
      ? ((matchError as Error | null)?.message ?? "Falha ao contactar o servidor.")
      : matchData && matchData.status !== "ok"
        ? matchData.message
        : matchData?.status === "ok" && matchData.error
          ? matchData.error
          : null;


  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composição do ativo</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">A carregar…</CardContent>
      </Card>
    );
  }

  if (!data || data.status !== "ok") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composição do ativo</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Composição não disponível para este ativo.
        </CardContent>
      </Card>
    );
  }

  const snap = data.snapshot;
  const totalWeight = snap.holdings.reduce((s, h) => s + (h.weightPercent ?? 0), 0);
  const coverageLabel =
    snap.coverage === "full"
      ? "Composição completa"
      : snap.coverage === "partial"
        ? `Composição parcial — ${snap.holdings.length} holdings${
            snap.totalHoldingsCount ? ` de ${snap.totalHoldingsCount}` : ""
          }`
        : `Cobertura desconhecida — ${snap.holdings.length} holdings disponíveis`;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Composição do ativo</CardTitle>
          <Badge variant={snap.coverage === "full" ? "secondary" : "outline"}>
            {coverageLabel}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {snap.holdings.length} posições · a {formatDateLabel(snap.asOfDate)} · pesos somam{" "}
          {formatPercent(totalWeight / 100)} · fonte:{" "}
          <a
            href={snap.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            {snap.sourceProvider}
          </a>
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="holdings">
          <TabsList>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            {DIMENSIONS.map((d) => (
              <TabsTrigger key={d.key} value={d.key}>
                {d.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="holdings" className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Holding</th>
                    <th className="py-2 text-left font-medium">Ticker</th>
                    <th className="py-2 text-right font-medium">Peso</th>
                    <th className="py-2 pl-3 text-left font-medium">Identificação</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.holdings.map((h, i) => (
                    <tr key={`${h.holdingName}-${i}`} className="border-b last:border-0">
                      <td className="py-2 pr-3">{h.holdingName}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {h.holdingTicker ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {h.weightPercent == null ? "—" : formatPercent(h.weightPercent / 100)}
                      </td>
                      <td className="py-2 pl-3">
                        <MatchBadge
                          match={matchesByKey?.get(holdingKeyOf(h))}
                          loading={matching || matchFetching}
                        />
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {DIMENSIONS.map((d) => (
            <TabsContent key={d.key} value={d.key} className="mt-4">
              <DistributionList asset={asset} dimension={d.key} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
