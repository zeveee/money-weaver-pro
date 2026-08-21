import { describe, expect, it } from "vitest";
import { holdingsComposition } from "./holdings-composition";
import { UNCLASSIFIED_LABEL } from "./portfolio-composition";

const cls = (m: Record<string, { sector: string | null; country: string | null }>) =>
  new Map(Object.entries(m));

describe("holdingsComposition", () => {
  it("agrega pesos por setor e soma 100% da base publicada", () => {
    const out = holdingsComposition({
      holdings: [
        { holdingKey: "A", weightPercent: 50 },
        { holdingKey: "B", weightPercent: 30 },
        { holdingKey: "C", weightPercent: 20 },
      ],
      classificationByHolding: cls({
        A: { sector: "Technology", country: "United States" },
        B: { sector: "Technology", country: "Canada" },
        C: { sector: "Finance", country: "United States" },
      }),
      dimension: "sector",
    });
    expect(out.map((s) => [s.allocationName, s.percentage])).toEqual([
      ["Technology", 80],
      ["Finance", 20],
    ]);
  });

  it("holdings sem classificação caem em Não classificado", () => {
    const out = holdingsComposition({
      holdings: [
        { holdingKey: "A", weightPercent: 60 },
        { holdingKey: "CASH", weightPercent: 40 },
      ],
      classificationByHolding: cls({ A: { sector: null, country: "United States" } }),
      dimension: "geography",
    });
    expect(out).toEqual([
      expect.objectContaining({ allocationName: "United States", percentage: 60 }),
      expect.objectContaining({ allocationName: UNCLASSIFIED_LABEL, percentage: 40 }),
    ]);
  });

  it("sem pesos utilizáveis devolve vazio", () => {
    expect(
      holdingsComposition({
        holdings: [{ holdingKey: "A", weightPercent: null }],
        classificationByHolding: new Map(),
        dimension: "sector",
      }),
    ).toEqual([]);
  });
});
