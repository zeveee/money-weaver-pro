import { describe, expect, it } from "vitest";
import type { ExchangeRate } from "@/domain/types";
import { buildRateTable, EMPTY_RATE_TABLE } from "@/services/fx";
import {
  convertEntry,
  entryMatches,
  grossEntry,
  readEntry,
  withEntry,
  type TransactionEntry,
} from "@/services/transaction-entry";

const rate = (base: string, quote: string, date: string, value: number): ExchangeRate => ({
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
  rate("EUR", "GBP", "2024-01-05", 0.9),
]);

const input = (over: Partial<Parameters<typeof convertEntry>[1]> = {}) => ({
  amount: 170,
  currency: "EUR",
  fees: 2,
  taxes: 1,
  occurredAt: "2024-01-05T10:00:00.000Z",
  ...over,
});

const now = () => "2024-06-01T00:00:00.000Z";

describe("convertEntry", () => {
  it("não converte quando a moeda de introdução é a do ativo", () => {
    const r = convertEntry(table, input({ currency: "USD" }), "USD", { now });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.entry).toBeNull();
    expect(r.native).toEqual({ amount: 170, fees: 2, taxes: 1, currency: "USD" });
  });

  it("converte montante, comissões e impostos pela MESMA taxa (direta)", () => {
    const r = convertEntry(table, input(), "USD", { now });
    if (r.status !== "ok") throw new Error("esperava ok");
    expect(r.native.amount).toBeCloseTo(204, 10);
    expect(r.native.fees).toBeCloseTo(2.4, 10);
    expect(r.native.taxes).toBeCloseTo(1.2, 10);
    expect(r.entry).toMatchObject({ currency: "EUR", rate: 1.2, path: "direct", source: "ecb" });
  });

  it("resolve o sentido inverso", () => {
    const r = convertEntry(table, input({ currency: "USD" }), "EUR", { now });
    if (r.status !== "ok") throw new Error("esperava ok");
    expect(r.entry?.path).toBe("inverse");
    expect(r.native.amount).toBeCloseTo(170 / 1.2, 10);
  });

  it("triangula via EUR", () => {
    const r = convertEntry(table, input({ currency: "USD" }), "GBP", { now });
    if (r.status !== "ok") throw new Error("esperava ok");
    expect(r.entry?.path).toBe("triangulated");
    expect(r.native.amount).toBeCloseTo((170 / 1.2) * 0.9, 10);
  });

  it("usa carry-forward da última taxa conhecida", () => {
    const r = convertEntry(table, input({ occurredAt: "2024-01-04T09:00:00.000Z" }), "USD", { now });
    if (r.status !== "ok") throw new Error("esperava ok");
    expect(r.entry).toMatchObject({ rate: 1.1, rateDate: "2024-01-02", carriedForward: true });
  });

  it("falha explicitamente quando não há taxa para a data", () => {
    const r = convertEntry(table, input({ occurredAt: "2023-12-01T00:00:00.000Z" }), "USD", { now });
    expect(r).toEqual({ status: "missing", from: "EUR", to: "USD", date: "2023-12-01" });
  });

  it("aceita taxa manual de recurso quando não há catálogo", () => {
    const r = convertEntry(EMPTY_RATE_TABLE, input(), "USD", { manualRate: 1.17, now });
    if (r.status !== "ok") throw new Error("esperava ok");
    expect(r.entry).toMatchObject({ rate: 1.17, source: "manual" });
    expect(r.native.amount).toBeCloseTo(198.9, 10);
  });

  it("congela a taxa: uma correção posterior do BCE não altera a transação", () => {
    const first = convertEntry(table, input(), "USD", { now });
    if (first.status !== "ok" || !first.entry) throw new Error("esperava conversão");

    const corrected = buildRateTable([rate("EUR", "USD", "2024-01-05", 1.9)]);
    const again = convertEntry(corrected, input(), "USD", { frozen: first.entry, now });
    if (again.status !== "ok") throw new Error("esperava ok");
    expect(again.frozen).toBe(true);
    expect(again.entry?.rate).toBe(1.2);
    expect(again.native.amount).toBeCloseTo(204, 10);
  });

  it("recalcula quando o utilizador edita o montante", () => {
    const first = convertEntry(table, input(), "USD", { now });
    if (first.status !== "ok" || !first.entry) throw new Error("esperava conversão");
    const corrected = buildRateTable([rate("EUR", "USD", "2024-01-05", 1.9)]);
    const again = convertEntry(corrected, input({ amount: 200 }), "USD", {
      frozen: first.entry,
      now,
    });
    if (again.status !== "ok") throw new Error("esperava ok");
    expect(again.frozen).toBe(false);
    expect(again.entry?.rate).toBe(1.9);
  });

  it("recalcula quando o utilizador edita APENAS a data", () => {
    const first = convertEntry(table, input(), "USD", { now });
    if (first.status !== "ok" || !first.entry) throw new Error("esperava conversão");
    expect(first.entry.entryDate).toBe("2024-01-05");

    const again = convertEntry(table, input({ occurredAt: "2024-01-02T10:00:00.000Z" }), "USD", {
      frozen: first.entry,
      now,
    });
    if (again.status !== "ok") throw new Error("esperava ok");
    expect(again.frozen).toBe(false);
    expect(again.entry).toMatchObject({ rate: 1.1, rateDate: "2024-01-02", entryDate: "2024-01-02" });
    expect(again.native.amount).toBeCloseTo(187, 10);
  });

  it("snapshot legado sem entryDate é reconstruído ao mudar a data", () => {
    const legacy = readEntry({
      entry: {
        amount: 170,
        currency: "EUR",
        fees: 2,
        taxes: 1,
        rate: 1.2,
        rateDate: "2024-01-05",
        path: "direct",
        carriedForward: false,
        source: "ecb",
        convertedAt: now(),
      },
    });
    expect(legacy?.entryDate).toBe("");

    const kept = convertEntry(table, input(), "USD", { frozen: legacy, now });
    if (kept.status !== "ok") throw new Error("esperava ok");
    expect(kept.frozen).toBe(true);

    const moved = convertEntry(table, input({ occurredAt: "2024-01-02T10:00:00.000Z" }), "USD", {
      frozen: legacy,
      now,
    });
    if (moved.status !== "ok") throw new Error("esperava ok");
    expect(moved.frozen).toBe(false);
    expect(moved.entry?.rate).toBe(1.1);
  });
});

