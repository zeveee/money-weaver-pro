import { describe, it } from "vitest";
import { getHoldings } from "@/server/holdings/registry";
import { matchHoldings } from "@/server/securities/matcher";
import { createMemorySecurityStore } from "@/server/securities/store";

describe("BLOK classification", () => {
  it("classifica setor/país", async () => {
    const res = await getHoldings({ ticker: "BLOK", issuer: "Amplify", name: "Amplify BLOK", isin: null });
    if (!res.ok) throw new Error(res.message);
    const m = await matchHoldings(res.data.holdings, { store: createMemorySecurityStore() });
    let sec = 0, ctry = 0;
    for (const x of m.matches) {
      if (x.security?.sector) sec++;
      if (x.security?.country) ctry++;
      console.log(String(x.status).padEnd(13), (x.security?.ticker ?? "-").padEnd(8), (x.security?.sector ?? "—").padEnd(22), x.security?.country ?? "—");
    }
    console.log("total", m.matches.length, "identificadas", m.summary.identified, "com setor", sec, "com país", ctry, "erro", m.classificationError);
  }, 180_000);
});
