/**
 * Formatação de datas sem desvio de fuso.
 *
 * Datas puras (`YYYY-MM-DD`) são formatadas diretamente a partir da string:
 * convertê-las através de `new Date()` fá-las recuar um dia em fusos negativos.
 * Timestamps completos continuam a ser mostrados no fuso local do utilizador.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDateLabel(value: string, locale = "pt-PT"): string {
  if (!value) return "—";
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-");
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toLocaleDateString(locale, {
      timeZone: "UTC",
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale);
}
