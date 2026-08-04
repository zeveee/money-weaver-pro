import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAsset } from "@/repositories/assets";
import { getPortfolio } from "@/repositories/portfolios";
import { getAssetFields, getAssetProfile } from "@/domain/asset-profiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { TransactionsSection } from "@/components/transactions/transactions-section";
import { RecurringSection } from "@/components/recurring/recurring-section";
import { listTransactions } from "@/repositories/transactions";
import { formatDateLabel } from "@/lib/date-format";


export const Route = createFileRoute("/_authenticated/app/asset/$assetId")({
  component: AssetDetailPage,
});

const getPath = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined),
    obj,
  );

function AssetDetailPage() {
  const { assetId } = Route.useParams();

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId),
  });
  const { data: portfolio } = useQuery({
    queryKey: ["portfolio", asset?.portfolioId],
    queryFn: () => getPortfolio(asset!.portfolioId),
    enabled: !!asset?.portfolioId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", assetId],
    queryFn: () => listTransactions(assetId),
    enabled: !!assetId,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (!asset) return <p className="text-sm text-muted-foreground">Ativo não encontrado.</p>;

  const profile = getAssetProfile(asset.type);
  const fields = getAssetFields(asset.type).filter((f) => f.key !== "name");

  const acquiredAt = transactions
    .filter((t) => ["buy", "deposit", "transfer_in"].includes(t.type))
    .map((t) => t.occurredAt)
    .sort()[0];

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-foreground">Grupos</Link>
        <ChevronRight className="h-3 w-3" />
        <Link
          to="/app/portfolio/$portfolioId"
          params={{ portfolioId: asset.portfolioId }}
          className="hover:text-foreground"
        >
          {portfolio?.name ?? "Carteira"}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{asset.name}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{asset.name}</h1>
        <Badge variant="secondary">{profile.label}</Badge>
        <Badge variant="outline">{asset.currency}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{profile.purpose}</p>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhes</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => {
              const value =
                f.target === "column"
                  ? (asset as unknown as Record<string, unknown>)[f.key]
                  : getPath(asset.metadata, f.key);
              const display =
                value === null || value === undefined || value === ""
                  ? "—"
                  : typeof value === "boolean"
                    ? value ? "Sim" : "Não"
                    : String(value);
              return (
                <div key={f.key}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="text-sm">{display}</dd>
                </div>
              );
            })}
            <div>
              <dt className="text-xs text-muted-foreground">Data de aquisição (derivada)</dt>
              <dd className="text-sm">
                {acquiredAt ? formatDateLabel(acquiredAt) : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            A data de aquisição é calculada a partir da primeira transação de entrada do ativo.
          </p>
        </CardContent>
      </Card>

      <TransactionsSection asset={asset} />

      <RecurringSection asset={asset} />

      {profile.futureTransactionTypes && (
        <p className="text-xs text-muted-foreground">
          Extensões futuras de transações: {profile.futureTransactionTypes.join(", ")}
        </p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Valorações</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {profile.supportsValuations
            ? "Estado atual do ativo virá da última valoração registada. Ainda por implementar."
            : "Este tipo de ativo não usa valorações."}
        </CardContent>
      </Card>

    </div>
  );
}
