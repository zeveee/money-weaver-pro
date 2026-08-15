import { describe, expect, it } from "vitest";
import type { AssetAllocation } from "@/domain/types";
import {
  portfolioComposition,
  UNCLASSIFIED_LABEL,
} from "./portfolio-composition";

const alloc = (
  assetId: string,
  allocationType: AssetAllocation["allocationType"],
  allocationName: string,
  percentage: number,
): AssetAllocation => ({
  id: `${assetId}-${allocationName}`,
  assetId,
  allocationType,
  allocationName,
  percentage,
});

const sum = (slices: { percentage: number }[]) =>
  slices.reduce((s, x) => s + x.percentage, 0);

describe("portfolioComposition", () => {
  it("classificação completa numa dimensão", () => {
    const c = portfolioComposition({
      currentValueByAsset: { a: 1000 },
      allocations: [
        alloc("a", "sector", "Tecnologia", 70),
        alloc("a", "sector", "Saúde", 30),
      ],
      dimensions: ["sector"],
    });
    expect(c.sector.map((s) => s.allocationName)).toEqual(["Tecnologia", "Saúde"]);
    expect(c.sector[0].value).toBe(700);
    expect(sum(c.sector)).toBeCloseTo(100);
    expect(c.sector.some((s) => s.isUnclassified)).toBe(false);
  });

  it("ativo sem nenhuma classificação nessa dimensão", () => {
    const c = portfolioComposition({
      currentValueByAsset: { a: 500 },
      allocations: [alloc("a", "geography", "Europa", 100)],
      dimensions: ["sector"],
    });
    expect(c.sector).toEqual([
      {
        allocationName: UNCLASSIFIED_LABEL,
        value: 500,
        percentage: 100,
        isUnclassified: true,
      },
    ]);
  });

  it("ativo parcialmente classificado (60%)", () => {
    const c = portfolioComposition({
      currentValueByAsset: { a: 1000 },
      allocations: [alloc("a", "sector", "Tecnologia", 60)],
      dimensions: ["sector"],
    });
    expect(c.sector[0]).toMatchObject({ allocationName: "Tecnologia", value: 600 });
    expect(c.sector[1]).toMatchObject({
      allocationName: UNCLASSIFIED_LABEL,
      value: 400,
      isUnclassified: true,
    });
    expect(sum(c.sector)).toBeCloseTo(100);
  });

  it("não classificado fica sempre em último, mesmo sendo maior", () => {
    const c = portfolioComposition({
      currentValueByAsset: { a: 1000, b: 1000 },
      allocations: [alloc("a", "sector", "Tecnologia", 20)],
      dimensions: ["sector"],
    });
    expect(c.sector.at(-1)?.isUnclassified).toBe(true);
    expect(c.sector.at(-1)?.value).toBe(1800);
    expect(sum(c.sector)).toBeCloseTo(100);
  });

  it("dimensão sem nenhuma allocation → 100% não classificado", () => {
    const c = portfolioComposition({
      currentValueByAsset: { a: 300, b: 700 },
      allocations: [],
      dimensions: ["sector", "geography"],
    });
    for (const d of ["sector", "geography"] as const) {
      expect(c[d]).toHaveLength(1);
      expect(c[d][0].isUnclassified).toBe(true);
      expect(c[d][0].percentage).toBe(100);
      expect(c[d][0].value).toBe(1000);
    }
  });

  it("ativos sem valor são excluídos e total 0 devolve lista vazia", () => {
    const c = portfolioComposition({
      currentValueByAsset: { a: null, b: 400 },
      allocations: [alloc("b", "sector", "Energia", 100)],
      dimensions: ["sector"],
    });
    expect(c.sector).toHaveLength(1);
    expect(c.sector[0].value).toBe(400);

    const empty = portfolioComposition({
      currentValueByAsset: { a: null },
      allocations: [],
      dimensions: ["sector", "geography"],
    });
    expect(empty.sector).toEqual([]);
    expect(empty.geography).toEqual([]);
  });
});
