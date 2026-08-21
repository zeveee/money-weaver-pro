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
      allocation_types: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      allocation_values: {
        Row: {
          allocation_type_id: string
          created_at: string
          id: string
          value: string
        }
        Insert: {
          allocation_type_id: string
          created_at?: string
          id?: string
          value: string
        }
        Update: {
          allocation_type_id?: string
          created_at?: string
          id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_values_allocation_type_id_fkey"
            columns: ["allocation_type_id"]
            isOneToOne: false
            referencedRelation: "allocation_types"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_allocations: {
        Row: {
          allocation_value_id: string
          asset_id: string
          created_at: string
          id: string
          percentage: number
        }
        Insert: {
          allocation_value_id: string
          asset_id: string
          created_at?: string
          id?: string
          percentage: number
        }
        Update: {
          allocation_value_id?: string
          asset_id?: string
          created_at?: string
          id?: string
          percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_allocations_allocation_value_id_fkey"
            columns: ["allocation_value_id"]
            isOneToOne: false
            referencedRelation: "allocation_values"
            referencedColumns: ["id"]
          },
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
        }
        Insert: {
          category_name: string
          category_type: Database["public"]["Enums"]["asset_category_type"]
          created_at?: string
          id?: string
        }
        Update: {
          category_name?: string
          category_type?: Database["public"]["Enums"]["asset_category_type"]
          created_at?: string
          id?: string
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
      asset_performance_snapshots: {
        Row: {
          asset_id: string
          created_at: string
          gain_loss: number
          id: string
          invested_capital: number
          market_value: number
          snapshot_date: string
          xirr: number | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          gain_loss: number
          id?: string
          invested_capital: number
          market_value: number
          snapshot_date: string
          xirr?: number | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          gain_loss?: number
          id?: string
          invested_capital?: number
          market_value?: number
          snapshot_date?: string
          xirr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_performance_snapshots_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_provider_links: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          last_synced_date: string | null
          last_verified_at: string | null
          provider: string
          provider_currency: string | null
          provider_exchange: string | null
          provider_instrument_id: string | null
          provider_symbol: string | null
          raw_metadata: Json | null
          resolved_at: string
          status: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          last_synced_date?: string | null
          last_verified_at?: string | null
          provider: string
          provider_currency?: string | null
          provider_exchange?: string | null
          provider_instrument_id?: string | null
          provider_symbol?: string | null
          raw_metadata?: Json | null
          resolved_at?: string
          status?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          last_synced_date?: string | null
          last_verified_at?: string | null
          provider?: string
          provider_currency?: string | null
          provider_exchange?: string | null
          provider_instrument_id?: string | null
          provider_symbol?: string | null
          raw_metadata?: Json | null
          resolved_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_provider_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_types: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      asset_valuations: {
        Row: {
          asset_id: string
          created_at: string
          currency: string
          id: string
          is_manual: boolean
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
          is_manual?: boolean
          source?: string | null
          total_value: number
          unit_price?: number | null
          valuation_date: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_manual?: boolean
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
      benchmark_returns: {
        Row: {
          benchmark_id: string
          created_at: string
          date: string
          id: string
          return_value: number
        }
        Insert: {
          benchmark_id: string
          created_at?: string
          date: string
          id?: string
          return_value: number
        }
        Update: {
          benchmark_id?: string
          created_at?: string
          date?: string
          id?: string
          return_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_returns_benchmark_id_fkey"
            columns: ["benchmark_id"]
            isOneToOne: false
            referencedRelation: "benchmarks"
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
        }
        Insert: {
          benchmark_type: Database["public"]["Enums"]["benchmark_type"]
          created_at?: string
          id?: string
          isin?: string | null
          name: string
          provider?: string | null
          ticker?: string | null
        }
        Update: {
          benchmark_type?: Database["public"]["Enums"]["benchmark_type"]
          created_at?: string
          id?: string
          isin?: string | null
          name?: string
          provider?: string | null
          ticker?: string | null
        }
        Relationships: []
      }
      data_providers: {
        Row: {
          created_at: string
          id: string
          provider_name: string
          provider_type: Database["public"]["Enums"]["data_provider_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          provider_name: string
          provider_type: Database["public"]["Enums"]["data_provider_type"]
        }
        Update: {
          created_at?: string
          id?: string
          provider_name?: string
          provider_type?: Database["public"]["Enums"]["data_provider_type"]
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          base_currency: string
          created_at: string
          date: string
          exchange_rate: number
          id: string
          quote_currency: string
          source: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          date: string
          exchange_rate: number
          id?: string
          quote_currency: string
          source?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          date?: string
          exchange_rate?: number
          id?: string
          quote_currency?: string
          source?: string
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          metadata: Json
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
          metadata?: Json
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
          metadata?: Json
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
          principal_amount: number
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
          amount: number
          created_at?: string
          fees?: number
          id?: string
          interest_portion?: number
          liability_id: string
          notes?: string | null
          paid_at: string
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
      liability_types: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      portfolio_benchmarks: {
        Row: {
          benchmark_id: string
          created_at: string
          id: string
          portfolio_id: string
          weight: number
        }
        Insert: {
          benchmark_id: string
          created_at?: string
          id?: string
          portfolio_id: string
          weight?: number
        }
        Update: {
          benchmark_id?: string
          created_at?: string
          id?: string
          portfolio_id?: string
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
      portfolio_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          base_currency: string
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "portfolio_groups"
            referencedColumns: ["id"]
          },
        ]
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
      recurring_transactions: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          currency: string
          day_of_month: number | null
          end_date: string | null
          execution_mode: Database["public"]["Enums"]["recurrence_execution_mode"]
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id: string
          is_active: boolean
          last_generated_on: string | null
          metadata: Json
          notes: string | null
          start_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          asset_id: string
          created_at?: string
          currency?: string
          day_of_month?: number | null
          end_date?: string | null
          execution_mode?: Database["public"]["Enums"]["recurrence_execution_mode"]
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          is_active?: boolean
          last_generated_on?: string | null
          metadata?: Json
          notes?: string | null
          start_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          currency?: string
          day_of_month?: number | null
          end_date?: string | null
          execution_mode?: Database["public"]["Enums"]["recurrence_execution_mode"]
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          is_active?: boolean
          last_generated_on?: string | null
          metadata?: Json
          notes?: string | null
          start_date?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      securities: {
        Row: {
          classification_source: string | null
          classified_at: string | null
          composite_figi: string | null
          country: string | null
          created_at: string
          currency: string | null
          cusip: string | null
          exchange: string | null
          figi: string | null
          id: string
          industry: string | null
          isin: string | null
          market_sector: string | null
          name: string | null
          sector: string | null
          security_type: string | null
          sedol: string | null
          share_class_figi: string | null
          source: string
          source_payload: Json
          ticker: string | null
          updated_at: string
        }
        Insert: {
          classification_source?: string | null
          classified_at?: string | null
          composite_figi?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          cusip?: string | null
          exchange?: string | null
          figi?: string | null
          id?: string
          industry?: string | null
          isin?: string | null
          market_sector?: string | null
          name?: string | null
          sector?: string | null
          security_type?: string | null
          sedol?: string | null
          share_class_figi?: string | null
          source?: string
          source_payload?: Json
          ticker?: string | null
          updated_at?: string
        }
        Update: {
          classification_source?: string | null
          classified_at?: string | null
          composite_figi?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          cusip?: string | null
          exchange?: string | null
          figi?: string | null
          id?: string
          industry?: string | null
          isin?: string | null
          market_sector?: string | null
          name?: string | null
          sector?: string | null
          security_type?: string | null
          sedol?: string | null
          share_class_figi?: string | null
          source?: string
          source_payload?: Json
          ticker?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      security_lookup_candidates: {
        Row: {
          first_seen_at: string
          id: string
          lookup_key: string
          security_id: string
        }
        Insert: {
          first_seen_at?: string
          id?: string
          lookup_key: string
          security_id: string
        }
        Update: {
          first_seen_at?: string
          id?: string
          lookup_key?: string
          security_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_lookup_candidates_lookup_key_fkey"
            columns: ["lookup_key"]
            isOneToOne: false
            referencedRelation: "security_lookups"
            referencedColumns: ["lookup_key"]
          },
          {
            foreignKeyName: "security_lookup_candidates_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities"
            referencedColumns: ["id"]
          },
        ]
      }
      security_lookups: {
        Row: {
          candidate_count: number
          created_at: string
          id: string
          id_type: string
          id_value: string
          lookup_key: string
          message: string | null
          security_id: string | null
          source: string
          status: Database["public"]["Enums"]["security_match_status"]
          updated_at: string
        }
        Insert: {
          candidate_count?: number
          created_at?: string
          id?: string
          id_type: string
          id_value: string
          lookup_key: string
          message?: string | null
          security_id?: string | null
          source?: string
          status: Database["public"]["Enums"]["security_match_status"]
          updated_at?: string
        }
        Update: {
          candidate_count?: number
          created_at?: string
          id?: string
          id_type?: string
          id_value?: string
          lookup_key?: string
          message?: string | null
          security_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["security_match_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_lookups_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities"
            referencedColumns: ["id"]
          },
        ]
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
          recurring_transaction_id: string | null
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
          occurred_at: string
          quantity?: number
          recurring_transaction_id?: string | null
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
          recurring_transaction_id?: string | null
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
          {
            foreignKeyName: "transactions_recurring_transaction_id_fkey"
            columns: ["recurring_transaction_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
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
      [_ in never]: never
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
        | "commodity"
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
      recurrence_execution_mode: "manual" | "automatic"
      recurrence_frequency:
        | "weekly"
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "annual"
      security_match_status: "identified" | "ambiguous" | "unidentified"
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
        "commodity",
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
      recurrence_execution_mode: ["manual", "automatic"],
      recurrence_frequency: [
        "weekly",
        "monthly",
        "quarterly",
        "semiannual",
        "annual",
      ],
      security_match_status: ["identified", "ambiguous", "unidentified"],
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
