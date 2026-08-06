/**
 * IvestWise :: Introdução de transações em moeda diferente da do ativo (serviço puro)
 *
 * Uma transação é um FACTO HISTÓRICO. O utilizador pode introduzi-la em
 * qualquer moeda, mas o que fica registado como facto é sempre o montante na
 * moeda nativa do ativo, convertido à taxa da data e CONGELADO na gravação.
 *
 *   170 EUR · 2,90 UP · 2026-08-01   →   taxa EUR→USD 1,1712   →   199,10 USD
 *
 * Garantias:
 *  - O Position Engine só vê moeda nativa (custo médio, mais-valias, XIRR).
 *  - A conversão nunca é recalculada por backfills ou correções do BCE: a taxa
 *    usada fica guardada em `transactions.metadata.entry` e é reutilizada
 *    enquanto montante, moeda, custos e data não forem editados.
 *  - Comissões e impostos convertem-se pela MESMA taxa do montante.
 */

import type { ISODate, ISODateTime } from "@/domain/types";
import { rateAt, toRateDate, type FxPath, type FxRateTable } from "@/services/fx";

/** Origem da taxa congelada na transação. */
export type EntryRateSource = "ecb" | "manual";

/** O que o utilizador realmente introduziu, mais a taxa efetivamente aplicada. */
export interface TransactionEntry {
  amount: number;
  currency: string;
  fees: number;
  taxes: number;
  /** Fator multiplicativo: `montante(entrada) × rate = montante(nativo)`. */
  rate: number;
  /** Data efetiva da taxa (pode ser anterior à data do evento: carry-forward). */
  rateDate: ISODate;
  path: FxPath;
  carriedForward: boolean;
  source: EntryRateSource;
  /** Instante em que a conversão foi congelada. */
  convertedAt: string;
}

/** Valores introduzidos pelo utilizador, antes de qualquer conversão. */
export interface EntryInput {
  amount: number;
  currency: string;
  fees: number;
  taxes: number;
  occurredAt: ISODate | ISODateTime;
}

/** Montantes na moeda nativa do ativo — o que é persistido nas colunas. */
export interface NativeAmounts {
  amount: number;
  fees: number;
  taxes: number;
  currency: string;
}

export type EntryConversion =
  | {
      status: "ok";
      native: NativeAmounts;
      /** `null` quando não houve conversão (moeda de introdução = moeda nativa). */
      entry: TransactionEntry | null;
      /** A taxa veio de uma conversão anterior já congelada. */
      frozen: boolean;
    }
  | { status: "missing"; from: string; to: string; date: ISODate };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").toUpperCase() === (b ?? "").toUpperCase();

/** Lê a introdução original guardada nos metadados; `null` se ausente/malformada. */
export function readEntry(
  metadata: Record<string, unknown> | null | undefined,
): TransactionEntry | null {
  const raw = (metadata ?? {})["entry"];
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const amount = Number(e["amount"]);
  const rate = Number(e["rate"]);
  const currency = typeof e["currency"] === "string" ? e["currency"].toUpperCase() : "";
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0 || !currency) return null;
  return {
    amount,
    currency,
    fees: num(e["fees"]),
    taxes: num(e["taxes"]),
    rate,
    rateDate: typeof e["rateDate"] === "string" ? e["rateDate"] : "",
    path: (typeof e["path"] === "string" ? e["path"] : "direct") as FxPath,
    carriedForward: e["carriedForward"] === true,
    source: e["source"] === "manual" ? "manual" : "ecb",
    convertedAt: typeof e["convertedAt"] === "string" ? e["convertedAt"] : "",
  };
}

/** Escreve (ou remove) a introdução original num objeto de metadados. */
export function withEntry(
  metadata: Record<string, unknown>,
  entry: TransactionEntry | null,
): Record<string, unknown> {
  const next = { ...metadata };
  if (entry) next["entry"] = { ...entry };
  else delete next["entry"];
  return next;
}

