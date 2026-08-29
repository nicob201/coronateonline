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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      claims: {
        Row: {
          amount: number
          created_at: string
          id: string
          message: string | null
          resolved_at: string | null
          status: string
          title_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          status?: string
          title_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          status?: string
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles_priced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_config: {
        Row: {
          activity_floor_unit: number
          decay_rate_daily: number
          grace_days: number
          id: number
          peak_floor_fraction: number
          peak_window_days: number
        }
        Insert: {
          activity_floor_unit?: number
          decay_rate_daily?: number
          grace_days?: number
          id?: number
          peak_floor_fraction?: number
          peak_window_days?: number
        }
        Update: {
          activity_floor_unit?: number
          decay_rate_daily?: number
          grace_days?: number
          id?: number
          peak_floor_fraction?: number
          peak_window_days?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          instagram: string | null
          is_admin: boolean
          tiktok: string | null
          twitch: string | null
          username: string
          website: string | null
          x: string | null
          youtube: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          instagram?: string | null
          is_admin?: boolean
          tiktok?: string | null
          twitch?: string | null
          username: string
          website?: string | null
          x?: string | null
          youtube?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          instagram?: string | null
          is_admin?: boolean
          tiktok?: string | null
          twitch?: string | null
          username?: string
          website?: string | null
          x?: string | null
          youtube?: string | null
        }
        Relationships: []
      }
      reigns: {
        Row: {
          dethroned_user_id: string | null
          ended_at: string | null
          id: string
          message: string | null
          price_paid: number
          started_at: string
          title_id: string
          user_id: string
        }
        Insert: {
          dethroned_user_id?: string | null
          ended_at?: string | null
          id?: string
          message?: string | null
          price_paid: number
          started_at?: string
          title_id: string
          user_id: string
        }
        Update: {
          dethroned_user_id?: string | null
          ended_at?: string | null
          id?: string
          message?: string | null
          price_paid?: number
          started_at?: string
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reigns_dethroned_user_id_fkey"
            columns: ["dethroned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reigns_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reigns_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles_priced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reigns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      titles: {
        Row: {
          created_at: string
          description: string
          emoji: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description: string
          emoji: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      titles_priced: {
        Row: {
          created_at: string | null
          current_price: number | null
          description: string | null
          emoji: string | null
          holder_avatar_url: string | null
          holder_display_name: string | null
          holder_message: string | null
          holder_paid: number | null
          holder_user_id: string | null
          holder_username: string | null
          id: string | null
          name: string | null
          price_floor: number | null
          reign_id: string | null
          reign_started_at: string | null
          slug: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reigns_user_id_fkey"
            columns: ["holder_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_claim: {
        Args: { p_claim_id: string; p_clear_message?: boolean }
        Returns: undefined
      }
      create_claim: {
        Args: { p_amount: number; p_message?: string; p_title_id: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          message: string | null
          resolved_at: string | null
          status: string
          title_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_claim: { Args: { p_claim_id: string }; Returns: undefined }
      title_current_price: { Args: { p_title_id: string }; Returns: number }
      title_price_floor: { Args: { p_title_id: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
