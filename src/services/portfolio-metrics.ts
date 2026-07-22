/**
 * IvestWise :: Serviço financeiro puro
 *
 * Toda a lógica financeira vive aqui. Funções puras, sem I/O e sem
 * dependências de Supabase ou React. Testáveis isoladamente.
 *
 * NOTA: Este ficheiro contém apenas as primitivas base. Cálculos mais
 * avançados (TWR, MWR/IRR, Sharpe, VaR, etc.) serão adicionados em
 * ficheiros irmãos (ex.: performance.ts, risk.ts) para manter cada
 * módulo focado.
 */

import type {
  Asset,
  Liability,
  Transaction,
} from "@/domain/types";

// ---------- Posições / mark-to-market ----------

export function assetMarketValue(asset: Asset): number {
  if (asset.currentValue != null) return asset.currentValue;
  return asset.quantity * asset.averageCost;
}

export function assetCostBasis(asset: Asset): number {
  return asset.quantity * asset.averageCost;
}

export function assetUnrealizedPnL(asset: Asset): number {
  return assetMarketValue(asset) - assetCostBasis(asset);
}

// ---------- Totais de carteira ----------

export function totalAssets(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + assetMarketValue(a), 0);
}

export function totalLiabilities(liabilities: Liability[]): number {
  return liabilities.reduce((sum, l) => sum + l.outstandingBalance, 0);
}

export function netWorth(assets: Asset[], liabilities: Liability[]): number {
  return totalAssets(assets) - totalLiabilities(liabilities);
}

export function allocationByType(assets: Asset[]): Record<string, number> {
  const total = totalAssets(assets);
  if (total === 0) return {};
  const buckets: Record<string, number> = {};
  for (const a of assets) {
    buckets[a.type] = (buckets[a.type] ?? 0) + assetMarketValue(a);
  }
  for (const k of Object.keys(buckets)) buckets[k] = buckets[k] / total;
  return buckets;
}

// ---------- Transações ----------

export function recomputeAverageCost(transactions: Transaction[]): {
  quantity: number;
  averageCost: number;
} {
  let qty = 0;
  let cost = 0;
  for (const t of transactions) {
    if (t.type === "buy") {
      const newQty = qty + t.quantity;
      cost = newQty === 0 ? 0 : (cost * qty + t.quantity * t.unitPrice) / newQty;
      qty = newQty;
    } else if (t.type === "sell") {
      qty = Math.max(0, qty - t.quantity);
      if (qty === 0) cost = 0;
    }
  }
  return { quantity: qty, averageCost: cost };
}
