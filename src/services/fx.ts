/**
 * IvestWise :: Conversão cambial (serviço puro)
 *
 * Sem I/O. Recebe um catálogo de taxas já carregado e resolve conversões
 * entre quaisquer duas moedas, sempre à data do evento.
 *
 * Regras (ver plano "Arquitetura Multi-Currency"):
 *  - Moeda pivô EUR: qualquer par A→B resolve-se por triangulação A→EUR→B.
 *  - Carry-forward: usa-se a taxa mais recente com data <= data do evento.
 *    Nunca se usa uma taxa futura para converter um evento passado.
 *  - Sem taxa anterior disponível → resultado `missing`, nunca 1 silencioso.
 *  - Arredondamento apenas na apresentação (ver src/lib/number-format.ts).
 */

import type { ExchangeRate, ISODate, ISODateTime } from "@/domain/types";

/** Moeda pivô interna. Alinhada com a futura sincronização de taxas do BCE. */
export const PIVOT_CURRENCY = "EUR";

/** Um montante nunca circula sem a sua moeda. */
export interface Money {
  amount: number;
  currency: string;
}

export const money = (amount: number, currency: string): Money => ({ amount, currency });

export type FxPath = "identity" | "direct" | "inverse" | "triangulated";

export interface FxRate {
  /** Fator multiplicativo: `amount(from) × rate = amount(to)`. */
  rate: number;
  /** Data efetiva da taxa usada (pode ser anterior à data pedida). */
  rateDate: ISODate;
  path: FxPath;
  /** Verdadeiro quando a taxa é anterior à data pedida (carry-forward). */
  carriedForward: boolean;
}

export type FxResolution =
  | ({ status: "ok" } & FxRate)
  | { status: "missing"; from: string; to: string; date: ISODate };

export type FxConversion =
  | { status: "ok"; money: Money; source: Money; rate: FxRate }
  | { status: "missing"; source: Money; to: string; date: ISODate };

/** Catálogo indexado: par → observações ordenadas por data descendente. */
export interface FxRateTable {
  readonly pairs: ReadonlyMap<string, readonly { date: ISODate; rate: number }[]>;
}

const key = (from: string, to: string) => `${from.toUpperCase()}>${to.toUpperCase()}`;

/** Normaliza uma data (aceita ISODate ou ISODateTime) para YYYY-MM-DD. */
export const toRateDate = (d: ISODate | ISODateTime): ISODate => d.slice(0, 10);

/**
 * Indexa as taxas para lookup O(log n) por par.
 * Cada par é guardado apenas no sentido em que foi observado; o sentido
 * inverso é derivado em `rateAt`, evitando duplicação no catálogo.
 */
export function buildRateTable(rates: ExchangeRate[]): FxRateTable {
  const pairs = new Map<string, { date: ISODate; rate: number }[]>();
  for (const r of rates) {
    const value = Number(r.exchangeRate);
    if (!Number.isFinite(value) || value <= 0) continue;
    const k = key(r.baseCurrency, r.quoteCurrency);
    const list = pairs.get(k) ?? [];
    list.push({ date: toRateDate(r.date), rate: value });
    pairs.set(k, list);
  }
  for (const list of pairs.values()) {
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  return { pairs };
}

export const EMPTY_RATE_TABLE: FxRateTable = { pairs: new Map() };

/** Observação mais recente do par com data <= `date` (ou a mais recente de todas). */
function observe(
  table: FxRateTable,
  from: string,
  to: string,
  date: ISODate | null,
): { date: ISODate; rate: number } | null {
  const list = table.pairs.get(key(from, to));
  if (!list || list.length === 0) return null;
  if (date == null) return list[0];
  for (const entry of list) {
    if (entry.date <= date) return entry;
  }
  return null;
}

/**
 * Resolve a taxa `from → to` na data indicada.
 * @param date `null` = taxa mais recente disponível (usado no "valor atual").
 */
export function rateAt(
  table: FxRateTable,
  from: string,
  to: string,
  date: ISODate | ISODateTime | null,
): FxResolution {
  const f = (from || "").toUpperCase();
  const t = (to || "").toUpperCase();
  const on = date == null ? null : toRateDate(date);
  const asked = on ?? "latest";

  if (!f || !t) return { status: "missing", from: f, to: t, date: asked };
  if (f === t) {
    return {
      status: "ok",
      rate: 1,
      rateDate: on ?? toRateDate(new Date().toISOString()),
      path: "identity",
      carriedForward: false,
    };
  }

  const direct = observe(table, f, t, on);
  if (direct) {
    return {
      status: "ok",
      rate: direct.rate,
      rateDate: direct.date,
      path: "direct",
      carriedForward: on != null && direct.date < on,
    };
  }

  const inverse = observe(table, t, f, on);
  if (inverse && inverse.rate !== 0) {
    return {
      status: "ok",
      rate: 1 / inverse.rate,
      rateDate: inverse.date,
      path: "inverse",
      carriedForward: on != null && inverse.date < on,
    };
  }

  // Triangulação via moeda pivô: from → EUR → to.
  if (f !== PIVOT_CURRENCY && t !== PIVOT_CURRENCY) {
    const legA = rateAt(table, f, PIVOT_CURRENCY, on);
    const legB = rateAt(table, PIVOT_CURRENCY, t, on);
    if (legA.status === "ok" && legB.status === "ok") {
      return {
        status: "ok",
        rate: legA.rate * legB.rate,
        // A data efetiva é a mais antiga das duas pernas (a mais conservadora).
        rateDate: legA.rateDate < legB.rateDate ? legA.rateDate : legB.rateDate,
        path: "triangulated",
        carriedForward: legA.carriedForward || legB.carriedForward,
      };
    }
  }

  return { status: "missing", from: f, to: t, date: asked };
}

/**
 * Converte um montante para a moeda indicada, à data do evento.
 * @param date `null` = taxa mais recente disponível.
 */
export function convert(
  table: FxRateTable,
  source: Money,
  to: string,
  date: ISODate | ISODateTime | null,
): FxConversion {
  const resolution = rateAt(table, source.currency, to, date);
  if (resolution.status === "missing") {
    return { status: "missing", source, to: (to || "").toUpperCase(), date: resolution.date };
  }
  const { status: _s, ...rate } = resolution;
  return {
    status: "ok",
    source,
    money: { amount: source.amount * rate.rate, currency: (to || "").toUpperCase() },
    rate,
  };
}

/** Conversão em modo "melhor esforço": devolve `null` quando não há taxa. */
export function convertAmount(
  table: FxRateTable,
  source: Money,
  to: string,
  date: ISODate | ISODateTime | null,
): number | null {
  const c = convert(table, source, to, date);
  return c.status === "ok" ? c.money.amount : null;
}

/** Moedas para as quais falta taxa num conjunto de eventos. */
export function missingCurrencies(
  table: FxRateTable,
  events: { currency: string; date: ISODate | ISODateTime }[],
  to: string,
): string[] {
  const missing = new Set<string>();
  for (const e of events) {
    if (rateAt(table, e.currency, to, e.date).status === "missing") {
      missing.add((e.currency || "").toUpperCase());
    }
  }
  return [...missing].sort();
}
