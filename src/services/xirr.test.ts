import { describe, expect, it } from "vitest";
import type { AssetValuation, ExchangeRate, Transaction } from "@/domain/types";
import { buildRateTable } from "@/services/fx";
import { xirr, assetXirr, type CashFlow } from "@/services/xirr";

// ---------------------------------------------------------------------------
// Solver genérico
// ---------------------------------------------------------------------------

/** Recalcula o NPV de uma lista de fluxos a uma taxa dada (ACT/365), para
 *  verificar por invariante (NPV ≈ 0) em vez de depender de valores mágicos. */
function npvCheck(flows: CashFlow[], rate: number): number {
  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const t0 = sorted[0].date;
  return sorted.reduce((sum, f) => {
    const years =
      (new Date(`${f.date}T00:00:00Z`).getTime() - new Date(`${t0}T00:00:00Z`).getTime()) /
      (86_400_000 * 365);
    return sum + f.amount / Math.pow(1 + rate, years);
  }, 0);
}

describe("XIRR :: solver genérico", () => {
  it("um único investimento e um único resgate exatamente 1 ano depois (365 dias, não bissexto)", () => {
    const r = xirr([
      { date: "2023-01-01", amount: -1000 },
      { date: "2024-01-01", amount: 1100 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 6); // +10% exato: 365 dias = 1 ano, sem juro composto a corrigir
  });

  it("múltiplos fluxos irregulares: a taxa encontrada satisfaz NPV ≈ 0", () => {
    const flows: CashFlow[] = [
      { date: "2022-01-01", amount: -10000 },
      { date: "2022-06-15", amount: -2500 },
      { date: "2022-11-01", amount: 1200 }, // dividendo
      { date: "2023-03-01", amount: 4000 }, // venda parcial
      { date: "2023-09-01", amount: 9500 }, // liquidação final
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(npvCheck(flows, r!)).toBeCloseTo(0, 4);
  });

  it("todos os fluxos com o mesmo sinal: sem solução (null)", () => {
    expect(
      xirr([
        { date: "2023-01-01", amount: -1000 },
        { date: "2023-06-01", amount: -500 },
      ]),
    ).toBeNull();
  });

  it("um único fluxo: sem solução (null)", () => {
    expect(xirr([{ date: "2023-01-01", amount: -1000 }])).toBeNull();
  });

  it("todos os fluxos na mesma data: período indefinido (null)", () => {
    expect(
      xirr([
        { date: "2023-01-01", amount: -1000 },
        { date: "2023-01-01", amount: 1000 },
      ]),
    ).toBeNull();
  });

  it("lista vazia: null", () => {
    expect(xirr([])).toBeNull();
  });

  it("perda total (retorno final zero) converge sem lançar exceção", () => {
    const flows: CashFlow[] = [
      { date: "2022-01-01", amount: -1000 },
      { date: "2023-01-01", amount: 1 }, // quase perda total, nunca exatamente 0
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(-0.9);
    // Perto de -100% a curva do NPV é extremamente íngreme (1/(1+r) diverge),
    // por isso a tolerância aqui é mais larga do que nos casos regulares.
    expect(npvCheck(flows, r!)).toBeCloseTo(0, 2);
  });

  it("ganho muito grande num período curto: ainda converge e cumpre o NPV", () => {
    const flows: CashFlow[] = [
      { date: "2023-01-01", amount: -1000 },
      { date: "2023-01-15", amount: 1300 }, // +30% em 2 semanas
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(npvCheck(flows, r!)).toBeCloseTo(0, 3);
  });
});

// ---------------------------------------------------------------------------
// assetXirr :: construção de fluxos a partir de transações
// ---------------------------------------------------------------------------

const rate = (base: string, quote: string, date: string, value: number): ExchangeRate => ({
  id: `${base}-${quote}-${date}`,
  date,
  baseCurrency: base,
  quoteCurrency: quote,
  exchangeRate: value,
  source: "test",
});

const table = buildRateTable([
  rate("EUR", "USD", "2023-01-01", 1.1),
  rate("EUR", "USD", "2024-01-01", 1.1),
]);

const tx = (
  id: string,
  type: Transaction["type"],
  occurredAt: string,
  quantity: number,
  amount: number,
  currency = "EUR",
  extra: Partial<Transaction> = {},
): Transaction => ({
  id,
  assetId: "a",
  type,
  occurredAt,
  quantity,
  unitPrice: quantity > 0 ? amount / quantity : 0,
  amount,
  currency,
  fees: 0,
  taxes: 0,
  notes: null,
  metadata: {},
  recurringTransactionId: null,
  ...extra,
});

const valuation = (date: string, unitPrice: number, currency = "EUR"): AssetValuation => ({
  id: `v-${date}`,
  assetId: "a",
  valuationDate: date,
  unitPrice,
  totalValue: 0,
  currency,
  source: "test",
  isManual: false,
});

/** Valorização manual (valor absoluto do contrato), como um seguro de
 *  capitalização sem tracking por unidades — `unitPrice: null`. */
const manualValuation = (date: string, totalValue: number, currency = "EUR"): AssetValuation => ({
  id: `v-${date}`,
  assetId: "a",
  valuationDate: date,
  unitPrice: null,
  totalValue,
  currency,
  source: "test",
  isManual: true,
});

describe("XIRR :: assetXirr", () => {
  it("compra única + valorização final exatamente 1 ano depois: replica o caso analítico simples", () => {
    const r = assetXirr({
      assetType: "etf",
      transactions: [tx("1", "buy", "2023-01-01T12:00:00.000Z", 10, 1000)],
      valuations: [valuation("2024-01-01", 110)], // 10 × 110 = 1100
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2024-01-01",
    });
    expect(r.hasTerminalValue).toBe(true);
    expect(r.cashFlows).toEqual([
      { date: "2023-01-01", amount: -1000 },
      { date: "2024-01-01", amount: 1100 },
    ]);
    expect(r.xirr).not.toBeNull();
    expect(r.xirr!).toBeCloseTo(0.1, 6);
  });

  it("posição aberta sem nenhuma valorização: xirr null mas fluxos de entrada preservados", () => {
    const r = assetXirr({
      assetType: "etf",
      transactions: [tx("1", "buy", "2023-01-01T12:00:00.000Z", 10, 1000)],
      valuations: [],
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2024-01-01",
    });
    expect(r.hasTerminalValue).toBe(false);
    expect(r.xirr).toBeNull();
    expect(r.cashFlows).toEqual([{ date: "2023-01-01", amount: -1000 }]);
  });

  it("posição totalmente alienada: não adiciona fluxo terminal, calcula só sobre os fluxos realizados", () => {
    const r = assetXirr({
      assetType: "etf",
      transactions: [
        tx("1", "buy", "2023-01-01T12:00:00.000Z", 10, 1000),
        tx("2", "sell", "2024-01-01T12:00:00.000Z", 10, 1100),
      ],
      valuations: [],
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2024-06-01", // muito depois da venda: não deve entrar fluxo terminal nenhum
    });
    expect(r.hasTerminalValue).toBe(true); // posição fechada, nada por valorizar
    expect(r.cashFlows).toEqual([
      { date: "2023-01-01", amount: -1000 },
      { date: "2024-01-01", amount: 1100 },
    ]);
    expect(r.xirr!).toBeCloseTo(0.1, 6);
  });

  it("dividendo entra como fluxo positivo na sua própria data", () => {
    const r = assetXirr({
      assetType: "etf",
      transactions: [
        tx("1", "buy", "2023-01-01T12:00:00.000Z", 10, 1000),
        tx("2", "dividend", "2023-07-01T12:00:00.000Z", 0, 20),
      ],
      valuations: [valuation("2024-01-01", 105)],
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2024-01-01",
    });
    expect(r.cashFlows).toEqual([
      { date: "2023-01-01", amount: -1000 },
      { date: "2023-07-01", amount: 20 },
      { date: "2024-01-01", amount: 1050 },
    ]);
  });

  it("comissões e impostos reduzem o encaixe de uma venda e aumentam o custo de uma compra", () => {
    const r = assetXirr({
      assetType: "etf",
      transactions: [
        tx("1", "buy", "2023-01-01T12:00:00.000Z", 10, 1000, "EUR", { fees: 10 }),
        tx("2", "sell", "2024-01-01T12:00:00.000Z", 10, 1100, "EUR", { fees: 5, taxes: 15 }),
      ],
      valuations: [],
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2024-06-01",
    });
    expect(r.cashFlows).toEqual([
      { date: "2023-01-01", amount: -1010 }, // -(1000 + 10)
      { date: "2024-01-01", amount: 1080 }, // 1100 - 5 - 15
    ]);
  });

  it("ajuste (neutral) nunca entra como fluxo de caixa", () => {
    const r = assetXirr({
      assetType: "etf",
      transactions: [
        tx("1", "buy", "2023-01-01T12:00:00.000Z", 10, 1000),
        tx("2", "adjustment", "2023-06-01T12:00:00.000Z", 1, 1),
      ],
      valuations: [valuation("2024-01-01", 105)],
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2024-01-01",
    });
    expect(r.cashFlows).toEqual([
      { date: "2023-01-01", amount: -1000 },
      { date: "2024-01-01", amount: 1050 },
    ]);
  });

  it("multi-moeda: fluxos convertidos evento a evento, resultado ainda satisfaz NPV ≈ 0", () => {
    const r = assetXirr({
      assetType: "etf",
      transactions: [tx("1", "buy", "2023-01-01T12:00:00.000Z", 10, 1100, "USD")],
      valuations: [valuation("2024-01-01", 121, "USD")], // 10 × 121 = 1210 USD
      nativeCurrency: "USD",
      reportingCurrency: "EUR",
      fxTable: table, // 1 EUR = 1.1 USD nas duas datas
      asOf: "2024-01-01",
    });
    expect(r.hasTerminalValue).toBe(true);
    expect(r.xirr).not.toBeNull();
    expect(npvCheck(r.cashFlows, r.xirr!)).toBeCloseTo(0, 4);
    // 1100 USD / 1.1 = 1000 EUR; 1210 USD / 1.1 = 1100 EUR → mesmo caso analítico
    expect(r.xirr!).toBeCloseTo(0.1, 5);
  });

  it("taxa em falta para a moeda: transação excluída, sem fluxos suficientes → null", () => {
    const r = assetXirr({
      assetType: "etf",
      transactions: [tx("1", "buy", "2023-01-01T12:00:00.000Z", 10, 1000, "JPY")],
      valuations: [valuation("2024-01-01", 110, "JPY")],
      nativeCurrency: "JPY",
      reportingCurrency: "EUR",
      fxTable: table, // sem taxa JPY→EUR
      asOf: "2024-01-01",
    });
    expect(r.xirr).toBeNull();
  });

  it("REGRESSÃO: seguro de capitalização (unitBased) com reforços recorrentes deve computar XIRR", () => {
    // Sem `unitBased: true` propagado ao Position Engine, os reforços não
    // contam como quantidade, a posição fica sempre a 0 unidades, o fluxo
    // terminal nunca é acrescentado, e sobram só fluxos negativos → null
    // silencioso. Este teste falha se essa propagação voltar a quebrar.
    const r = assetXirr({
      assetType: "capitalization_insurance",
      transactions: [
        tx("1", "deposit", "2025-07-23T00:00:00.000Z", 50, 50),
        tx("2", "deposit", "2025-08-23T00:00:00.000Z", 50, 50),
        tx("3", "deposit", "2025-09-23T00:00:00.000Z", 50, 50),
      ],
      valuations: [valuation("2026-08-06", 1.05)], // 150 UP × 1,05 = 157,5
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2026-08-06",
      unitBased: true,
    });
    expect(r.hasTerminalValue).toBe(true);
    expect(r.cashFlows.at(-1)).toEqual({ date: "2026-08-06", amount: 157.5 });
    expect(r.xirr).not.toBeNull();
    expect(npvCheck(r.cashFlows, r.xirr!)).toBeCloseTo(0, 4);
  });

  it("REGRESSÃO: contrato valorizado por valor absoluto (sem unidades) deve computar XIRR", () => {
    // Quando a valorização é manual/absoluta (unitPrice null, como um seguro
    // de capitalização sem tracking por UP), quantity fica sempre 0 por
    // desenho — usar `quantity > 0` como sinal de "posição aberta" faz o
    // XIRR ficar sempre null, mesmo com capital investido e valorização
    // recente. O sinal correto é costBasis > 0 (capital ainda não
    // recuperado). Este teste replica o caso real reportado (reforços
    // mensais + valorização manual do contrato).
    const r = assetXirr({
      assetType: "capitalization_insurance",
      transactions: [
        tx("1", "deposit", "2025-07-23T00:00:00.000Z", 0, 50),
        tx("2", "deposit", "2025-08-23T00:00:00.000Z", 0, 50),
        tx("3", "deposit", "2025-09-23T00:00:00.000Z", 0, 50),
      ],
      valuations: [manualValuation("2026-08-06", 165)],
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2026-08-06",
      unitBased: false,
    });
    expect(r.hasTerminalValue).toBe(true);
    expect(r.cashFlows.at(-1)).toEqual({ date: "2026-08-06", amount: 165 });
    expect(r.xirr).not.toBeNull();
    expect(npvCheck(r.cashFlows, r.xirr!)).toBeCloseTo(0, 4);
  });
});
