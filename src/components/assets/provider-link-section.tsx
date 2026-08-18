/**
 * Ligação do ativo a um fornecedor de preços (asset_provider_links).
 *
 * A leitura é feita pelo cliente do browser (RLS trata do isolamento);
 * a escrita passa sempre pelas server functions autenticadas.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveProviderForAsset, syncAssetPrices } from "@/lib/market-data.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLabel } from "@/lib/date-format";

interface Props {
  assetId: string;
  isin: string | null | undefined;
}

interface LinkRow {
  provider: string;
  provider_instrument_id: string;
  status: string;
  last_synced_date: string | null;
}

type SyncMode = "latest" | "historical";

export function ProviderLinkSection({ assetId, isin }: Props) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState<SyncMode | null>(null);

  const linkQueryKey = ["asset-provider-link", assetId];

  const { data: link, isLoading } = useQuery({
    queryKey: linkQueryKey,
    queryFn: async (): Promise<LinkRow | null> => {
      const { data, error } = await supabase
        .from("asset_provider_links")
        .select("provider, provider_instrument_id, status, last_synced_date")
        .eq("asset_id", assetId)
        .maybeSingle();
      if (error) throw error;
      return (data as LinkRow | null) ?? null;
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: linkQueryKey });
    qc.invalidateQueries({ queryKey: ["valuations", assetId] });
    qc.invalidateQueries({ queryKey: ["asset", assetId] });
  };

  const runSync = async (mode: SyncMode) => {
    setSyncing(mode);
    try {
      const res = await syncAssetPrices({ data: { assetId, mode } });
      if (res.status === "synced") {
        const range = res.from && res.to ? ` (${res.from} → ${res.to})` : "";
        toast.success(`${res.written} preços sincronizados${range}`);
        invalidateAll();
      } else if (res.status === "up_to_date") {
        toast("Já estava atualizado");
        qc.invalidateQueries({ queryKey: linkQueryKey });
      } else {
        toast.error(res.message);
        qc.invalidateQueries({ queryKey: linkQueryKey });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(null);
    }
  };

  const resolveM = useMutation({
    mutationFn: () => resolveProviderForAsset({ data: { assetId } }),
    onSuccess: async (res) => {
      if (res.status === "linked") {
        const id =
          (res.link as unknown as Record<string, unknown>)?.["providerInstrumentId"] ??
          (res.link as unknown as Record<string, unknown>)?.["provider_instrument_id"];
        toast.success(`Ligado a ${res.provider} (${String(id ?? "—")})`);
        qc.invalidateQueries({ queryKey: linkQueryKey });
        await runSync("historical");
      } else if (res.status === "not_found") {
        toast.warning(res.message);
      } else {
        toast.error(res.message);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fornecedor de preços</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : !link ? (
          !isin ? (
            <p className="text-sm text-muted-foreground">
              Este ativo não tem ISIN — a ligação automática de preços não está disponível.
            </p>
          ) : (
            <Button
              size="sm"
              disabled={resolveM.isPending || syncing !== null}
              onClick={() => resolveM.mutate()}
            >
              {resolveM.isPending || syncing ? "A ligar…" : "Ligar a fornecedor de preços"}
            </Button>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{link.provider}</Badge>
              <span className="text-muted-foreground">{link.provider_instrument_id}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Última sincronização:{" "}
              {link.last_synced_date ? formatDateLabel(link.last_synced_date) : "ainda não sincronizado"}
            </p>
            {link.status === "not_found" && (
              <p className="text-sm text-destructive">
                O fornecedor deixou de encontrar este instrumento.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={syncing !== null}
                onClick={() => runSync("latest")}
              >
                {syncing === "latest" ? "A sincronizar…" : "Sincronizar agora"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={syncing !== null}
                onClick={() => runSync("historical")}
              >
                {syncing === "historical" ? "A recarregar…" : "Recarregar histórico"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
