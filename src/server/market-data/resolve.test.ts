import { describe, expect, it, vi } from "vitest";
import { writePricePoints } from "./resolve";
import type { AssetProviderLink } from "./types";

/**
 * `writePricePoints` é o único ponto de escrita de preços. O invariante
 * crítico: uma valorização MANUAL na mesma data nunca é sobreposta por dados
 * de fornecedor.
 */

const link: AssetProviderLink = {
  id: "link-1",
  assetId: "asset-1",
  provider: "eodhd",
  providerInstrumentId: "IWDA.AS",
  providerSymbol: "IWDA",
  providerExchange: "AS",
  providerCurrency: "EUR",
  status: "active",
  resolvedAt: "2026-01-01T00:00:00Z",
  lastVerifiedAt: null,
  lastSyncedDate: null,
};

function fakeDb(existing: { valuation_date: string; is_manual: boolean }[]) {
  const upserted: Record<string, unknown>[] = [];
  const select = {
    eq: () => select,
    in: () => Promise.resolve({ data: existing, error: null }),
  };
  const db = {
    from: () => ({
      select: () => select,
      upsert: (rows: Record<string, unknown>[]) => {
        upserted.push(...rows);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { db: db as never, upserted };
}

describe("writePricePoints", () => {
  it("escreve preços do fornecedor como derivados (is_manual = false)", async () => {
    const { db, upserted } = fakeDb([]);
    const res = await writePricePoints(
      db,
      link,
      [{ date: "2026-01-02", close: 99.5, currency: null }],
      "EUR",
    );

    expect(res).toEqual({ written: 1 });
    expect(upserted[0]).toMatchObject({
      asset_id: "asset-1",
      valuation_date: "2026-01-02",
      unit_price: 99.5,
      total_value: 0,
      currency: "EUR",
      source: "eodhd",
      is_manual: false,
    });
  });

  it("nunca sobrepõe uma valorização manual existente", async () => {
    const { db, upserted } = fakeDb([
      { valuation_date: "2026-01-02", is_manual: true },
      { valuation_date: "2026-01-03", is_manual: false },
    ]);

    const res = await writePricePoints(
      db,
      link,
      [
        { date: "2026-01-02", close: 99.5, currency: null },
        { date: "2026-01-03", close: 101, currency: null },
      ],
      "EUR",
    );

    expect(res).toEqual({ written: 1 });
    expect(upserted.map((r) => r["valuation_date"])).toEqual(["2026-01-03"]);
  });

  it("é inócuo com lista vazia", async () => {
    const { db, upserted } = fakeDb([]);
    expect(await writePricePoints(db, link, [], "EUR")).toEqual({ written: 0 });
    expect(upserted).toHaveLength(0);
  });
});

vi.stubGlobal("fetch", vi.fn());
