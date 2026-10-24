export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      bot_lines: {
        Row: {
          bot_id: string;
          id: string;
          line: string;
        };
        ComputedFields: never;
        Insert: {
          bot_id: string;
          id?: string;
          line: string;
        };
        Update: {
          bot_id?: string;
          id?: string;
          line?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bot_lines_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      coin_ledger: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          reason: string;
          reign_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          reason: string;
          reign_id?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          reason?: string;
          reign_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coin_ledger_reign_id_fkey";
            columns: ["reign_id"];
            isOneToOne: false;
            referencedRelation: "reigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coin_ledger_reign_id_fkey";
            columns: ["reign_id"];
            isOneToOne: false;
            referencedRelation: "titles_priced";
            referencedColumns: ["reign_id"];
          },
          {
            foreignKeyName: "coin_ledger_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_seen: {
        Row: {
          seen_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          seen_at: string;
          user_id: string;
        };
        Update: {
          seen_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_seen_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing_config: {
        Row: {
          activity_floor_unit: number;
          bot_half_life_hours: number;
          decay_rate_daily: number;
          grace_days: number;
          id: number;
          peak_floor_fraction: number;
          peak_window_days: number;
        };
        ComputedFields: never;
        Insert: {
          activity_floor_unit?: number;
          bot_half_life_hours?: number;
          decay_rate_daily?: number;
          grace_days?: number;
          id?: number;
          peak_floor_fraction?: number;
          peak_window_days?: number;
        };
        Update: {
          activity_floor_unit?: number;
          bot_half_life_hours?: number;
          decay_rate_daily?: number;
          grace_days?: number;
          id?: number;
          peak_floor_fraction?: number;
          peak_window_days?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          instagram: string | null;
          is_admin: boolean;
          is_bot: boolean;
          tiktok: string | null;
          twitch: string | null;
          username: string;
          website: string | null;
          x: string | null;
          youtube: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          instagram?: string | null;
          is_admin?: boolean;
          is_bot?: boolean;
          tiktok?: string | null;
          twitch?: string | null;
          username: string;
          website?: string | null;
          x?: string | null;
          youtube?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          instagram?: string | null;
          is_admin?: boolean;
          is_bot?: boolean;
          tiktok?: string | null;
          twitch?: string | null;
          username?: string;
          website?: string | null;
          x?: string | null;
          youtube?: string | null;
        };
        Relationships: [];
      };
      provinces: {
        Row: {
          code: string;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          name: string;
          slug: string;
        };
        Update: {
          code?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      reigns: {
        Row: {
          dethroned_user_id: string | null;
          ended_at: string | null;
          id: string;
          message: string | null;
          price_paid: number;
          started_at: string;
          title_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          dethroned_user_id?: string | null;
          ended_at?: string | null;
          id?: string;
          message?: string | null;
          price_paid: number;
          started_at?: string;
          title_id: string;
          user_id: string;
        };
        Update: {
          dethroned_user_id?: string | null;
          ended_at?: string | null;
          id?: string;
          message?: string | null;
          price_paid?: number;
          started_at?: string;
          title_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reigns_dethroned_user_id_fkey";
            columns: ["dethroned_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reigns_title_id_fkey";
            columns: ["title_id"];
            isOneToOne: false;
            referencedRelation: "titles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reigns_title_id_fkey";
            columns: ["title_id"];
            isOneToOne: false;
            referencedRelation: "titles_priced";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reigns_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      titles: {
        Row: {
          created_at: string;
          description: string;
          emoji: string;
          id: string;
          level: string | null;
          location: unknown;
          name: string;
          province_code: string | null;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description: string;
          emoji: string;
          id?: string;
          level?: string | null;
          location?: unknown;
          name: string;
          province_code?: string | null;
          slug: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          emoji?: string;
          id?: string;
          level?: string | null;
          location?: unknown;
          name?: string;
          province_code?: string | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "titles_province_code_fkey";
            columns: ["province_code"];
            isOneToOne: false;
            referencedRelation: "provinces";
            referencedColumns: ["code"];
          },
        ];
      };
    };
    Views: {
      titles_priced: {
        Row: {
          created_at: string;
          current_price: number | null;
          description: string;
          emoji: string;
          holder_avatar_url: string | null;
          holder_display_name: string | null;
          holder_is_bot: boolean | null;
          holder_message: string | null;
          holder_paid: number | null;
          holder_user_id: string | null;
          holder_username: string | null;
          id: string;
          level: string | null;
          name: string;
          price_floor: number | null;
          province_code: string | null;
          reign_id: string | null;
          reign_started_at: string | null;
          slug: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "reigns_user_id_fkey";
            columns: ["holder_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "titles_province_code_fkey";
            columns: ["province_code"];
            isOneToOne: false;
            referencedRelation: "provinces";
            referencedColumns: ["code"];
          },
        ];
      };
    };
    Functions: {
      ar_date: { Args: { p_at: string }; Returns: string };
      bot_move: {
        Args: Record<PropertyKey, never>;
        Returns: {
          dethroned_user_id: string | null;
          ended_at: string | null;
          id: string;
          message: string | null;
          price_paid: number;
          started_at: string;
          title_id: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "reigns";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      bot_tick: { Args: Record<PropertyKey, never>; Returns: undefined };
      claim_salary: { Args: Record<PropertyKey, never>; Returns: number };
      coin_balance: { Args: { p_user_id: string }; Returns: number };
      dethrone_with_coins: {
        Args: { p_amount: number; p_message?: string; p_title_id: string };
        Returns: {
          dethroned_user_id: string | null;
          ended_at: string | null;
          id: string;
          message: string | null;
          price_paid: number;
          started_at: string;
          title_id: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "reigns";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_notifications_seen: { Args: Record<PropertyKey, never>; Returns: undefined };
      province_leaderboard: {
        Args: { p_limit?: number };
        Returns: {
          ended_at: string;
          holder_display_name: string;
          holder_is_bot: boolean;
          holder_username: string;
          price_paid: number;
          province_code: string;
          rank: number;
          reign_id: string;
          started_at: string;
          title_emoji: string;
          title_name: string;
          title_slug: string;
        }[];
      };
      salary_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          claimed_today: boolean;
          next_amount: number;
          streak: number;
        }[];
      };
      title_current_price: { Args: { p_title_id: string }; Returns: number };
      title_price_floor: { Args: { p_title_id: string }; Returns: number };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
