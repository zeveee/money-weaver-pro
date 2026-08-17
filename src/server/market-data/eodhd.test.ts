import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eodhdProvider } from "./providers/eodhd";

/**
 * Testes do provider EODHD: fronteira HTTP simulada. Validamos a NORMALIZAÇÃO
 * (o que atravessa a fronteira) e o mapeamento dos modos de falha.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env["EODHD_API_KEY"] = "test-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("eodhd identity", () => {
  it("prefere a correspondência exata de ISIN", async () => {
    fetchMock.mockResolvedValue(
      json([
        { Code: "OTHER", Exchange: "US", Name: "Other", ISIN: "US0000000000", Currency: "USD" },
        { Code: "IWDA", Exchange: "AS", Name: "iShares World", ISIN: "IE00B4L5Y983", Currency: "EUR" },
      ]),
    );

    const res = await eodhdProvider.identity!.resolveByIsin("IE00B4L5Y983");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.providerInstrumentId).toBe("IWDA.AS");
    expect(res.data.currency).toBe("EUR");
  });

  it("devolve not_found quando a pesquisa vem vazia", async () => {
    fetchMock.mockResolvedValue(json([]));
    const res = await eodhdProvider.identity!.resolveByIsin("XX0000000000");
    expect(res).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("distingue quota esgotada de chave inválida", async () => {
    fetchMock.mockResolvedValue(json({}, 402));
    expect(await eodhdProvider.identity!.resolveByIsin("A")).toMatchObject({ reason: "rate_limit" });

    fetchMock.mockResolvedValue(json({}, 401));
    expect(await eodhdProvider.identity!.resolveByIsin("A")).toMatchObject({ reason: "unauthorized" });
  });

  it("trata falha de rede sem lançar", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await eodhdProvider.identity!.resolveByIsin("A")).toMatchObject({ reason: "network" });
  });

  it("falha como unauthorized sem chave configurada", async () => {
    delete process.env["EODHD_API_KEY"];
    expect(await eodhdProvider.identity!.resolveByIsin("A")).toMatchObject({ reason: "unauthorized" });
  });
});

describe("eodhd pricing", () => {
  it("normaliza o preço em tempo real", async () => {
    fetchMock.mockResolvedValue(json({ code: "IWDA.AS", timestamp: 1717977600, close: 92.31 }));
    const res = await eodhdProvider.pricing!.getLatestPrice("IWDA.AS");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.close).toBe(92.31);
    expect(res.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("usa previousClose quando close vem em falta", async () => {
    fetchMock.mockResolvedValue(json({ date: "2026-01-05", close: "NA", previousClose: 10 }));
    const res = await eodhdProvider.pricing!.getLatestPrice("X.US");
    expect(res).toMatchObject({ ok: true, data: { close: 10, date: "2026-01-05" } });
  });

  it("prefere adjusted_close no histórico e ignora linhas inválidas", async () => {
    fetchMock.mockResolvedValue(
      json([
        { date: "2026-01-02", close: 100, adjusted_close: 99.5 },
        { date: null, close: 101 },
        { date: "2026-01-03", close: 102 },
      ]),
    );
    const res = await eodhdProvider.historicalPricing!.getHistoricalPrices("X.US", {
      from: "2026-01-01",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual([
      { date: "2026-01-02", close: 99.5, currency: null },
      { date: "2026-01-03", close: 102, currency: null },
    ]);
  });
});
