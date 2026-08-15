import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getPortfolio } from "@/repositories/portfolios";
import { getPortfolioGroup } from "@/repositories/portfolio-groups";
import { listAssets, createAsset, type AssetWriteInput } from "@/repositories/assets";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { ChevronRight } from "lucide-react";
import { PortfolioPerformanceSummary } from "@/components/performance/portfolio-performance-summary";
import { PortfolioCompositionCard } from "@/components/performance/portfolio-composition-card";


export const Route = createFileRoute("/_authenticated/app/portfolio/$portfolioId")({
  component: PortfolioDetailPage,
});

function PortfolioDetailPage() {
  const { portfolioId } = Route.useParams();
  const qc = useQueryClient();

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => getPortfolio(portfolioId),
  });
  const { data: group } = useQuery({
    queryKey: ["portfolio_group", portfolio?.groupId],
    queryFn: () => getPortfolioGroup(portfolio!.groupId!),
    enabled: !!portfolio?.groupId,
  });
  const { data: assets = [], isLoading: loadingAssets } = useQuery({
    queryKey: ["assets", portfolioId],
    queryFn: () => listAssets(portfolioId),
  });

  const [creating, setCreating] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["assets", portfolioId] });

  const createM = useMutation({
    mutationFn: (input: AssetWriteInput) => createAsset({ ...input, portfolioId }),
    onSuccess: () => { invalidate(); setCreating(false); toast.success("Ativo criado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (!portfolio) return <p className="text-sm text-muted-foreground">Carteira não encontrada.</p>;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-foreground">Grupos</Link>
        <ChevronRight className="h-3 w-3" />
        {group ? (
          <>
            <Link to="/app/group/$groupId" params={{ groupId: group.id }} className="hover:text-foreground">
              {group.name}
            </Link>
            <ChevronRight className="h-3 w-3" />
          </>
        ) : (
          <>
            <Link to="/app/portfolios" className="hover:text-foreground">Carteiras</Link>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        <span className="text-foreground">{portfolio.name}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">{portfolio.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Moeda base: {portfolio.baseCurrency} · Grupo: {group?.name ?? "—"}
        </p>
        {portfolio.description && (
          <p className="mt-2 text-sm text-muted-foreground">{portfolio.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Ativos</h2>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild><Button size="sm">Novo ativo</Button></DialogTrigger>
          {creating && (
            <AssetFormDialog
              title="Criar ativo"
              onSubmit={(input) => createM.mutate(input)}
              loading={createM.isPending}
            />
          )}
        </Dialog>
      </div>

      <PortfolioPerformanceSummary
        assets={assets}
        baseCurrency={portfolio.baseCurrency}
        loadingAssets={loadingAssets}
      />

      <PortfolioCompositionCard assets={assets} baseCurrency={portfolio.baseCurrency} />

    </div>
  );
}
