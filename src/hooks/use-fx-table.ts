import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listExchangeRates } from "@/repositories/exchange-rates";
import { buildRateTable, EMPTY_RATE_TABLE, PIVOT_CURRENCY, type FxRateTable } from "@/services/fx";

/**
 * Carrega o catálogo de taxas necessário para converter um conjunto de moedas
 * e devolve-o já indexado (`FxRateTable`).
 *
 * A moeda pivô é sempre incluída: qualquer par A→B resolve-se por triangulação
 * via EUR. Leitura pública — não exige papel especial.
 */
export function useFxTable(
  currencies: (string | null | undefined)[],
  options: { since?: string; enabled?: boolean } = {},
): { table: FxRateTable; isLoading: boolean; isEmpty: boolean } {
  const wanted = [...new Set(
    [...currencies, PIVOT_CURRENCY]
      .filter((c): c is string => !!c)
      .map((c) => c.toUpperCase()),
  )].sort();

  const needsFx = wanted.some((c) => c !== PIVOT_CURRENCY);
  const enabled = (options.enabled ?? true) && needsFx;

  const { data = [], isLoading } = useQuery({
    queryKey: ["exchange-rates", wanted.join(","), options.since ?? null],
    queryFn: () => listExchangeRates({ currencies: wanted, since: options.since }),
    enabled,
    staleTime: 1000 * 60 * 60, // taxas diárias: uma hora de cache é conservador
  });

  const table = useMemo(() => (data.length > 0 ? buildRateTable(data) : EMPTY_RATE_TABLE), [data]);

  return { table, isLoading: enabled && isLoading, isEmpty: enabled && data.length === 0 };
}
