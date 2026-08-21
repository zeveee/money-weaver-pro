/**
 * IvestWise :: Security Master — persistência
 *
 * Duas tabelas:
 *  - `securities`        → catálogo global (uma linha por FIGI).
 *  - `security_lookups`  → memória das pesquisas por identificador, incluindo
 *                          os casos ambíguos e não identificados, para não
 *                          repetirmos chamadas externas.
 *
 * Escritas só com service role (as políticas RLS dão apenas leitura ao
 * utilizador autenticado): o catálogo é do sistema, não do utilizador.
 */

import type { SecurityIdType, SecurityMatchStatus, SecurityRecord } from "./types";

/**
 * Memória de uma pesquisa: o CONJUNTO de candidatos que a fonte externa já
 * devolveu para aquele identificador. Não é uma decisão — a decisão é tomada
 * por holding, com o contexto, em `select.ts`.
 */
export interface LookupEntry {
  /** `identified` ⇒ há candidatos conhecidos; `unidentified` ⇒ a fonte não devolveu nenhum. */
  status: SecurityMatchStatus;
  /** Conjunto acumulado de candidatos (união de todas as consultas anteriores). */
  candidates: SecurityRecord[];
  candidateCount: number;
  source: string;
  message: string | null;
}

export interface ClassificationInput {
  sector: string | null;
  industry: string | null;
  country: string | null;
  classificationSource: string;
}

export interface SecurityStore {
  /** Pesquisas já feitas, por chave `idType:idValue`. */
  getLookups(keys: string[]): Promise<Map<string, LookupEntry>>;
  /** Insere/atualiza a security (chave natural: FIGI) e devolve-a com id. */
  upsertSecurity(input: Omit<SecurityRecord, "id">, payload: unknown): Promise<SecurityRecord>;
  /** Grava a classificação (setor/país) de uma security já identificada. */
  updateClassification(
    securityId: string,
    input: ClassificationInput,
  ): Promise<SecurityRecord>;
  /**
   * Regista o resultado de uma pesquisa, acrescentando (união) os candidatos
   * encontrados aos que já eram conhecidos. Nunca substitui o conjunto.
   */
  saveLookup(input: {
    idType: SecurityIdType;
    idValue: string;
    candidateIds: string[];
    source: string;
    message: string | null;
  }): Promise<void>;
}


export const lookupKey = (idType: SecurityIdType, idValue: string) =>
  `${idType}:${idValue.trim().toUpperCase()}`;

type Row = Record<string, unknown>;

const toRecord = (r: Row): SecurityRecord => ({
  id: String(r["id"]),
  figi: (r["figi"] as string | null) ?? null,
  compositeFigi: (r["composite_figi"] as string | null) ?? null,
  shareClassFigi: (r["share_class_figi"] as string | null) ?? null,
  name: (r["name"] as string | null) ?? null,
  ticker: (r["ticker"] as string | null) ?? null,
  isin: (r["isin"] as string | null) ?? null,
  cusip: (r["cusip"] as string | null) ?? null,
  sedol: (r["sedol"] as string | null) ?? null,
  exchange: (r["exchange"] as string | null) ?? null,
  currency: (r["currency"] as string | null) ?? null,
  securityType: (r["security_type"] as string | null) ?? null,
  marketSector: (r["market_sector"] as string | null) ?? null,
  source: (r["source"] as string | null) ?? "openfigi",
  sector: (r["sector"] as string | null) ?? null,
  industry: (r["industry"] as string | null) ?? null,
  country: (r["country"] as string | null) ?? null,
  classificationSource: (r["classification_source"] as string | null) ?? null,
});

/** Store real (Supabase, service role). */
export function createSupabaseSecurityStore(): SecurityStore {
  const admin = async () =>
    (await import("@/integrations/supabase/client.server")).supabaseAdmin;

  return {
    async getLookups(keys) {
      const out = new Map<string, LookupEntry>();
      if (keys.length === 0) return out;
      const db = await admin();
      const { data, error } = await db
        .from("security_lookups")
        .select(
          "lookup_key, status, candidate_count, source, message, securities:security_id (*)",
        )
        .in("lookup_key", keys);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as unknown as Row[]) {
        const sec = row["securities"] as Row | null;
        out.set(String(row["lookup_key"]), {
          status: row["status"] as SecurityMatchStatus,
          security: sec ? toRecord(sec) : null,
          candidateCount: Number(row["candidate_count"] ?? 0),
          source: String(row["source"] ?? "openfigi"),
          message: (row["message"] as string | null) ?? null,
        });
      }
      return out;
    },

    async upsertSecurity(input, payload) {
      const db = await admin();
      const { data, error } = await db
        .from("securities")
        .upsert(
          {
            figi: input.figi,
            composite_figi: input.compositeFigi,
            share_class_figi: input.shareClassFigi,
            name: input.name,
            ticker: input.ticker,
            isin: input.isin,
            cusip: input.cusip,
            sedol: input.sedol,
            exchange: input.exchange,
            currency: input.currency,
            security_type: input.securityType,
            market_sector: input.marketSector,
            source: input.source,
            source_payload: (payload ?? {}) as never,
          },
          { onConflict: "figi" },
        )
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return toRecord(data as unknown as Row);
    },

    async updateClassification(securityId, input) {
      const db = await admin();
      const { data, error } = await db
        .from("securities")
        .update({
          sector: input.sector,
          industry: input.industry,
          country: input.country,
          classification_source: input.classificationSource,
          classified_at: new Date().toISOString(),
        })
        .eq("id", securityId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return toRecord(data as unknown as Row);
    },

    async saveLookup(input) {
      const db = await admin();
      const { error } = await db.from("security_lookups").upsert(
        {
          lookup_key: lookupKey(input.idType, input.idValue),
          id_type: input.idType,
          id_value: input.idValue,
          status: input.status,
          security_id: input.securityId,
          candidate_count: input.candidateCount,
          source: input.source,
          message: input.message,
        },
        { onConflict: "lookup_key" },
      );
      if (error) throw new Error(error.message);
    },
  };
}

/** Store em memória — usada em testes, sem rede nem base de dados. */
export function createMemorySecurityStore(): SecurityStore {
  const lookups = new Map<string, LookupEntry>();
  const securities = new Map<string, SecurityRecord>();
  return {
    async getLookups(keys) {
      const out = new Map<string, LookupEntry>();
      for (const k of keys) {
        const hit = lookups.get(k);
        if (hit) out.set(k, hit);
      }
      return out;
    },
    async upsertSecurity(input) {
      const key = input.figi ?? `${input.ticker}:${input.exchange}`;
      const existing = securities.get(key);
      const rec: SecurityRecord = { ...input, id: existing?.id ?? crypto.randomUUID() };
      securities.set(key, rec);
      return rec;
    },
    async updateClassification(securityId, input) {
      const found = [...securities.entries()].find(([, v]) => v.id === securityId);
      if (!found) throw new Error(`Security ${securityId} não existe.`);
      const next: SecurityRecord = { ...found[1], ...input };
      securities.set(found[0], next);
      return next;
    },
    async saveLookup(input) {
      lookups.set(lookupKey(input.idType, input.idValue), {
        status: input.status,
        security: input.securityId
          ? ([...securities.values()].find((s) => s.id === input.securityId) ?? null)
          : null,
        candidateCount: input.candidateCount,
        source: input.source,
        message: input.message,
      });
    },
  };
}
