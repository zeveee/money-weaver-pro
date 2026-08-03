import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPortfolio } from "@/repositories/portfolios";
import { getPortfolioGroup } from "@/repositories/portfolio-groups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/portfolio/$portfolioId")({
  component: PortfolioDetailPage,
});

function PortfolioDetailPage() {
  const { portfolioId } = Route.useParams();

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => getPortfolio(portfolioId),
  });
  const { data: group } = useQuery({
    queryKey: ["portfolio_group", portfolio?.groupId],
    queryFn: () => getPortfolioGroup(portfolio!.groupId!),
    enabled: !!portfolio?.groupId,
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
            <Link
              to="/app/group/$groupId"
              params={{ groupId: group.id }}
              className="hover:text-foreground"
            >
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

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Ativos</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ainda sem ativos</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Espaço reservado para os ativos desta carteira.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
