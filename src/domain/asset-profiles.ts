/**
 * IvestWise :: Asset Profiles (fonte declarativa)
 *
 * Camada de domínio pura: descreve, por AssetType, os campos do formulário,
 * validações, chaves de metadata, tipos de transação suportados e capacidades
 * (valorações, recorrência). A UI é construída a partir daqui — não deve
 * conter regras específicas por tipo de ativo.
 *
 * NÃO altera schema: campos "column" mapeiam colunas existentes de `assets`;
 * todos os restantes vivem em `assets.metadata` (JSONB).
 */

import type { AssetType, TransactionType } from "./types";
import { UNIT_BASED_CAPABLE, getTransactionTypes } from "./transaction-profiles";

export type FieldKind = "text" | "number" | "date" | "select" | "checkbox" | "textarea";

export interface AssetFieldSpec {
  /** Chave: nome da coluna (target "column") ou chave em metadata (camelCase). */
  key: string;
  label: string;
  kind: FieldKind;
  target: "column" | "metadata";
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  /** Validação adicional; devolve mensagem de erro ou null. */
  validate?: (value: unknown) => string | null;
}

export interface AssetProfile {
  type: AssetType;
  label: string;
  /** Objetivo funcional do tipo de ativo. */
  purpose: string;
  /** Campos específicos (para além dos comuns). */
  fields: AssetFieldSpec[];
  /** Tipos de transação aceites hoje. */
  transactionTypes: TransactionType[];
  /** Tipos de transação previstos para o futuro (não implementados). */
  futureTransactionTypes?: string[];
  supportsValuations: boolean;
  /** Recorrência ativa nesta fase. */
  supportsRecurring: boolean;
  /**
   * Compatível com o mecanismo de recorrência (mesmo bloco `metadata.recurring`),
   * ainda que desativado nesta fase.
   */
  recurringCompatible: boolean;
  /** Unidade da quantidade (derivada) — apenas informativa. */
  quantityUnit?: string;
}

const ISO_CURRENCY = /^[A-Z]{3}$/;

/** Campos comuns a todos os AssetTypes. */
export const COMMON_FIELDS: AssetFieldSpec[] = [
  { key: "name", label: "Nome", kind: "text", target: "column", required: true, maxLength: 160 },
  {
    key: "currency",
    label: "Moeda",
    kind: "text",
    target: "column",
    required: true,
    maxLength: 3,
    placeholder: "EUR",
    validate: (v) =>
      ISO_CURRENCY.test(String(v ?? "")) ? null : "Moeda deve ser ISO 4217 (ex.: EUR)",
  },
  { key: "notes", label: "Notas", kind: "textarea", target: "column", maxLength: 1000 },
];

const marketIdentifiers: AssetFieldSpec[] = [
  {
    key: "ticker",
    label: "Ticker",
    kind: "text",
    target: "column",
    maxLength: 20,
    placeholder: "VWCE",
  },
  {
    key: "isin",
    label: "ISIN",
    kind: "text",
    target: "column",
    maxLength: 12,
    validate: (v) =>
      !v || /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(v))
        ? null
        : "ISIN inválido (12 caracteres, ex.: IE00BK5BQT80)",
  },
  {
    key: "exchange",
    label: "Bolsa",
    kind: "text",
    target: "metadata",
    maxLength: 40,
    placeholder: "XETRA",
  },
  { key: "broker", label: "Corretora / Custódia", kind: "text", target: "metadata", maxLength: 80 },
];

/**
 * Produtos seguradores/PPR podem funcionar por Unidades de Participação (Unit Linked).
 * Quando ativo, reforços e resgates passam a usar unidades e a valorização passa a NAV.
 */
export const UNIT_BASED_FIELD: AssetFieldSpec = {
  key: "unitBased",
  label: "Baseado em unidades de participação (Unit Linked)",
  kind: "checkbox",
  target: "metadata",
  help: "Ativa quantidade de UPs nos movimentos e valorização por NAV por UP.",
};


/**
 * Os tipos de transação por AssetType são definidos na matriz declarativa em
 * `transaction-profiles.ts` (rótulos contextuais + semântica de rendimento).
 * Aqui apenas se reexpõem, para que o perfil do ativo continue autocontido.
 */
const txFor = (type: AssetType): TransactionType[] => getTransactionTypes(type);

