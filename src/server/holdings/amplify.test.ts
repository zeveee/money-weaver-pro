/**
 * IvestWise :: Amplify Holdings Provider — teste de integração (rede real)
 *
 * Bate na fonte oficial (página + Firestore público da Amplify). Valida que
 * obtemos a carteira COMPLETA do BLOK, não só o Top 10.
 */

import { describe, expect, it } from "vitest";
import { clearHoldingsCache, getHoldings } from "./registry";

const TIMEOUT = 60_000;

describe("amplify holdings :: BLOK", () => {
  it(
    "obtém a carteira completa a partir da fonte oficial",
    async () => {
      clearHoldingsCache();
      const res = await getHoldings({ ticker: "BLOK", issuer: "Amplify" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const snap = res.data;
      expect(snap.sourceProvider).toBe("amplify");
      expect(snap.sourceUrl).toBe("https://amplifyetfs.com/blok-holdings/");
      expect(snap.fundName).toBe("Amplify Blockchain Technology ETF");
      expect(snap.fundIsin).toBe("US0321086078");
      expect(snap.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Objetivo da integração: ultrapassar o Top 10.
      expect(snap.holdings.length).toBeGreaterThan(10);

      const names = snap.holdings.map((h) => h.holdingName.toLowerCase());
      for (const expected of ["robinhood", "galaxy digital", "advanced micro devices"]) {
        expect(names.some((n) => n.includes(expected))).toBe(true);
      }

      // Normalização: pesos plausíveis e campos numéricos tipados.
      const total = snap.holdings.reduce((s, h) => s + (h.weightPercent ?? 0), 0);
      expect(total).toBeGreaterThan(80);
      expect(total).toBeLessThan(120);

      const withTicker = snap.holdings.find((h) => h.holdingTicker !== null);
      expect(withTicker?.shares).toBeTypeOf("number");
      expect(withTicker?.marketValue).toBeTypeOf("number");
      expect(withTicker?.currency).toBe("USD");
    },
    TIMEOUT,
  );

  it(
    "devolve not_found para um ticker que não é da Amplify",
    async () => {
      clearHoldingsCache();
      const res = await getHoldings({ ticker: "ZZZZ", issuer: "Amplify" });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.reason).toBe("not_found");
    },
    TIMEOUT,
  );

  it("devolve not_found para um emissor sem provider", async () => {
    const res = await getHoldings({ ticker: "NATO", issuer: "HANetf" });
    expect(res.ok).toBe(false);
  });
});
