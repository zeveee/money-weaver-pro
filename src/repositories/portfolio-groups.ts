/**
 * Repositório de Portfolio Groups.
 * Ownership garantido por RLS via owner_id = auth.uid().
 */
import { supabase } from "@/integrations/supabase/client";
import type { PortfolioGroup } from "@/domain/types";
import { toPortfolioGroup } from "./mapping";

export async function listMyPortfolioGroups(): Promise<PortfolioGroup[]> {
  const { data, error } = await supabase
    .from("portfolio_groups")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toPortfolioGroup);
}

export async function createPortfolioGroup(input: {
  name: string;
  description?: string | null;
}): Promise<PortfolioGroup> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("portfolio_groups")
    .insert({
      owner_id: auth.user.id,
      name: input.name,
      description: input.description ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toPortfolioGroup(data);
}

export async function updatePortfolioGroup(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<PortfolioGroup> {
  const { data, error } = await supabase
    .from("portfolio_groups")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toPortfolioGroup(data);
}

export async function deletePortfolioGroup(id: string): Promise<void> {
  const { error } = await supabase.from("portfolio_groups").delete().eq("id", id);
  if (error) throw error;
}

export async function getPortfolioGroup(id: string): Promise<PortfolioGroup | null> {
  const { data, error } = await supabase
    .from("portfolio_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toPortfolioGroup(data) : null;
}