export const ASSET_PROFILES: Record<AssetType, AssetProfile> = {
  etf: {
    type: "etf",
    label: "ETF",
    purpose: "Fundo negociado em bolsa, com quantidade, preço unitário e distribuições.",
    fields: [
      ...marketIdentifiers,
      {
        key: "distributionPolicy",
        label: "Política de distribuição",
        kind: "select",
        target: "metadata",
        options: [
          { value: "accumulating", label: "Acumulação" },
          { value: "distributing", label: "Distribuição" },
        ],
      },
      {
        key: "ter",
        label: "TER (%)",
        kind: "number",
        target: "metadata",
        min: 0,
        max: 5,
        step: 0.01,
      },
      { key: "replication", label: "Replicação", kind: "text", target: "metadata", maxLength: 40 },
    ],
    transactionTypes: txFor("etf"),
    supportsValuations: true,
    supportsRecurring: true,
    recurringCompatible: true,
    quantityUnit: "unidades",
  },
  stock: {
    type: "stock",
    label: "Ação",
    purpose: "Participação em empresa cotada, com dividendos e mais-valias.",
    fields: [
      ...marketIdentifiers,
      { key: "sector", label: "Setor", kind: "text", target: "metadata", maxLength: 60 },
      { key: "country", label: "País", kind: "text", target: "metadata", maxLength: 60 },
    ],
    transactionTypes: txFor("stock"),
    supportsValuations: true,
    supportsRecurring: false,
    recurringCompatible: true,
    quantityUnit: "ações",
  },
  fund: {
    type: "fund",
    label: "Fundo",
    purpose: "Fundo de investimento não cotado, subscrito por valor ou unidades de participação.",
    fields: [
      { key: "isin", label: "ISIN", kind: "text", target: "column", maxLength: 12 },
      {
        key: "manager",
        label: "Entidade gestora",
        kind: "text",
        target: "metadata",
        maxLength: 80,
      },
      {
        key: "ter",
        label: "TER (%)",
        kind: "number",
        target: "metadata",
        min: 0,
        max: 5,
        step: 0.01,
      },
    ],
    transactionTypes: txFor("fund"),
    supportsValuations: true,
    supportsRecurring: true,
    recurringCompatible: true,
    quantityUnit: "UP",
  },
  ppr: {
    type: "ppr",
    label: "PPR",
    purpose:
      "Plano Poupança Reforma modelado de forma simplificada por depósitos e resgates, independentemente de ser fundo ou seguro.",
    fields: [
      { key: "provider", label: "Entidade", kind: "text", target: "metadata", maxLength: 80 },
      {
        key: "contractNumber",
        label: "Nº de contrato",
        kind: "text",
        target: "metadata",
        maxLength: 60,
      },
      UNIT_BASED_FIELD,
    ],

    // Modelo simplificado: entradas e saídas de capital.
    transactionTypes: txFor("ppr"),
    futureTransactionTypes: [
      "distinção PPR Fundo vs PPR Seguro (unidades de participação, apólice)",
    ],
    supportsValuations: true,
    supportsRecurring: true,
    recurringCompatible: true,
  },
  capitalization_insurance: {
    type: "capitalization_insurance",
    label: "Seguro de capitalização",
    purpose:
      "Produto segurador com capital garantido ou Unit Linked; o valor atual vem da última valoração (valor do contrato ou NAV × UPs).",
    fields: [
      { key: "insurer", label: "Seguradora", kind: "text", target: "metadata", maxLength: 80 },
      {
        key: "policyNumber",
        label: "Nº de apólice",
        kind: "text",
        target: "metadata",
        maxLength: 60,
      },
      {
        key: "guaranteedRate",
        label: "Taxa garantida (%)",
        kind: "number",
        target: "metadata",
        min: 0,
        step: 0.01,
      },
      UNIT_BASED_FIELD,
    ],

    transactionTypes: txFor("capitalization_insurance"),
    supportsValuations: true,
    supportsRecurring: true,
    recurringCompatible: true,
  },
  bond: {
    type: "bond",
    label: "Obrigação",
    purpose: "Instrumento de dívida com cupões e maturidade.",
    fields: [
      ...marketIdentifiers,
      {
        key: "couponRate",
        label: "Taxa de cupão (%)",
        kind: "number",
        target: "metadata",
        min: 0,
        step: 0.01,
      },
      { key: "maturityDate", label: "Maturidade", kind: "date", target: "metadata" },
      { key: "issuer", label: "Emitente", kind: "text", target: "metadata", maxLength: 80 },
    ],
    transactionTypes: txFor("bond"),
    supportsValuations: true,
    supportsRecurring: false,
    recurringCompatible: true,
    quantityUnit: "nominal",
  },
  cash: {
    type: "cash",
    label: "Liquidez",
    purpose: "Contas à ordem, poupança ou depósitos; movimentos por depósitos e levantamentos.",
    fields: [
      { key: "institution", label: "Instituição", kind: "text", target: "metadata", maxLength: 80 },
      {
        key: "accountAlias",
        label: "Alias da conta",
        kind: "text",
        target: "metadata",
        maxLength: 60,
      },
      {
        key: "interestRate",
        label: "Taxa de juro (%)",
        kind: "number",
        target: "metadata",
        min: 0,
        step: 0.01,
      },
    ],
    transactionTypes: txFor("cash"),
    // Recorrência desativada nesta fase, mas o bloco metadata.recurring é o mesmo
    // usado por PPR/fundos/seguros (ex.: transferência automática para poupança).
    supportsValuations: true,
    supportsRecurring: false,
    recurringCompatible: true,
  },
  crypto: {
    type: "crypto",
    label: "Cripto",
    purpose: "Ativos digitais com quantidade fracionada e custódia própria ou em exchange.",
    fields: [
      {
        key: "ticker",
        label: "Símbolo",
        kind: "text",
        target: "column",
        maxLength: 20,
        placeholder: "BTC",
      },
      { key: "network", label: "Rede", kind: "text", target: "metadata", maxLength: 40 },
      { key: "custody", label: "Custódia", kind: "text", target: "metadata", maxLength: 80 },
      { key: "walletLabel", label: "Carteira", kind: "text", target: "metadata", maxLength: 60 },
    ],
    transactionTypes: txFor("crypto"),
    // Compatibilidade futura sem alterar schema: registados em metadata.subtype
    // sobre transações existentes até existirem tipos dedicados.
    futureTransactionTypes: ["staking_reward", "airdrop", "fork"],
    supportsValuations: true,
    supportsRecurring: false,
    recurringCompatible: true,
    quantityUnit: "unidades",
  },
  real_estate: {
    type: "real_estate",
    label: "Imobiliário",
    purpose: "Imóvel detido; valor atual sempre proveniente da última valoração.",
    fields: [
      { key: "address", label: "Morada", kind: "text", target: "metadata", maxLength: 200 },
      {
        key: "propertyType",
        label: "Tipo de imóvel",
        kind: "text",
        target: "metadata",
        maxLength: 60,
      },
      {
        key: "areaSqm",
        label: "Área (m²)",
        kind: "number",
        target: "metadata",
        min: 0,
        step: 0.01,
      },
      {
        key: "rentalIncomeMonthly",
        label: "Renda mensal",
        kind: "number",
        target: "metadata",
        min: 0,
        step: 0.01,
      },
    ],
    transactionTypes: txFor("real_estate"),
    supportsValuations: true,
    supportsRecurring: false,
    recurringCompatible: true,
  },
  commodity: {
    type: "commodity",
    label: "Commodity",
    purpose: "Matérias-primas (ouro, prata, petróleo) detidas fisicamente ou via instrumento.",
    fields: [
      {
        key: "ticker",
        label: "Símbolo",
        kind: "text",
        target: "column",
        maxLength: 20,
        placeholder: "XAU",
      },
      {
        key: "holdingForm",
        label: "Forma de detenção",
        kind: "select",
        target: "metadata",
        options: [
          { value: "physical", label: "Física" },
          { value: "etc", label: "ETC/ETF" },
          { value: "futures", label: "Futuros" },
        ],
      },
      { key: "storage", label: "Armazenamento", kind: "text", target: "metadata", maxLength: 80 },
      {
        key: "unit",
        label: "Unidade",
        kind: "text",
        target: "metadata",
        maxLength: 20,
        placeholder: "oz",
      },
    ],
    transactionTypes: txFor("commodity"),
    supportsValuations: true,
    supportsRecurring: false,
    recurringCompatible: true,
    quantityUnit: "unidades",
  },
};

