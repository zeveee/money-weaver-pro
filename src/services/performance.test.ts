import { describe, expect, it } from "vitest";
import type { AssetValuation, ExchangeRate, Transaction } from "@/domain/types";
import { buildRateTable } from "@/services/fx";
import { assetPerformance } from "@/services/performance";

const rate = (base: string, quote: string, date: string, value: number): ExchangeRate => ({
  id: `${base}-${quote}-${date}`,
  date,
  baseCurrency: base,
  quoteCurrency: quote,
  exchangeRate: value,
  source: "test",
});

// 1 EUR = X USD
const table = buildRateTable([
  rate("EUR", "USD", "2025-01-10", 1.1),
  rate("EUR", "USD", "2025-06-10", 1.05),
  rate("EUR", "USD", "2025-06-20", 1.06),
  rate("EUR", "USD", "2025-06-25", 1.07),
  rate("EUR", "USD", "2025-06-30", 1.08),
]);

const tx = (
  id: string,
  type: Transaction["type"],
  occurredAt: string,
  quantity: number,
  amount: number,
  currency = "USD",
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
});

const valuation = (date: string, unitPrice: number, currency = "USD"): AssetValuation => ({
  id: `v-${date}`,
  assetId: "a",
  valuationDate: date,
  unitPrice,
  totalValue: 0,
  currency,
  source: "test",
  isManual: false,
});

const buys = [
  tx("1", "buy", "2025-01-10T12:00:00.000Z", 10, 1000),
  tx("2", "buy", "2025-06-10T12:00:00.000Z", 10, 1200),
];

const run = (transactions: Transaction[], valuations: AssetValuation[]) =>
  assetPerformance({
    assetType: "etf",
    transactions,
    valuations,
    nativeCurrency: "USD",
    reportingCurrency: "EUR",
    fxTable: table,
    asOf: "2025-06-30",
  });

describe("Performance :: Asset", () => {
  it("Exemplo A: posição aberta em USD reportada em EUR", () => {
    const p = run(buys, [valuation("2025-06-30", 130)]);

    expect(p.isMultiCurrency).toBe(true);
    expect(p.quantity).toBe(20);
    // 1000/1.1 + 1200/1.05
    expect(p.reported.investedCapital).toBeCloseTo(2051.95, 2);
    expect(p.reported.grossContributions).toBeCloseTo(2051.95, 2);
    expect(p.reported.currentValue).toBeCloseTo(2407.41, 2); // 2600 USD / 1.08
    expect(p.reported.realizedGain).toBe(0);
    expect(p.reported.unrealizedGain).toBeCloseTo(355.46, 2);
    expect(p.reported.totalGain).toBeCloseTo(355.46, 2);
    expect(p.reported.returnPct!).toBeCloseTo(0.1732, 3);

    // Plano nativo permanece em USD, sem qualquer conversão.
    expect(p.native.currency).toBe("USD");
    expect(p.native.investedCapital).toBe(2200);
    expect(p.native.currentValue).toBe(2600);
    expect(p.native.unrealizedGain).toBe(400);
  });

  it("Exemplo B: alienação parcial mantém o custo médio das unidades saídas", () => {
    const p = run(
      [...buys, tx("3", "sell", "2025-06-20T12:00:00.000Z", 10, 1400)],
      [valuation("2025-06-30", 130)],
    );

    expect(p.reported.realizedGain).toBeCloseTo(294.77, 1);
    expect(p.reported.investedCapital).toBeCloseTo(1025.98, 1);
    expect(p.reported.currentValue).toBeCloseTo(1203.7, 2); // 1300 USD / 1.08
    expect(p.reported.unrealizedGain).toBeCloseTo(177.72, 1);
    expect(p.reported.capitalGain).toBeCloseTo(472.49, 1);
    // Denominador continua a ser o capital aplicado bruto.
    expect(p.reported.grossContributions).toBeCloseTo(2051.95, 2);
    expect(p.reported.returnPct!).toBeCloseTo(0.2303, 2);
  });

  it("Exemplo C: rendimentos entram no ganho total mas não no capital investido", () => {
    const p = run(
      [
        ...buys,
        tx("3", "sell", "2025-06-20T12:00:00.000Z", 10, 1400),
        tx("4", "dividend", "2025-06-25T12:00:00.000Z", 0, 50),
      ],
      [valuation("2025-06-30", 130)],
    );

    expect(p.reported.income).toBeCloseTo(46.73, 2);
    expect(p.reported.capitalGain).toBeCloseTo(472.49, 1);
    expect(p.reported.totalGain).toBeCloseTo(519.22, 1);
    expect(p.reported.investedCapital).toBeCloseTo(1025.98, 1);
    expect(p.reported.returnPct!).toBeCloseTo(0.2531, 2);
  });

  it("posição totalmente alienada: capital investido zero e rentabilidade definida", () => {
    const p = run([...buys, tx("3", "sell", "2025-06-20T12:00:00.000Z", 20, 2600)], []);

    expect(p.quantity).toBe(0);
    expect(p.reported.investedCapital).toBe(0);
    expect(p.reported.realizedGain).toBeCloseTo(2452.83 - 2051.95, 1);
    expect(p.reported.grossContributions).toBeCloseTo(2051.95, 2);
    expect(p.reported.unrealizedGain).toBeNull();
  });

  it("sem valorizações: não há mais-valia não realizada observável", () => {
    const p = run(buys, []);
    expect(p.valueSource).toBe("cost");
    expect(p.reported.unrealizedGain).toBeNull();
    expect(p.reported.totalGain).toBeNull();
    expect(p.reported.returnPct).toBeNull();
  });

  it("valorização histórica compara com a posição À DATA dessa valorização", () => {
    const p = run(
      [...buys, tx("3", "buy", "2025-06-28T12:00:00.000Z", 5, 700)],
      [valuation("2025-06-10", 110)],
    );
    // Referência a 10/06: 20 unidades × 110 USD, custo apenas das duas primeiras compras.
    expect(p.valueAsOf).toBe("2025-06-10");
    expect(p.native.currentValue).toBe(2200);
    expect(p.native.unrealizedGain).toBe(0);
    // Capital investido é o atual (inclui a compra de 28/06).
    expect(p.native.investedCapital).toBe(2900);
  });

  it("taxa em falta: moeda sinalizada e totais de reporting parciais", () => {
    const p = assetPerformance({
      assetType: "etf",
      transactions: [tx("1", "buy", "2025-01-10T12:00:00.000Z", 10, 1000, "JPY")],
      valuations: [],
      nativeCurrency: "JPY",
      reportingCurrency: "EUR",
      fxTable: table,
      asOf: "2025-06-30",
    });
    expect(p.missingCurrencies).toEqual(["JPY"]);
    expect(p.reported.investedCapital).toBe(0);
    expect(p.native.investedCapital).toBe(1000);
  });

  it("moeda única: os dois planos coincidem e não há aviso cambial", () => {
    const p = assetPerformance({
      assetType: "etf",
      transactions: [tx("1", "buy", "2025-01-10T12:00:00.000Z", 10, 1000, "EUR")],
      valuations: [valuation("2025-06-30", 120, "EUR")],
      nativeCurrency: "EUR",
      reportingCurrency: "EUR",
      asOf: "2025-06-30",
    });
    expect(p.isMultiCurrency).toBe(false);
    expect(p.reported.currentValue).toBe(1200);
    expect(p.reported.unrealizedGain).toBe(200);
    expect(p.reported.returnPct).toBeCloseTo(0.2, 6);
  });
});