describe("metadados", () => {
  const entry: TransactionEntry = {
    amount: 170,
    currency: "EUR",
    fees: 0,
    taxes: 0,
    rate: 1.1712,
    entryDate: "2024-01-05",
    rateDate: "2024-01-05",
    path: "direct",
    carriedForward: false,
    source: "ecb",
    convertedAt: now(),
  };


  it("escreve e lê a introdução original", () => {
    const meta = withEntry({ incomeKind: "dividend" }, entry);
    expect(readEntry(meta)).toEqual(entry);
    expect(readEntry(withEntry(meta, null))).toBeNull();
  });

  it("ignora metadados malformados", () => {
    expect(readEntry({ entry: { amount: "x", currency: "EUR", rate: 1 } })).toBeNull();
    expect(readEntry({ entry: { amount: 1, currency: "EUR", rate: 0 } })).toBeNull();
    expect(readEntry(null)).toBeNull();
  });

  it("bruto e correspondência de introdução", () => {
    expect(grossEntry({ amount: 170, fees: 2, taxes: 1 })).toBe(173);
    expect(entryMatches(entry, { ...input(), fees: 0, taxes: 0 })).toBe(true);
    expect(entryMatches(entry, { ...input(), currency: "USD", fees: 0, taxes: 0 })).toBe(false);
  });
});
