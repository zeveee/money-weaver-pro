import { supabase } from "@/integrations/supabase/client";
import type { Liability, LiabilityType } from "@/domain/types";
import { toLiability } from "./mapping";

export async function listLiabilities(portfolioId: string): Promise<Liability[]> {
  const { data, error } = await supabase
    .from("liabilities")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toLiability);
}

export async function createLiability(input: {
  portfolioId: string;
  type: LiabilityType;
  name: string;
  principalAmount: number;
  outstandingBalance?: number;
  currency?: string;
  interestRate?: number | null;
  monthlyPayment?: number | null;
  termMonths?: number | null;
}): Promise<Liability> {
  const { data, error } = await supabase
    .from("liabilities")
    .insert({
      portfolio_id: input.portfolioId,
      type: input.type,
      name: input.name,
      principal_amount: input.principalAmount,
      outstanding_balance: input.outstandingBalance ?? input.principalAmount,
      currency: input.currency ?? "EUR",
      interest_rate: input.interestRate ?? null,
      monthly_payment: input.monthlyPayment ?? null,
      term_months: input.termMonths ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toLiability(data);
}
