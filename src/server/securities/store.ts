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
        .select("lookup_key, status, candidate_count, source, message")
        .in("lookup_key", keys);
      if (error) throw new Error(error.message);

      // Conjunto acumulado de candidatos por identificador.
      const { data: cands, error: candErr } = await db
        .from("security_lookup_candidates")
        .select("lookup_key, securities:security_id (*)")
        .in("lookup_key", keys);
      if (candErr) throw new Error(candErr.message);

      const byKey = new Map<string, SecurityRecord[]>();
      for (const row of (cands ?? []) as unknown as Row[]) {
        const sec = row["securities"] as Row | null;
        if (!sec) continue;
        const k = String(row["lookup_key"]);
        const list = byKey.get(k) ?? [];
        list.push(toRecord(sec));
        byKey.set(k, list);
      }

      for (const row of (data ?? []) as unknown as Row[]) {
        const key = String(row["lookup_key"]);
        const candidates = byKey.get(key) ?? [];
        out.set(key, {
          status: candidates.length > 0 ? "identified" : "unidentified",
          candidates,
          candidateCount: candidates.length,
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
      const key = lookupKey(input.idType, input.idValue);

      // 1) A linha do lookup tem de existir (é o alvo da FK dos candidatos).
      const { error } = await db.from("security_lookups").upsert(
        {
          lookup_key: key,
          id_type: input.idType,
          id_value: input.idValue,
          status: input.candidateIds.length > 0 ? "identified" : "unidentified",
          security_id: null,
          candidate_count: input.candidateIds.length,
          source: input.source,
          message: input.message,
        },
        { onConflict: "lookup_key" },
      );
      if (error) throw new Error(error.message);

      if (input.candidateIds.length === 0) return;

      // 2) União: candidatos novos acrescentam-se, os existentes ficam.
      const { error: insErr } = await db
        .from("security_lookup_candidates")
        .upsert(
          input.candidateIds.map((securityId) => ({
            lookup_key: key,
            security_id: securityId,
          })),
          { onConflict: "lookup_key,security_id", ignoreDuplicates: true },
        );
      if (insErr) throw new Error(insErr.message);

      // 3) `candidate_count` reflete sempre o conjunto acumulado.
      const { count, error: cntErr } = await db
        .from("security_lookup_candidates")
        .select("id", { count: "exact", head: true })
        .eq("lookup_key", key);
      if (cntErr) throw new Error(cntErr.message);
      if (typeof count === "number" && count !== input.candidateIds.length) {
        const { error: updErr } = await db
          .from("security_lookups")
          .update({ candidate_count: count })
          .eq("lookup_key", key);
        if (updErr) throw new Error(updErr.message);
      }
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
      const key = lookupKey(input.idType, input.idValue);
      const prev = lookups.get(key);
      const merged = new Map<string, SecurityRecord>();
      for (const s of prev?.candidates ?? []) merged.set(s.id, s);
      for (const id of input.candidateIds) {
        const found = [...securities.values()].find((s) => s.id === id);
        if (found) merged.set(found.id, found);
      }
      const candidates = [...merged.values()];
      lookups.set(key, {
        status: candidates.length > 0 ? "identified" : "unidentified",
        candidates,
        candidateCount: candidates.length,
        source: input.source,
        message: input.message,
      });
    },

  };
}
