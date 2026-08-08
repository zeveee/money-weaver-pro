import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getPortfolio } from "@/repositories/portfolios";
import { getPortfolioGroup } from "@/repositories/portfolio-groups";
import {
  listAssets, createAsset, updateAsset, deleteAsset, type AssetWriteInput,
} from "@/repositories/assets";
import { getAssetProfile } from "@/domain/asset-profiles";
import type { Asset } from "@/domain/types";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronRight } from "lucide-react";
import { PortfolioPerformanceSummary } from "@/components/performance/portfolio-performance-summary";

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
  const [editing, setEditing] = useState<Asset | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["assets", portfolioId] });

  const createM = useMutation({
    mutationFn: (input: AssetWriteInput) => createAsset({ ...input, portfolioId }),
    onSuccess: () => { invalidate(); setCreating(false); toast.success("Ativo criado"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: (v: { id: string; input: AssetWriteInput }) => updateAsset(v.id, v.input),
    onSuccess: (a) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["asset", a.id] });
      setEditing(null);
      toast.success("Ativo atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => { invalidate(); toast.success("Ativo eliminado"); },
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

      <PortfolioPerformanceSummary
        assets={assets}
        baseCurrency={portfolio.baseCurrency}
        loadingAssets={loadingAssets}
      />

      <section className="space-y-3">
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

        {loadingAssets ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : assets.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Esta carteira ainda não tem ativos. Cria o primeiro.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {assets.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    <Link to="/app/asset/$assetId" params={{ assetId: a.id }} className="hover:underline">
                      {a.name}
                    </Link>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{getAssetProfile(a.type).label}</Badge>
                    <span>{a.currency}</span>
                    {a.ticker && <span>· {a.ticker}</span>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {a.notes && <p className="text-sm text-muted-foreground">{a.notes}</p>}
                  <div className="flex gap-2">
                    <Dialog open={editing?.id === a.id} onOpenChange={(o) => setEditing(o ? a : null)}>
                      <DialogTrigger asChild><Button variant="outline" size="sm">Editar</Button></DialogTrigger>
                      {editing?.id === a.id && (
                        <AssetFormDialog
                          title="Editar ativo"
                          asset={a}
                          onSubmit={(input) => updateM.mutate({ id: a.id, input })}
                          loading={updateM.isPending}
                        />
                      )}
                    </Dialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">Eliminar</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar "{a.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            As transações e valorações associadas serão eliminadas. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteM.mutate(a.id)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
