import { describe, expect, it } from "vitest";
import type { AssetValuation, ExchangeRate, Transaction } from "@/domain/types";
import { buildRateTable } from "@/services/fx";
import { portfolioPerformance } from "@/services/portfolio-performance";

const rate = (base: string, quote: string, date: string, value: number): ExchangeRate => ({
  id: `${base}-${quote}-${date}`,
  date,
  baseCurrency: base,
  quoteCurrency: quote,
  exchangeRate: value,
  source: "test",
});

const table = buildRateTable([
  rate("EUR", "USD", "2025-01-10", 1.1),
  rate("EUR", "USD", "2025-06-10", 1.05),
  rate("EUR", "USD", "2025-06-30", 1.08),
]);

const tx = (
  id: string,
  assetId: string,
  type: Transaction["type"],
  occurredAt: string,
  quantity: number,
  amount: number,
  currency = "EUR",
): Transaction => ({
  id,
  assetId,
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

const valuation = (
  assetId: string,
  date: string,
  unitPrice: number,
  currency = "EUR",
): AssetValuation => ({
  id: `v-${assetId}-${date}`,
  assetId,
  valuationDate: date,
  unitPrice,
  totalValue: 0,
  currency,
  source: "test",
  isManual: false,
});

const run = (assets: Parameters<typeof portfolioPerformance>[0]["assets"]) =>
  portfolioPerformance({
    baseCurrency: "EUR",
    assets,
    fxTable: table,
    asOf: "2025-06-30",
  });

describe("Performance :: Portfolio", () => {
  it("carteira sem ativos devolve resultado vazio coerente", () => {
    const p = run([]);
    expect(p.currency).toBe("EUR");
    expect(p.investedCapital).toBe(0);
    expect(p.currentValue).toBeNull();
    expect(p.totalGain).toBeNull();
    expect(p.returnPct).toBeNull();
    expect(p.assetCount).toBe(0);
  });

  it("ativos sem transações não rebentam e não contam como parciais", () => {
    const p = run([
      { assetId: "a", assetType: "etf", nativeCurrency: "EUR", transactions: [], valuations: [] },
    ]);
    expect(p.assetCount).toBe(1);
    expect(p.assetsWithTransactions).toBe(0);
    expect(p.assetsMissingValue).toBe(0);
    expect(p.grossContributions).toBe(0);
    expect(p.returnPct).toBeNull();
  });

  it("agrega dois ativos e recalcula a rentabilidade sobre os totais", () => {
    const p = run([
      {
        assetId: "a",
        assetType: "etf",
        nativeCurrency: "EUR",
        transactions: [tx("1", "a", "buy", "2025-01-10T12:00:00.000Z", 10, 1000)],
        valuations: [valuation("a", "2025-06-30", 120)],
      },
      {
        assetId: "b",
        assetType: "etf",
        nativeCurrency: "EUR",
        transactions: [tx("2", "b", "buy", "2025-01-10T12:00:00.000Z", 10, 1000)],
        valuations: [valuation("b", "2025-06-30", 90)],
      },
    ]);

    expect(p.investedCapital).toBe(2000);
    expect(p.grossContributions).toBe(2000);
    expect(p.currentValue).toBe(2100);
    expect(p.unrealizedGain).toBe(100);
    expect(p.totalGain).toBe(100);
    // 100 / 2000 = 5 % — não é a média de +20 % e −10 %.
    expect(p.returnPct).toBeCloseTo(0.05, 6);
  });

  it("multi-moeda: converte cada ativo para a moeda base", () => {
    const p = run([
      {
        assetId: "a",
        assetType: "etf",
        nativeCurrency: "USD",
        transactions: [tx("1", "a", "buy", "2025-01-10T12:00:00.000Z", 10, 1100, "USD")],
        valuations: [valuation("a", "2025-06-30", 120, "USD")],
      },
    ]);
    expect(p.missingCurrencies).toEqual([]);
    expect(p.investedCapital).toBeCloseTo(1000, 6); // 1100 USD @1.1
    expect(p.currentValue).toBeCloseTo(1200 / 1.08, 6);
  });

  it("moeda em falta: sinalizada e totais parciais", () => {
    const p = run([
      {
        assetId: "a",
        assetType: "etf",
        nativeCurrency: "JPY",
        transactions: [tx("1", "a", "buy", "2025-01-10T12:00:00.000Z", 10, 1000, "JPY")],
        valuations: [],
      },
    ]);
    expect(p.missingCurrencies).toEqual(["JPY"]);
    expect(p.investedCapital).toBe(0);
  });

  it("ativo sem valorização: total parcial e contagem exposta", () => {
    const p = run([
      {
        assetId: "a",
        assetType: "etf",
        nativeCurrency: "EUR",
        transactions: [tx("1", "a", "buy", "2025-01-10T12:00:00.000Z", 10, 1000)],
        valuations: [valuation("a", "2025-06-30", 120)],
      },
      {
        assetId: "b",
        assetType: "etf",
        nativeCurrency: "EUR",
        transactions: [tx("2", "b", "buy", "2025-01-10T12:00:00.000Z", 10, 500)],
        valuations: [],
      },
    ]);
    expect(p.assetsWithoutValuation).toBe(1);
    expect(p.unrealizedGain).toBe(200);
    expect(p.grossContributions).toBe(1500);
  });

  it("grossContributions zero: returnPct é null (sem divisão por zero)", () => {
    const p = run([
      {
        assetId: "a",
        assetType: "etf",
        nativeCurrency: "EUR",
        transactions: [tx("1", "a", "dividend", "2025-06-10T12:00:00.000Z", 0, 50)],
        valuations: [],
      },
    ]);
    expect(p.grossContributions).toBe(0);
    expect(p.returnPct).toBeNull();
  });
});
