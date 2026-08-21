/**
 * IvestWise :: Seleção por contexto — testes puros (sem rede).
 */

import { describe, expect, it } from "vitest";
import { selectCandidate } from "./select";
import type { SecurityRecord } from "./types";

const sec = (p: Partial<SecurityRecord>): SecurityRecord => ({
  id: p.figi ?? crypto.randomUUID(),
  figi: null,
  compositeFigi: null,
  shareClassFigi: null,
  name: null,
  ticker: null,
  isin: null,
  cusip: null,
  sedol: null,
  exchange: null,
  currency: null,
  securityType: null,
  marketSector: null,
  source: "openfigi",
  sector: null,
  industry: null,
  country: null,
  classificationSource: null,
  ...p,
});

describe("selectCandidate", () => {
  const eur = sec({
    figi: "BBG0000EUR1",
    compositeFigi: "BBG0000EUR1",
    name: "WisdomTree Europe Defence UCITS ETF EUR",
    ticker: "WDEF",
    exchange: "GY",
    currency: "EUR",
  });
  const usd = sec({
    figi: "BBG0000USD1",
    compositeFigi: "BBG0000USD1",
    name: "WisdomTree Europe Defence UCITS ETF USD",
    ticker: "WDFN",
    exchange: "LN",
    currency: "USD",
  });

  it("desempata dois candidatos com o mesmo ISIN pela moeda", () => {
    const out = selectCandidate(
      { name: "WisdomTree Europe Defence UCITS ETF", ticker: null, currency: "USD" },
      [eur, usd],
    );
    expect(out.status).toBe("identified");
    expect(out.security?.figi).toBe("BBG0000USD1");

    const other = selectCandidate(
      { name: "WisdomTree Europe Defence UCITS ETF", ticker: null, currency: "EUR" },
      [eur, usd],
    );
    expect(other.security?.figi).toBe("BBG0000EUR1");
  });

  it("sem contexto que desempate, fica ambígua", () => {
    const out = selectCandidate(
      { name: "WisdomTree Europe Defence UCITS ETF", ticker: null, currency: null },
      [eur, usd],
    );
    expect(out.status).toBe("ambiguous");
    expect(out.distinctCount).toBe(2);
  });

  it("moeda diferente não elimina um candidato válido único", () => {
    const only = sec({
      figi: "BBG000B9XRY4",
      compositeFigi: "BBG000B9XRY4",
      name: "Apple Inc",
      ticker: "AAPL",
      currency: "USD",
    });
    const out = selectCandidate(
      { name: "Apple Inc", ticker: "AAPL", currency: "GBP" },
      [only],
    );
    expect(out.status).toBe("identified");
    expect(out.security?.figi).toBe("BBG000B9XRY4");
  });

  it("várias linhas da mesma security contam como um candidato", () => {
    const primary = sec({
      figi: "BBG000B9XRY4",
      compositeFigi: "BBG000B9XRY4",
      name: "Apple Inc",
      ticker: "AAPL",
      exchange: "UW",
      currency: "USD",
    });
    const listing = sec({
      figi: "BBG000B9Y5X2",
      compositeFigi: "BBG000B9XRY4",
      name: "Apple Inc",
      ticker: "AAPL",
      exchange: "GY",
      currency: "EUR",
    });
    const out = selectCandidate(
      { name: "Apple Inc", ticker: "AAPL", currency: "USD" },
      [primary, listing],
    );
    expect(out.status).toBe("identified");
    expect(out.distinctCount).toBe(1);
  });

  it("sem candidatos, não identificada", () => {
    const out = selectCandidate({ name: "Cash & Other", ticker: null, currency: "USD" }, []);
    expect(out.status).toBe("unidentified");
  });
});
