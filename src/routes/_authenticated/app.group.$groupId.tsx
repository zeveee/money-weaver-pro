import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPortfolioGroup } from "@/repositories/portfolio-groups";
import { listPortfoliosByGroup } from "@/repositories/portfolios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/group/$groupId")({
  component: GroupDetailPage,
});

function GroupDetailPage() {
  const { groupId } = Route.useParams();

  const { data: group, isLoading } = useQuery({
    queryKey: ["portfolio_group", groupId],
    queryFn: () => getPortfolioGroup(groupId),
  });
  const { data: portfolios = [], isLoading: loadingPortfolios } = useQuery({
    queryKey: ["portfolios", "group", groupId],
    queryFn: () => listPortfoliosByGroup(groupId),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (!group) return <p className="text-sm text-muted-foreground">Grupo não encontrado.</p>;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-foreground">Grupos</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{group.name}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">{group.name}</h1>
        {group.description && (
          <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Carteiras do grupo</h2>
        {loadingPortfolios ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : portfolios.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Este grupo ainda não tem carteiras.{" "}
              <Link to="/app/portfolios" className="underline">Criar carteira</Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {portfolios.map((p) => (
              <Link key={p.id} to="/app/portfolio/$portfolioId" params={{ portfolioId: p.id }}>
                <Card className="transition-colors hover:border-primary">
                  <CardHeader>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{p.baseCurrency}</p>
                  </CardHeader>
                  {p.description && (
                    <CardContent className="text-sm text-muted-foreground">{p.description}</CardContent>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
