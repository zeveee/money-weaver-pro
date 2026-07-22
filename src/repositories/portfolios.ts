/**
 * Repositório de carteiras. Única fronteira com Supabase para esta entidade.
 * Sempre executa com o utilizador autenticado — RLS garante o isolamento.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Portfolio } from "@/domain/types";
import { toPortfolio } from "./mapping";

export async function listMyPortfolios(): Promise<Portfolio[]> {
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toPortfolio);
}

export async function getPortfolio(id: string): Promise<Portfolio | null> {
  const { data, error } = await supabase.from("portfolios").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPortfolio(data) : null;
}

export async function createPortfolio(input: {
  name: string;
  description?: string | null;
  baseCurrency?: string;
}): Promise<Portfolio> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("portfolios")
    .insert({
      user_id: auth.user.id,
      name: input.name,
      description: input.description ?? null,
      base_currency: input.baseCurrency ?? "EUR",
    })
    .select("*")
    .single();
  if (error) throw error;
  return toPortfolio(data);
}

export async function deletePortfolio(id: string): Promise<void> {
  const { error } = await supabase.from("portfolios").delete().eq("id", id);
  if (error) throw error;
}