export const ASSET_TYPE_OPTIONS = (Object.values(ASSET_PROFILES) as AssetProfile[]).map((p) => ({
  value: p.type,
  label: p.label,
}));

export const getAssetProfile = (type: AssetType): AssetProfile => ASSET_PROFILES[type];

/** Campos visíveis (comuns + específicos) para um tipo, já ordenados. */
export function getAssetFields(type: AssetType): AssetFieldSpec[] {
  const profile = getAssetProfile(type);
  return [...COMMON_FIELDS.slice(0, 2), ...profile.fields, ...COMMON_FIELDS.slice(2)];
}

/** Validação declarativa de um formulário de ativo. */
export function validateAssetForm(
  type: AssetType,
  values: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  for (const field of getAssetFields(type)) {
    const raw = values[field.key];
    const empty = raw === undefined || raw === null || raw === "";
    if (field.required && empty) return { ok: false, message: `${field.label} é obrigatório` };
    if (empty) continue;
    if (field.kind === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) return { ok: false, message: `${field.label} deve ser numérico` };
      if (field.min != null && n < field.min)
        return { ok: false, message: `${field.label} não pode ser inferior a ${field.min}` };
      if (field.max != null && n > field.max)
        return { ok: false, message: `${field.label} não pode exceder ${field.max}` };
    }
    if (field.maxLength && String(raw).length > field.maxLength) {
      return { ok: false, message: `${field.label} excede ${field.maxLength} caracteres` };
    }
    const custom = field.validate?.(raw);
    if (custom) return { ok: false, message: custom };
  }

  return { ok: true };
}

