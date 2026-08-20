/**
 * IvestWise :: Registry de holdings providers
 *
 * Ponto de entrada único: `getHoldings({ ticker, issuer })`. Adicionar um
 * emissor novo (HANetf, WisdomTree, iShares) é acrescentar o provider a
 * `HOLDINGS_PROVIDERS` — nenhum provider existente é tocado.
 *
 * Cache: em memória, por (provider, ticker), com TTL. As holdings mudam no
 * máximo uma vez por dia; a `asOfDate` da entrada em cache permite detetar
 * uma composição nova sem repetir pedidos durante o mesmo período.
 */

import { providerFail, type ProviderResult } from "../market-data/types";
import { amplifyHoldingsProvider } from "./providers/amplify";
import type { FundIdentity, HoldingsProvider, HoldingsSnapshot } from "./types";

export const HOLDINGS_PROVIDERS: HoldingsProvider[] = [amplifyHoldingsProvider];

const normalize = (s: string) => s.trim().toLowerCase();

export function providerForIssuer(issuer: string): HoldingsProvider | undefined {
  const wanted = normalize(issuer);
  return HOLDINGS_PROVIDERS.find((p) => p.issuers.some((i) => normalize(i) === wanted));
}

// ---------- Cache ----------

/** 6 horas: as holdings são publicadas no máximo uma vez por dia útil. */
const TTL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  snapshot: HoldingsSnapshot;
}

const cache = new Map<string, CacheEntry>();

const cacheKey = (provider: string, ticker: string) =>
  `${provider}:${ticker.trim().toUpperCase()}`;

export function clearHoldingsCache(): void {
  cache.clear();
}

export interface GetHoldingsOptions {
  /** Ignora a cache e vai sempre à fonte. */
  force?: boolean;
}

export async function getHoldings(
  fund: FundIdentity,
  options: GetHoldingsOptions = {},
): Promise<ProviderResult<HoldingsSnapshot>> {
  const provider = providerForIssuer(fund.issuer);
  if (!provider) {
    return providerFail("not_found", `Sem holdings provider para o emissor "${fund.issuer}"`);
  }

  const key = cacheKey(provider.name, fund.ticker);
  const hit = cache.get(key);
  if (!options.force && hit && hit.expiresAt > Date.now()) {
    return { ok: true, data: hit.snapshot };
  }

  const res = await provider.getHoldings(fund);
  if (res.ok) cache.set(key, { expiresAt: Date.now() + TTL_MS, snapshot: res.data });
  return res;
}
