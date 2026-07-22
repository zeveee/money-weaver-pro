export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      asset_allocations: {
        Row: {
          allocation_name: string
          allocation_type: Database["public"]["Enums"]["allocation_type"]
          asset_id: string
          created_at: string
          id: string
          percentage: number
          updated_at: string
        }
        Insert: {
          allocation_name: string
          allocation_type: Database["public"]["Enums"]["allocation_type"]
          asset_id: string
          created_at?: string
          id?: string
          percentage: number
          updated_at?: string
        }
        Update: {
          allocation_name?: string
          allocation_type?: Database["public"]["Enums"]["allocation_type"]
          asset_id?: string
          created_at?: string
          id?: string
          percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_allocations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          category_name: string
          category_type: Database["public"]["Enums"]["asset_category_type"]
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          category_name: string
          category_type: Database["public"]["Enums"]["asset_category_type"]
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          category_name?: string
          category_type?: Database["public"]["Enums"]["asset_category_type"]
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      asset_identifiers: {
        Row: {
          asset_id: string
          created_at: string
          currency: string | null
          cusip: string | null
          exchange: string | null
          id: string
          isin: string | null
          sedol: string | null
          ticker: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          currency?: string | null
          cusip?: string | null
          exchange?: string | null
          id?: string
          isin?: string | null
          sedol?: string | null
          ticker?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          currency?: string | null
          cusip?: string | null
          exchange?: string | null
          id?: string
          isin?: string | null
          sedol?: string | null
          ticker?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_identifiers_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_valuations: {
        Row: {
          asset_id: string
          created_at: string
          currency: string
          id: string
          source: string | null
          total_value: number
          unit_price: number | null
          valuation_date: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          currency?: string
          id?: string
          source?: string | null
          total_value: number
          unit_price?: number | null
          valuation_date?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          currency?: string
          id?: string
          source?: string | null
          total_value?: number
          unit_price?: number | null
          valuation_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          acquired_at: string | null
          average_cost: number
          created_at: string
          currency: string
          current_value: number | null
          id: string
          isin: string | null
          metadata: Json
          name: string
          notes: string | null
          portfolio_id: string
          quantity: number
          ticker: string | null
          type: Database["public"]["Enums"]["asset_type"]
          updated_at: string
        }
        Insert: {
          acquired_at?: string | null
          average_cost?: number
          created_at?: string
          currency?: string
          current_value?: number | null
          id?: string
          isin?: string | null
          metadata?: Json
          name: string
          notes?: string | null
          portfolio_id: string
          quantity?: number
          ticker?: string | null
          type: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
        }
        Update: {
          acquired_at?: string | null
          average_cost?: number
          created_at?: string
          currency?: string
          current_value?: number | null
          id?: string
          isin?: string | null
          metadata?: Json
          name?: string
          notes?: string | null
          portfolio_id?: string
          quantity?: number
          ticker?: string | null
          type?: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmarks: {
        Row: {
          benchmark_type: Database["public"]["Enums"]["benchmark_type"]
          created_at: string
          id: string
          isin: string | null
          name: string
          provider: string | null
          ticker: string | null
          updated_at: string
        }
        Insert: {
          benchmark_type: Database["public"]["Enums"]["benchmark_type"]
          created_at?: string
          id?: string
          isin?: string | null
          name: string
          provider?: string | null
          ticker?: string | null
          updated_at?: string
        }
        Update: {
          benchmark_type?: Database["public"]["Enums"]["benchmark_type"]
          created_at?: string
          id?: string
          isin?: string | null
          name?: string
          provider?: string | null
          ticker?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      data_providers: {
        Row: {
          created_at: string
          id: string
          provider_name: string
          provider_type: Database["public"]["Enums"]["data_provider_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider_name: string
          provider_type: Database["public"]["Enums"]["data_provider_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          provider_name?: string
          provider_type?: Database["public"]["Enums"]["data_provider_type"]
          updated_at?: string
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          portfolio_id: string
          records_created: number
          records_updated: number
          source_type: Database["public"]["Enums"]["import_source_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["import_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          portfolio_id: string
          records_created?: number
          records_updated?: number
          source_type: Database["public"]["Enums"]["import_source_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          portfolio_id?: string
          records_created?: number
          records_updated?: number
          source_type?: Database["public"]["Enums"]["import_source_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          created_at: string
          currency: string
          end_date: string | null
          id: string
          interest_rate: number | null
          lender: string | null
          metadata: Json
          monthly_payment: number | null
          name: string
          notes: string | null
          outstanding_balance: number
          portfolio_id: string
          principal_amount: number
          rate_type: Database["public"]["Enums"]["interest_rate_type"] | null
          reference_index: string | null
          spread: number | null
          start_date: string | null
          term_months: number | null
          type: Database["public"]["Enums"]["liability_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          interest_rate?: number | null
          lender?: string | null
          metadata?: Json
          monthly_payment?: number | null
          name: string
          notes?: string | null
          outstanding_balance?: number
          portfolio_id: string
          principal_amount?: number
          rate_type?: Database["public"]["Enums"]["interest_rate_type"] | null
          reference_index?: string | null
          spread?: number | null
          start_date?: string | null
          term_months?: number | null
          type: Database["public"]["Enums"]["liability_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          interest_rate?: number | null
          lender?: string | null
          metadata?: Json
          monthly_payment?: number | null
          name?: string
          notes?: string | null
          outstanding_balance?: number
          portfolio_id?: string
          principal_amount?: number
          rate_type?: Database["public"]["Enums"]["interest_rate_type"] | null
          reference_index?: string | null
          spread?: number | null
          start_date?: string | null
          term_months?: number | null
          type?: Database["public"]["Enums"]["liability_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liabilities_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      liability_payments: {
        Row: {
          amount: number
          created_at: string
          fees: number
          id: string
          interest_portion: number
          liability_id: string
          notes: string | null
          paid_at: string
          principal_portion: number
        }
        Insert: {
          amount?: number
          created_at?: string
          fees?: number
          id?: string
          interest_portion?: number
          liability_id: string
          notes?: string | null
          paid_at?: string
          principal_portion?: number
        }
        Update: {
          amount?: number
          created_at?: string
          fees?: number
          id?: string
          interest_portion?: number
          liability_id?: string
          notes?: string | null
          paid_at?: string
          principal_portion?: number
        }
        Relationships: [
          {
            foreignKeyName: "liability_payments_liability_id_fkey"
            columns: ["liability_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_benchmarks: {
        Row: {
          benchmark_id: string
          created_at: string
          id: string
          portfolio_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          benchmark_id: string
          created_at?: string
          id?: string
          portfolio_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          benchmark_id?: string
          created_at?: string
          id?: string
          portfolio_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_benchmarks_benchmark_id_fkey"
            columns: ["benchmark_id"]
            isOneToOne: false
            referencedRelation: "benchmarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_benchmarks_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          base_currency: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          base_currency: string
          created_at: string
          display_name: string | null
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          currency: string
          fees: number
          id: string
          metadata: Json
          notes: string | null
          occurred_at: string
          quantity: number
          taxes: number
          type: Database["public"]["Enums"]["transaction_type"]
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount?: number
          asset_id: string
          created_at?: string
          currency?: string
          fees?: number
          id?: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          quantity?: number
          taxes?: number
          type: Database["public"]["Enums"]["transaction_type"]
          unit_price?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          currency?: string
          fees?: number
          id?: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          quantity?: number
          taxes?: number
          type?: Database["public"]["Enums"]["transaction_type"]
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_portfolio: { Args: { _portfolio_id: string }; Returns: boolean }
    }
    Enums: {
      allocation_type:
        | "sector"
        | "geography"
        | "asset_class"
        | "esg"
        | "factor"
        | "currency"
        | "custom"
      app_role: "admin" | "user"
      asset_category_type:
        | "sector"
        | "geography"
        | "asset_class"
        | "esg"
        | "factor"
        | "strategy"
        | "custom"
      asset_type:
        | "etf"
        | "stock"
        | "fund"
        | "capitalization_insurance"
        | "ppr"
        | "bond"
        | "cash"
        | "crypto"
        | "real_estate"
      benchmark_type:
        | "equity_index"
        | "bond_index"
        | "commodity"
        | "currency"
        | "composite"
        | "custom"
      data_provider_type:
        | "market_data"
        | "fundamentals"
        | "reference_data"
        | "documents"
        | "other"
      import_source_type: "csv" | "xlsx" | "pdf" | "api" | "manual"
      import_status: "pending" | "running" | "completed" | "failed" | "partial"
      interest_rate_type: "fixed" | "variable" | "mixed"
      liability_type: "mortgage" | "auto_loan" | "personal_loan" | "other"
      transaction_type:
        | "buy"
        | "sell"
        | "dividend"
        | "interest"
        | "coupon"
        | "deposit"
        | "withdrawal"
        | "fee"
        | "tax"
        | "transfer_in"
        | "transfer_out"
        | "adjustment"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      allocation_type: [
        "sector",
        "geography",
        "asset_class",
        "esg",
        "factor",
        "currency",
        "custom",
      ],
      app_role: ["admin", "user"],
      asset_category_type: [
        "sector",
        "geography",
        "asset_class",
        "esg",
        "factor",
        "strategy",
        "custom",
      ],
      asset_type: [
        "etf",
        "stock",
        "fund",
        "capitalization_insurance",
        "ppr",
        "bond",
        "cash",
        "crypto",
        "real_estate",
      ],
      benchmark_type: [
        "equity_index",
        "bond_index",
        "commodity",
        "currency",
        "composite",
        "custom",
      ],
      data_provider_type: [
        "market_data",
        "fundamentals",
        "reference_data",
        "documents",
        "other",
      ],
      import_source_type: ["csv", "xlsx", "pdf", "api", "manual"],
      import_status: ["pending", "running", "completed", "failed", "partial"],
      interest_rate_type: ["fixed", "variable", "mixed"],
      liability_type: ["mortgage", "auto_loan", "personal_loan", "other"],
      transaction_type: [
        "buy",
        "sell",
        "dividend",
        "interest",
        "coupon",
        "deposit",
        "withdrawal",
        "fee",
        "tax",
        "transfer_in",
        "transfer_out",
        "adjustment",
      ],
    },
  },
} as const
