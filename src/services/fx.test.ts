import { describe, expect, it } from "vitest";
import type { ExchangeRate, Transaction } from "@/domain/types";
import {
  buildRateTable,
  convert,
  convertAmount,
  PIVOT_CURRENCY,
  rateAt,
} from "@/services/fx";
import { attributeFxPerformance, reportedTransactionTotals } from "@/services/reporting";

const rate = (
  base: string,
  quote: string,
  date: string,
  value: number,
): ExchangeRate => ({
  id: `${base}-${quote}-${date}`,
  date,
  baseCurrency: base,
  quoteCurrency: quote,
  exchangeRate: value,
  source: "test",
});

const table = buildRateTable([
  rate("EUR", "USD", "2024-01-02", 1.1),
  rate("EUR", "USD", "2024-01-05", 1.2),
  rate("EUR", "GBP", "2024-01-02", 0.85),
  rate("EUR", "GBP", "2024-01-05", 0.9),
]);

const tx = (
  id: string,
  type: Transaction["type"],
  occurredAt: string,
  amount: number,
  currency: string,
  extra: Partial<Transaction> = {},
): Transaction =>
  ({
    id,
    assetId: "a1",
    type,
    occurredAt,
    quantity: 0,
    unitPrice: 0,
    amount,
    currency,
    fees: 0,
    taxes: 0,
    notes: null,
    metadata: {},
    createdAt: occurredAt,
    updatedAt: occurredAt,
    recurringTransactionId: null,
    ...extra,
  }) as Transaction;

describe("fx :: resolução de taxas", () => {
  it("identidade não precisa de catálogo", () => {
    const r = rateAt(buildRateTable([]), "USD", "USD", "2024-01-01");
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.rate).toBe(1);
  });

  it("usa a taxa direta da data exata", () => {
    const r = rateAt(table, "EUR", "USD", "2024-01-05");
    expect(r).toMatchObject({ status: "ok", rate: 1.2, path: "direct", carriedForward: false });
  });

  it("carry-forward: usa a última taxa conhecida <= data", () => {
    const r = rateAt(table, "EUR", "USD", "2024-01-04");
    expect(r).toMatchObject({ status: "ok", rate: 1.1, rateDate: "2024-01-02", carriedForward: true });
  });

  it("nunca usa uma taxa futura", () => {
    expect(rateAt(table, "EUR", "USD", "2023-12-31").status).toBe("missing");
  });

  it("deriva o sentido inverso", () => {
    const r = rateAt(table, "USD", "EUR", "2024-01-05");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.path).toBe("inverse");
      expect(r.rate).toBeCloseTo(1 / 1.2, 12);
    }
  });

  it("tríangula via moeda pivô EUR", () => {
    const r = rateAt(table, "USD", "GBP", "2024-01-05");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.path).toBe("triangulated");
      expect(r.rate).toBeCloseTo(0.9 / 1.2, 12);
    }
    expect(PIVOT_CURRENCY).toBe("EUR");
  });

  it("data null devolve a taxa mais recente disponível", () => {
    const r = rateAt(table, "EUR", "USD", null);
    expect(r).toMatchObject({ status: "ok", rate: 1.2, rateDate: "2024-01-05" });
  });

  it("sinaliza a falta de taxa em vez de assumir 1", () => {
    const c = convert(table, { amount: 100, currency: "CHF" }, "EUR", "2024-01-05");
    expect(c.status).toBe("missing");
    expect(convertAmount(table, { amount: 100, currency: "CHF" }, "EUR", "2024-01-05")).toBeNull();
  });

  it("converte mantendo o montante nativo intacto", () => {
    const c = convert(table, { amount: 100, currency: "USD" }, "EUR", "2024-01-05");
    expect(c.status).toBe("ok");
    if (c.status === "ok") {
      expect(c.source).toEqual({ amount: 100, currency: "USD" });
      expect(c.money.amount).toBeCloseTo(100 / 1.2, 10);
      expect(c.money.currency).toBe("EUR");
    }
  });
});

describe("reporting :: conversão evento a evento", () => {
  it("cada transação usa a taxa da sua própria data", () => {
    const totals = reportedTransactionTotals(
      table,
      [
        tx("t1", "buy", "2024-01-02T12:00:00.000Z", 120, "USD"),
        tx("t2", "buy", "2024-01-05T12:00:00.000Z", 120, "USD"),
      ],
      "EUR",
    );
    // 120/1.1 + 120/1.2 — nunca (240) convertido a uma única taxa.
    expect(totals.inflows).toBeCloseTo(120 / 1.1 + 120 / 1.2, 10);
    expect(totals.investedCapital).toBeCloseTo(totals.inflows, 10);
    expect(totals.missingCurrencies).toEqual([]);
  });

  it("moeda sem taxa fica assinalada e não corrompe o total", () => {
    const totals = reportedTransactionTotals(
      table,
      [
        tx("t1", "buy", "2024-01-05T12:00:00.000Z", 120, "USD"),
        tx("t2", "buy", "2024-01-05T12:00:00.000Z", 500, "CHF"),
      ],
      "EUR",
    );
    expect(totals.inflows).toBeCloseTo(100, 10);
    expect(totals.missingCurrencies).toEqual(["CHF"]);
  });

  it("converte comissões e impostos à mesma taxa do evento", () => {
    const totals = reportedTransactionTotals(
      table,
      [tx("t1", "buy", "2024-01-05T12:00:00.000Z", 120, "USD", { fees: 6, taxes: 6 })],
      "EUR",
    );
    expect(totals.costs).toBeCloseTo(12 / 1.2, 10);
  });
});

describe("reporting :: atribuição cambial", () => {
  it("decompõe ganho do ativo, efeito cambial e termo cruzado", () => {
    // Custo 100 USD a 1 USD = 1 EUR; valor 110 USD a 1 USD = 0.8 EUR.
    const a = attributeFxPerformance(100, 110, 1, 0.8);
    expect(a.assetEffect).toBeCloseTo(10, 10);
    expect(a.currencyEffect).toBeCloseTo(-20, 10);
    expect(a.crossEffect).toBeCloseTo(-2, 10);
    // Ativo sobe em USD mas a posição perde em EUR.
    expect(a.total).toBeCloseTo(110 * 0.8 - 100 * 1, 10);
    expect(a.total).toBeLessThan(0);
  });
});
