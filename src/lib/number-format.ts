/**
 * IvestWise :: Formatação numérica (camada de apresentação)
 *
 * REGRA DE ARQUITETURA: o arredondamento acontece APENAS aqui.
 * Repositórios e serviços (Position Engine, Valuation Engine, mais-valias,
 * rentabilidade, XIRR) operam sempre com a precisão completa vinda da base de
 * dados e nunca devolvem valores arredondados.
 */

const LOCALE = "pt-PT";

/** Montantes monetários: 2 casas decimais, símbolo da moeda. */
export function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Quantidades (unidades, UPs): até 10 casas, sem zeros supérfluos. */
export function formatQuantity(value: number, maximumFractionDigits = 10): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

/** Preço unitário / NAV: até 8 casas, mínimo 2, sem zeros supérfluos além disso. */
export function formatUnitPrice(value: number, currency?: string): string {
  const n = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
  return currency ? `${n} ${currency}` : n;
}

/** Percentagens a partir de uma fração (0.0725 → "7,25 %"). */
export function formatPercent(fraction: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(fraction);
}
