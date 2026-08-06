import { formatCurrency } from "@/lib/number-format";
import { formatDateLabel } from "@/lib/date-format";
import { rateAt, type FxRateTable } from "@/services/fx";
import { cn } from "@/lib/utils";

/**
 * Apresenta um montante na sua moeda nativa e, quando difere da moeda de
 * reporting, o equivalente convertido à taxa da data do evento.
 *
 * `date = null` → usa a taxa mais recente disponível (valor "atual").
 * `settled` → montante efetivamente liquidado pela corretora na moeda de
 * reporting; quando presente prevalece sobre a taxa do BCE.
 * Sem taxa utilizável, falha de forma explícita — nunca assume 1.
 */
export function FxAmount({
  table,
  amount,
  currency,
  reportingCurrency,
  date,
  settled,
  className,
  inline,
}: {
  table: FxRateTable;
  amount: number;
  currency: string;
  reportingCurrency: string;
  date: string | null;
  settled?: number | null;
  className?: string;
  inline?: boolean;
}) {
  const native = formatCurrency(amount, currency);
  const to = (reportingCurrency || "").toUpperCase();
  if (!to || to === (currency || "").toUpperCase()) return <span className={className}>{native}</span>;

  if (settled != null && Number.isFinite(settled) && amount !== 0) {
    const effective = settled / amount;
    return (
      <span className={className}>
        {native}
        <span
          className={cn("text-xs text-muted-foreground", inline ? "ml-2" : "block")}
          title={`Montante liquidado pela corretora · 1 ${currency} = ${effective.toPrecision(
            8,
          )} ${to} (taxa efetiva)`}
        >
          = {formatCurrency(settled, to)} †
        </span>
      </span>
    );
  }

  const resolution = rateAt(table, currency, to, date);

  if (resolution.status === "missing") {
    return (
      <span className={className}>
        {native}
        <span className={cn("text-xs text-destructive", inline ? "ml-2" : "block")}>
          sem taxa {currency}/{to}
        </span>
      </span>
    );
  }

  const converted = formatCurrency(amount * resolution.rate, to);
  const title = `1 ${currency} = ${resolution.rate.toPrecision(8)} ${to} · taxa de ${formatDateLabel(
    resolution.rateDate,
  )}${resolution.carriedForward ? " (transportada)" : ""} · via ${resolution.path}`;

  return (
    <span className={className}>
      {native}
      <span
        className={cn("text-xs text-muted-foreground", inline ? "ml-2" : "block")}
        title={title}
      >
        ≈ {converted}
        {resolution.carriedForward && " *"}
      </span>
    </span>
  );
}

/** Nota de rodapé partilhada pelas secções que mostram valores convertidos. */
export function FxFootnote({
  currency,
  reportingCurrency,
  isEmpty,
  usedSettlement,
}: {
  currency: string;
  reportingCurrency: string;
  isEmpty: boolean;
  /** Alguma transação usa o montante liquidado pela corretora. */
  usedSettlement?: boolean;
}) {
  if ((currency || "").toUpperCase() === (reportingCurrency || "").toUpperCase()) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Valores convertidos de {currency} para {reportingCurrency} à taxa do BCE da data de cada
      evento (o valor atual usa a taxa mais recente disponível). “*” indica taxa transportada do
      último dia útil conhecido.
      {usedSettlement &&
        " “†” indica montante efetivamente liquidado pela corretora — prevalece sobre a taxa do BCE."}
      {isEmpty && " Ainda não existem taxas carregadas — execute a sincronização FX."}
    </p>
  );
}
