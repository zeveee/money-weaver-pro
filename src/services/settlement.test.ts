import { describe, expect, it } from "vitest";
import { buildRateTable } from "@/services/fx";
import { reportTransaction, reportedTransactionTotals } from "@/services/reporting";
import { readSettlement, effectiveRate } from "@/services/settlement";
import type { ExchangeRate, Transaction } from "@/domain/types";

const rates: ExchangeRate[] = [
  {
    id: "1",
    date: "2026-01-05",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    exchangeRate: 1.1,
    source: "ecb",
  },
];
const table = buildRateTable(rates);

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  assetId: "a1",
  type: "buy",
  occurredAt: "2026-01-05T10:00:00.000Z",
  quantity: 10,
  unitPrice: 100,
  amount: 1000,
  currency: "USD",
  fees: 0,
  taxes: 0,
  notes: null,
  metadata: {},
  recurringTransactionId: null,
  ...over,
});

describe("liquidação efetiva", () => {
  it("ignora liquidação em moeda diferente da de reporting", () => {
    expect(readSettlement({ settlement: { amount: 900, currency: "GBP" } }, "EUR")).toBeNull();
  });

  it("ignora liquidação malformada ou não positiva", () => {
    expect(readSettlement({ settlement: { amount: 0, currency: "EUR" } }, "EUR")).toBeNull();
    expect(readSettlement({ settlement: "900" }, "EUR")).toBeNull();
    expect(readSettlement({}, "EUR")).toBeNull();
  });

  it("deriva a taxa efetiva do montante liquidado", () => {
    expect(effectiveRate(900, 1000)).toBeCloseTo(0.9, 10);
    expect(effectiveRate(900, 0)).toBeNull();
  });

  it("mantém a taxa BCE quando não há liquidação", () => {
    const r = reportTransaction(table, tx(), "EUR");
    expect(r.source).toBe("ecb");
    expect(r.reported?.amount).toBeCloseTo(1000 / 1.1, 8);
  });

  it("sobrepõe a taxa BCE quando há liquidação", () => {
    const r = reportTransaction(
      table,
      tx({ metadata: { settlement: { amount: 920, currency: "EUR" } } }),
      "EUR",
    );
    expect(r.source).toBe("settlement");
    expect(r.reported?.amount).toBe(920);
    expect(r.rate?.rate).toBeCloseTo(0.92, 10);
  });

  it("aplica a taxa efetiva ao bruto (montante + custos)", () => {
    const r = reportTransaction(
      table,
      tx({ fees: 10, taxes: 5, metadata: { settlement: { amount: 1015, currency: "EUR" } } }),
      "EUR",
    );
    expect(r.rate?.rate).toBeCloseTo(1015 / 1015, 10);
    expect(r.reported?.amount).toBe(1015);
  });

  it("totais mistos: liquidação num evento, BCE noutro", () => {
    const totals = reportedTransactionTotals(
      table,
      [
        tx({ id: "a", metadata: { settlement: { amount: 920, currency: "EUR" } } }),
        tx({ id: "b" }),
      ],
      "EUR",
    );
    expect(totals.usedSettlement).toBe(true);
    expect(totals.inflows).toBeCloseTo(920 + 1000 / 1.1, 8);
    expect(totals.missingCurrencies).toEqual([]);
  });

  it("liquidação dispensa a taxa BCE em falta", () => {
    const totals = reportedTransactionTotals(
      buildRateTable([]),
      [tx({ metadata: { settlement: { amount: 920, currency: "EUR" } } })],
      "EUR",
    );
    expect(totals.missingCurrencies).toEqual([]);
    expect(totals.inflows).toBe(920);
  });
});