// ---------- Valuations (declarativo por AssetType) ----------

/**
 * Modo de entrada de uma valorização:
 * - `unit_price`: o utilizador introduz o preço por unidade; o total deriva da quantidade.
 * - `total_value`: o utilizador introduz diretamente o valor total (sem unidades).
 */
export type ValuationMode = "unit_price" | "total_value";

export interface ValuationSpec {
  mode: ValuationMode;
  /** Rótulo do campo principal introduzido pelo utilizador. */
  label: string;
  /** Rótulo do valor total do ativo à data. */
  totalLabel: string;
  help?: string;
}

export const VALUATION_SPECS: Record<AssetType, ValuationSpec> = {
  etf: { mode: "unit_price", label: "Preço por unidade", totalLabel: "Valor de mercado" },
  stock: { mode: "unit_price", label: "Cotação por ação", totalLabel: "Valor de mercado" },
  fund: { mode: "unit_price", label: "NAV por unidade de participação", totalLabel: "Valor de mercado" },
  bond: { mode: "unit_price", label: "Preço por obrigação", totalLabel: "Valor de mercado" },
  crypto: { mode: "unit_price", label: "Preço por unidade", totalLabel: "Valor de mercado" },
  commodity: { mode: "unit_price", label: "Preço por unidade", totalLabel: "Valor de mercado" },
  ppr: { mode: "total_value", label: "Valor atual do plano", totalLabel: "Valor atual" },
  capitalization_insurance: {
    mode: "total_value",
    label: "Valor atual do contrato",
    totalLabel: "Valor do contrato",
  },
  real_estate: { mode: "total_value", label: "Valor de mercado", totalLabel: "Valor de mercado" },
  cash: { mode: "total_value", label: "Saldo", totalLabel: "Saldo" },
};

/** Specs alternativas para produtos baseados em Unidades de Participação. */
export const UNIT_BASED_VALUATION_SPECS: Partial<Record<AssetType, ValuationSpec>> = {
  capitalization_insurance: {
    mode: "unit_price",
    label: "NAV por unidade de participação",
    totalLabel: "Valor da apólice",
    help: "Valor da apólice = unidades detidas à data × NAV.",
  },
  ppr: {
    mode: "unit_price",
    label: "NAV por unidade de participação",
    totalLabel: "Valor do plano",
    help: "Valor do plano = unidades detidas à data × NAV.",
  },
};

export interface AssetCapabilities {
  /** Produto baseado em Unidades de Participação (Unit Linked). */
  unitBased?: boolean;
}

export const getValuationSpec = (
  type: AssetType,
  caps: AssetCapabilities = {},
): ValuationSpec =>
  (caps.unitBased ? UNIT_BASED_VALUATION_SPECS[type] : undefined) ?? VALUATION_SPECS[type];

/** Lê a característica Unit Linked a partir da metadata do ativo. */
export const isUnitBased = (type: AssetType, metadata?: Record<string, unknown> | null): boolean =>
  UNIT_BASED_CAPABLE.includes(type) && metadata?.["unitBased"] === true;

