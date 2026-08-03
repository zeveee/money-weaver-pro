import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listMyPortfolios, createPortfolio, updatePortfolio, deletePortfolio,
} from "@/repositories/portfolios";
import { listMyPortfolioGroups } from "@/repositories/portfolio-groups";
import type { Portfolio } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

export const Route = createFileRoute("/_authenticated/app/portfolios")({
  component: PortfoliosPage,
});

function PortfoliosPage() {
  const qc = useQueryClient();
  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ["portfolios"], queryFn: listMyPortfolios,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["portfolio_groups"], queryFn: listMyPortfolioGroups,
  });
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "—";

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Portfolio | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["portfolios"] });

  const createM = useMutation({
    mutationFn: createPortfolio,
    onSuccess: () => { invalidate(); setCreating(false); toast.success("Carteira criada"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: (v: { id: string; name: string; description: string | null; baseCurrency: string; groupId: string | null }) =>
      updatePortfolio(v.id, v),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Carteira atualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: deletePortfolio,
    onSuccess: () => { invalidate(); toast.success("Carteira eliminada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Carteiras</h1>
          <p className="text-sm text-muted-foreground">Gere as tuas carteiras e associa-as a um grupo.</p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild><Button>Nova carteira</Button></DialogTrigger>
          <PortfolioFormDialog
            title="Criar carteira"
            groups={groups}
            onSubmit={(v) => createM.mutate(v)}
            loading={createM.isPending}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : portfolios.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Ainda não tens carteiras. Cria a primeira.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {portfolios.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link to="/app/portfolio/$portfolioId" params={{ portfolioId: p.id }} className="hover:underline">
                    {p.name}
                  </Link>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {p.baseCurrency} · Grupo:{" "}
                  {p.groupId ? (
                    <Link to="/app/group/$groupId" params={{ groupId: p.groupId }} className="hover:underline">
                      {groupName(p.groupId)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </p>
              </CardHeader>

              <CardContent className="space-y-3">
                {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                <div className="flex gap-2">
                  <Dialog open={editing?.id === p.id} onOpenChange={(o) => setEditing(o ? p : null)}>
                    <DialogTrigger asChild><Button variant="outline" size="sm">Editar</Button></DialogTrigger>
                    <PortfolioFormDialog
                      title="Editar carteira"
                      initial={p}
                      groups={groups}
                      onSubmit={(v) => updateM.mutate({ id: p.id, ...v })}
                      loading={updateM.isPending}
                    />
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">Eliminar</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar "{p.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Todos os ativos e transações associados serão eliminados. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteM.mutate(p.id)}>Eliminar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioFormDialog({
  title, initial, groups, onSubmit, loading,
}: {
  title: string;
  initial?: Portfolio;
  groups: { id: string; name: string }[];
  onSubmit: (v: { name: string; description: string | null; baseCurrency: string; groupId: string | null }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [baseCurrency, setBaseCurrency] = useState(initial?.baseCurrency ?? "EUR");
  const [groupId, setGroupId] = useState<string>(initial?.groupId ?? NONE);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome é obrigatório");
    if (!/^[A-Z]{3}$/.test(baseCurrency)) return toast.error("Moeda deve ser ISO (ex.: EUR, USD)");
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      baseCurrency,
      groupId: groupId === NONE ? null : groupId,
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Define nome, moeda base e grupo opcional.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="p-name">Nome *</Label>
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="p-cur">Moeda base *</Label>
            <Input id="p-cur" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())} maxLength={3} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-grp">Grupo</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="p-grp"><SelectValue placeholder="Sem grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem grupo</SelectItem>
                {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-desc">Descrição</Label>
          <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={loading}>Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
