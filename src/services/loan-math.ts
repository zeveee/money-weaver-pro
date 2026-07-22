/**
 * IvestWise :: Matemática de crédito (pura)
 *
 * Fórmulas base para prestações, juros e amortização.
 * Sem dependências externas.
 */

/** Prestação mensal (sistema francês / annuity). */
export function monthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

export interface AmortizationRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export function amortizationSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  const r = annualRate / 12;
  const pmt = monthlyPayment(principal, annualRate, termMonths);
  let balance = principal;
  for (let m = 1; m <= termMonths; m++) {
    const interest = balance * r;
    const principalPortion = pmt - interest;
    balance = Math.max(0, balance - principalPortion);
    rows.push({ month: m, payment: pmt, interest, principal: principalPortion, balance });
  }
  return rows;
}
