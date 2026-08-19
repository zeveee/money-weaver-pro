import { cn } from "@/lib/utils";

export type ProviderLinkStatus = "active" | "not_found" | "none";

/**
 * Indicador visual do estado da ligação a fornecedor de preços.
 * Apresentação pura — nenhuma lógica de negócio.
 */
export function ProviderStatusDot({
  isin,
  linkStatus,
  className,
}: {
  isin: string | null;
  linkStatus: ProviderLinkStatus;
  className?: string;
}) {
  const { color, label } =
    isin == null
      ? { color: "bg-destructive", label: "Sem ISIN — sem fornecedor disponível" }
      : linkStatus === "active"
        ? {
            color: "bg-emerald-500 dark:bg-emerald-400",
            label: "Ligado a fornecedor de preços",
          }
        : linkStatus === "not_found"
          ? {
              color: "bg-orange-500 dark:bg-orange-400",
              label: "Fornecedor disponível, ligação falhou",
            }
          : {
              color: "bg-amber-400 dark:bg-amber-300",
              label: "Fornecedor disponível, ainda não testado",
            };

  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-block size-2 shrink-0 rounded-full", color, className)}
    />
  );
}
