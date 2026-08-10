// TODO (futuro): opção de pesquisa por ISIN no Passo 1, com auto-criação do ativo
// se ainda não existir na carteira.
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import type { Asset, AssetType, Transaction } from "@/domain/types";
import { ASSET_PROFILES, isUnitBased } from "@/domain/asset-profiles";
import { createTransaction, type TransactionWriteInput } from "@/repositories/transactions";
import type { FxRateTable } from "@/services/fx";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Criação de transação a partir da carteira, em dois passos:
 * 1) escolher o ativo (lista agrupada por tipo, com pesquisa);
 * 2) o formulário de transação já existente, tal e qual.
 */
export function NewTransactionDialog({
  open,
  onOpenChange,
  assets,
  transactionsByAssetId,
  reportingCurrency,
  fxTable,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: Asset[];
  transactionsByAssetId: Record<string, Transaction[]>;
  reportingCurrency: string;
  fxTable: FxRateTable;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byType = new Map<AssetType, Asset[]>();
    for (const a of assets) {
      const matches =
        !q ||
        a.name.toLowerCase().includes(q) ||
        (a.ticker?.toLowerCase().includes(q) ?? false) ||
        (a.isin?.toLowerCase().includes(q) ?? false);
      if (!matches) continue;
      const list = byType.get(a.type) ?? [];
      list.push(a);
      byType.set(a.type, list);
    }
    return [...byType.entries()]
      .map(([type, rows]) => ({
        type,
        label: ASSET_PROFILES[type]?.label ?? type,
        rows: [...rows].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [assets, query]);

  const createM = useMutation({
    mutationFn: (input: TransactionWriteInput) =>
      createTransaction({ ...input, assetId: selectedAsset!.id }),
    onSuccess: () => {
      const id = selectedAsset?.id;
      if (id) qc.invalidateQueries({ queryKey: ["transactions", id] });
      toast.success("Transação criada");
      onCreated();
      setStep("pick");
      setSelectedAsset(null);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (step === "form" && selectedAsset) {
    return (
      <TransactionFormDialog
        title="Nova transação"
        assetType={selectedAsset.type}
        currency={selectedAsset.currency}
        transactions={transactionsByAssetId[selectedAsset.id] ?? []}
        unitBased={isUnitBased(selectedAsset.type, selectedAsset.metadata)}
        reportingCurrency={reportingCurrency}
        fxTable={fxTable}
        onSubmit={(input) => createM.mutate(input)}
        loading={createM.isPending}
        header={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setStep("pick")}
            >
              ‹ Trocar ativo
            </Button>
            <span className="text-xs text-muted-foreground">{selectedAsset.name}</span>
          </div>
        }
      />
    );
  }

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Nova transação</DialogTitle>
        <DialogDescription>Escolha o ativo a que a transação diz respeito.</DialogDescription>
      </DialogHeader>

      <Input
        placeholder="Pesquisar por nome, ticker ou ISIN…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="space-y-2">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum ativo corresponde à pesquisa.</p>
        )}
        {groups.map((g) => {
          const isOpen = !!expanded[g.type] || query.trim() !== "";
          return (
            <div key={g.type} className="rounded-lg border">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setExpanded((s) => ({ ...s, [g.type]: !s[g.type] }))}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
              >
                <ChevronRight
                  className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-90")}
                />
                <span className="flex-1 text-sm font-medium">
                  {g.label}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({g.rows.length})
                  </span>
                </span>
              </button>

              {isOpen && (
                <ul className="divide-y border-t">
                  {g.rows.map((asset) => (
                    <li key={asset.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAsset(asset);
                          setStep("form");
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <span className="truncate text-sm">{asset.name}</span>
                        <Badge variant="secondary">{g.label}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </DialogContent>
  );
}
