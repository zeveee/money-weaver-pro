/**
 * IvestWise :: Matching Holding → Security — teste de integração (rede real)
 *
 * BLOK (Amplify) → OpenFIGI. Usa a store em memória: valida o mecanismo de
 * matching e de cache sem depender de credenciais de service role.
 */

import { describe, expect, it } from "vitest";
import { clearHoldingsCache, getHoldings } from "../holdings/registry";
import { matchHoldings } from "./matcher";
import { createMemorySecurityStore } from "./store";

const TIMEOUT = 180_000;

describe("security master :: BLOK", () => {
  it(
    "identifica as holdings do BLOK via OpenFIGI",
    async () => {
      clearHoldingsCache();
      const res = await getHoldings({ ticker: "BLOK", issuer: "Amplify" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const store = createMemorySecurityStore();
      const out = await matchHoldings(res.data.holdings, { store, currency: "USD" });

      expect(out.matches.length).toBe(res.data.holdings.length);
      expect(
        out.summary.identified + out.summary.ambiguous + out.summary.unidentified,
      ).toBe(out.summary.total);
      expect(out.summary.identified).toBeGreaterThan(10);

      const lines = out.matches.map((m, i) => {
        const h = res.data.holdings[i]!;
        const sec = m.security;
        return `${m.status.padEnd(13)} ${(h.holdingTicker ?? "—").padEnd(8)} ${h.holdingName.slice(0, 34).padEnd(34)} ${sec ? `${sec.figi} ${sec.name ?? ""} (${m.matchedBy})` : (m.message ?? "")}`;
      });
      console.log(
        `\nBLOK :: ${out.summary.total} holdings — identificadas ${out.summary.identified}, ambíguas ${out.summary.ambiguous}, não identificadas ${out.summary.unidentified}\n${lines.join("\n")}`,
      );

      // Segunda passagem: tudo vem do Security Master (sem novas chamadas).
      const again = await matchHoldings(res.data.holdings, { store, currency: "USD" });
      expect(again.summary).toEqual(out.summary);
    },
    TIMEOUT,
  );
});
