import { describe, expect, it } from "vitest";
import type { Transaction } from "@/domain/types";
import { buildPosition, positionAt } from "./position-engine";

const tx = (
  id: string,
  type: Transaction["type"],
  occurredAt: string,
  quantity: number,
  amount: number,
): Transaction => ({
  id,
  assetId: "a",
  type,
  occurredAt,
  quantity,
  unitPrice: quantity > 0 ? amount / quantity : 0,
  amount,
  currency: "EUR",
  fees: 0,
  taxes: 0,
  notes: null,
  metadata: {},
  recurringTransactionId: null,
});

describe("Position Engine", () => {
  it("Exemplo 1: duas subscrições e um resgate parcial", () => {
    const p = buildPosition("fund", [
      tx("1", "buy", "2025-01-01T12:00:00.000Z", 100, 1000),
      tx("2", "buy", "2025-03-01T12:00:00.000Z", 100, 2000),
      tx("3", "sell", "2025-06-01T12:00:00.000Z", 50, 1500),
    ]);

    expect(p.quantity).toBe(150);
    expect(p.averageCost).toBe(15);
    expect(p.costBasis).toBe(2250);
    expect(p.realizedGain).toBe(750);
    expect(p.tracksQuantity).toBe(true);
  });

  it("Exemplo 2: a ordem cronológica altera o resultado", () => {
    const compraCompraVenda = buildPosition("etf", [
      tx("1", "buy", "2025-01-01T12:00:00.000Z", 100, 1000),
      tx("2", "buy", "2025-03-01T12:00:00.000Z", 100, 2000),
      tx("3", "sell", "2025-06-01T12:00:00.000Z", 50, 1500),
    ]);
    const compraVendaCompra = buildPosition("etf", [
      tx("1", "buy", "2025-01-01T12:00:00.000Z", 100, 1000),
      tx("3", "sell", "2025-02-01T12:00:00.000Z", 50, 1500),
      tx("2", "buy", "2025-03-01T12:00:00.000Z", 100, 2000),
    ]);

    expect(compraCompraVenda.realizedGain).toBe(750);
    // custo médio vigente na venda é 10 €, logo a mais-valia é maior
    expect(compraVendaCompra.realizedGain).toBe(1000);
    expect(compraVendaCompra.averageCost).toBeCloseTo(2500 / 150, 10);
    expect(compraCompraVenda.averageCost).toBe(15);
  });

  it("posição a uma data usa apenas eventos anteriores", () => {
    const history = [
      tx("1", "buy", "2025-01-01T12:00:00.000Z", 100, 1000),
      tx("2", "buy", "2025-03-01T12:00:00.000Z", 100, 2000),
      tx("3", "sell", "2025-06-01T12:00:00.000Z", 50, 1500),
    ];
    expect(positionAt("etf", history, "2025-02-01").quantity).toBe(100);
    expect(positionAt("etf", history, "2025-03-01").quantity).toBe(200);
    expect(positionAt("etf", history, "2025-12-31").quantity).toBe(150);
  });

  it("seguro Unit Linked usa unidades em reforços e resgates", () => {
    const opts = { unitBased: true };
    const p = buildPosition(
      "capitalization_insurance",
      [
        tx("1", "deposit", "2025-01-01T12:00:00.000Z", 100, 1000),
        tx("2", "withdrawal", "2025-06-01T12:00:00.000Z", 40, 600),
      ],
      opts,
    );
    expect(p.tracksQuantity).toBe(true);
    expect(p.quantity).toBe(60);
    expect(p.averageCost).toBe(10);
    expect(p.costBasis).toBe(600);
    expect(p.realizedGain).toBe(200);
  });

  it("seguro clássico continua sem unidades", () => {
    const p = buildPosition("capitalization_insurance", [
      tx("1", "deposit", "2025-01-01T12:00:00.000Z", 0, 1000),
      tx("2", "withdrawal", "2025-06-01T12:00:00.000Z", 0, 400),
    ]);
    expect(p.tracksQuantity).toBe(false);
    expect(p.quantity).toBe(0);
    expect(p.costBasis).toBe(600);
  });

  it("alienação sem quantidade é sinalizada e não corrompe a posição", () => {
    const p = buildPosition("etf", [
      tx("1", "buy", "2025-01-01T12:00:00.000Z", 100, 1000),
      tx("2", "sell", "2025-06-01T12:00:00.000Z", 0, 500),
    ]);
    expect(p.inconsistentTransactionIds).toEqual(["2"]);
    expect(p.quantity).toBe(100);
  });
});