/** Bruto da introdução: montante + comissões + impostos, na moeda introduzida. */
export const grossEntry = (input: Pick<EntryInput, "amount" | "fees" | "taxes">): number =>
  num(input.amount) + num(input.fees) + num(input.taxes);

/**
 * A introdução congelada continua a descrever exatamente estes valores?
 * Só então a taxa antiga pode ser reutilizada sem recalcular.
 */
export function entryMatches(
  frozen: TransactionEntry | null | undefined,
  input: EntryInput,
): boolean {
  if (!frozen) return false;
  return (
    same(frozen.currency, input.currency) &&
    frozen.amount === num(input.amount) &&
    frozen.fees === num(input.fees) &&
    frozen.taxes === num(input.taxes)
  );
}

export interface ConvertEntryOptions {
  /** Introdução já congelada (edição): reutilizada quando continua a aplicar-se. */
  frozen?: TransactionEntry | null;
  /** Taxa manual de recurso quando não existe taxa histórica para a data. */
  manualRate?: number | null;
  /** Injeção para testes determinísticos. */
  now?: () => string;
}

/**
 * Converte a introdução do utilizador para a moeda nativa do ativo.
 *
 * A conversão só é recalculada quando montante, moeda ou custos mudam; caso
 * contrário reutiliza-se a taxa congelada, mesmo que o catálogo BCE tenha
 * entretanto sido corrigido ou re-sincronizado.
 */
export function convertEntry(
  table: FxRateTable,
  input: EntryInput,
  assetCurrency: string,
  options: ConvertEntryOptions = {},
): EntryConversion {
  const to = (assetCurrency || "").toUpperCase();
  const from = (input.currency || "").toUpperCase();
  const date = toRateDate(input.occurredAt);
  const amount = num(input.amount);
  const fees = num(input.fees);
  const taxes = num(input.taxes);

  if (!from || !to) return { status: "missing", from, to, date };

  if (from === to) {
    return {
      status: "ok",
      native: { amount, fees, taxes, currency: to },
      entry: null,
      frozen: false,
    };
  }

  const now = options.now ?? (() => new Date().toISOString());

  const reuse = entryMatches(options.frozen, input) ? options.frozen! : null;
  let entry: TransactionEntry;

  if (reuse) {
    entry = { ...reuse, amount, currency: from, fees, taxes };
  } else {
    const manual = Number(options.manualRate);
    if (Number.isFinite(manual) && manual > 0) {
      entry = {
        amount,
        currency: from,
        fees,
        taxes,
        rate: manual,
        rateDate: date,
        path: "direct",
        carriedForward: false,
        source: "manual",
        convertedAt: now(),
      };
    } else {
      const resolution = rateAt(table, from, to, date);
      if (resolution.status === "missing") return { status: "missing", from, to, date };
      entry = {
        amount,
        currency: from,
        fees,
        taxes,
        rate: resolution.rate,
        rateDate: resolution.rateDate,
        path: resolution.path,
        carriedForward: resolution.carriedForward,
        source: "ecb",
        convertedAt: now(),
      };
    }
  }

  return {
    status: "ok",
    native: {
      amount: amount * entry.rate,
      fees: fees * entry.rate,
      taxes: taxes * entry.rate,
      currency: to,
    },
    entry,
    frozen: reuse != null,
  };
}

/**
 * Montante bruto realmente movimentado na moeda de reporting, quando a
 * transação foi introduzida nessa moeda. Evita reconverter nativo→reporting
 * um valor que o utilizador já introduziu na moeda da carteira.
 */
export function entryReportedGross(
  metadata: Record<string, unknown> | null | undefined,
  reportingCurrency: string,
): number | null {
  const entry = readEntry(metadata);
  if (!entry) return null;
  if (!same(entry.currency, reportingCurrency)) return null;
  const gross = entry.amount + entry.fees + entry.taxes;
  return gross > 0 ? gross : null;
}
