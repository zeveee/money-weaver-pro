/**
 * IvestWise :: Chave estável de uma holding
 *
 * Pura e sem dependências de servidor: usada pelo matcher (servidor) e pela
 * UI (cliente) para associar cada holding ao respetivo resultado de
 * identificação sem depender da posição no array.
 */

export interface HoldingKeyInput {
  holdingName: string;
  holdingTicker?: string | null;
  cusip?: string | null;
}

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim().toUpperCase();
  return s === "" || s === "N/A" || s === "-" ? null : s;
};

export const holdingKeyOf = (h: HoldingKeyInput): string =>
  clean(h.cusip) ?? clean(h.holdingTicker) ?? h.holdingName.trim().toUpperCase();
