import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listMyPortfolioGroups,
  createPortfolioGroup,
  updatePortfolioGroup,
  deletePortfolioGroup,
} from "@/repositories/portfolio-groups";
import type { PortfolioGroup } from "@/domain/types";
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

export const Route = createFileRoute("/_authenticated/app/")({
  component: GroupsPage,
});

function GroupsPage() {
  const qc = useQueryClient();
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["portfolio_groups"],
    queryFn: listMyPortfolioGroups,
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PortfolioGroup | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["portfolio_groups"] });

  const createM = useMutation({
    mutationFn: createPortfolioGroup,
    onSuccess: () => { invalidate(); setCreating(false); toast.success("Grupo criado"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: (v: { id: string; name: string; description: string | null }) =>
      updatePortfolioGroup(v.id, { name: v.name, description: v.description }),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Grupo atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: deletePortfolioGroup,
    onSuccess: () => { invalidate(); toast.success("Grupo eliminado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Grupos de carteiras</h1>
          <p className="text-sm text-muted-foreground">Organiza carteiras por objetivo (Reforma, Família, ...)</p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild><Button>Novo grupo</Button></DialogTrigger>
          <GroupFormDialog
            title="Criar grupo"
            onSubmit={(v) => createM.mutate(v)}
            loading={createM.isPending}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Ainda não tens grupos. Cria o primeiro para começar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link to="/app/group/$groupId" params={{ groupId: g.id }} className="hover:underline">
                    {g.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}

                <div className="flex gap-2">
                  <Dialog open={editing?.id === g.id} onOpenChange={(o) => setEditing(o ? g : null)}>
                    <DialogTrigger asChild><Button variant="outline" size="sm">Editar</Button></DialogTrigger>
                    <GroupFormDialog
                      title="Editar grupo"
                      initial={g}
                      onSubmit={(v) => updateM.mutate({ id: g.id, ...v })}
                      loading={updateM.isPending}
                    />
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">Eliminar</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar "{g.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          As carteiras associadas ficam sem grupo. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteM.mutate(g.id)}>Eliminar</AlertDialogAction>
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

function GroupFormDialog({
  title, initial, onSubmit, loading,
}: {
  title: string;
  initial?: PortfolioGroup;
  onSubmit: (v: { name: string; description: string | null }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome é obrigatório");
    onSubmit({ name: name.trim(), description: description.trim() || null });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Um grupo agrega carteiras relacionadas.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="g-name">Nome *</Label>
          <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="g-desc">Descrição</Label>
          <Textarea id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={loading}>Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
