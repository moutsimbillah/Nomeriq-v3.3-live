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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          performed_by: string
          target_user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          performed_by: string
          target_user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string
          target_user_id?: string
        }
        Relationships: []
      }
      admin_roles: {
        Row: {
          admin_role: Database["public"]["Enums"]["admin_role"]
          created_at: string
          id: string
          last_login: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_role?: Database["public"]["Enums"]["admin_role"]
          created_at?: string
          id?: string
          last_login?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_role?: Database["public"]["Enums"]["admin_role"]
          created_at?: string
          id?: string
          last_login?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          action_type: string
          attempt_count: number
          blocked_until: string | null
          created_at: string
          email: string
          first_attempt_at: string
          id: string
          last_attempt_at: string
        }
        Insert: {
          action_type: string
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          email: string
          first_attempt_at?: string
          id?: string
          last_attempt_at?: string
        }
        Update: {
          action_type?: string
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          email?: string
          first_attempt_at?: string
          id?: string
          last_attempt_at?: string
        }
        Relationships: []
      }
      discounts: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          type: string
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          type: string
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          type?: string
          value?: number
        }
        Relationships: []
      }
      email_template_settings: {
        Row: {
          id: string
          reset_body: string
          reset_subject: string
          sender_email: string
          sender_name: string
          updated_at: string
          verification_body: string
          verification_subject: string
        }
        Insert: {
          id?: string
          reset_body?: string
          reset_subject?: string
          sender_email?: string
          sender_name?: string
          updated_at?: string
          verification_body?: string
          verification_subject?: string
        }
        Update: {
          id?: string
          reset_body?: string
          reset_subject?: string
          sender_email?: string
          sender_name?: string
          updated_at?: string
          verification_body?: string
          verification_subject?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          pair: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pair: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pair?: string
          user_id?: string
        }
        Relationships: []
      }
      global_settings: {
        Row: {
          brand_name: string
          copyright_name: string | null
          disclaimer_text: string | null
          global_risk_percent: number
          id: string
          logo_url: string | null
          logo_url_dark: string | null
          social_discord: string | null
          social_facebook: string | null
          social_instagram: string | null
          social_telegram: string | null
          social_twitter: string | null
          subscription_price: number
          support_email: string | null
          support_phone: string | null
          timezone: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          brand_name?: string
          copyright_name?: string | null
          disclaimer_text?: string | null
          global_risk_percent?: number
          id?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          social_discord?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_telegram?: string | null
          social_twitter?: string | null
          subscription_price?: number
          support_email?: string | null
          support_phone?: string | null
          timezone?: string
          updated_at?: string
          wallet_address?: string
        }
        Update: {
          brand_name?: string
          copyright_name?: string | null
          disclaimer_text?: string | null
          global_risk_percent?: number
          id?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          social_discord?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_telegram?: string | null
          social_twitter?: string | null
          subscription_price?: number
          support_email?: string | null
          support_phone?: string | null
          timezone?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      legal_pages: {
        Row: {
          content: string
          id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          id?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          attempt_count: number
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used: boolean
        }
        Insert: {
          attempt_count?: number
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          used?: boolean
        }
        Update: {
          attempt_count?: number
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json | null
          package_id: string | null
          payment_method: string
          provider: string
          provider_customer_id: string | null
          provider_payment_id: string | null
          provider_session_id: string | null
          provider_subscription_id: string | null
          rejection_reason: string | null
          status: string
          tx_hash: string | null
          user_bank_account_name: string | null
          user_bank_account_number: string | null
          user_bank_name: string | null
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          package_id?: string | null
          payment_method?: string
          provider?: string
          provider_customer_id?: string | null
          provider_payment_id?: string | null
          provider_session_id?: string | null
          provider_subscription_id?: string | null
          rejection_reason?: string | null
          status?: string
          tx_hash?: string | null
          user_bank_account_name?: string | null
          user_bank_account_number?: string | null
          user_bank_name?: string | null
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          package_id?: string | null
          payment_method?: string
          provider?: string
          provider_customer_id?: string | null
          provider_payment_id?: string | null
          provider_session_id?: string | null
          provider_subscription_id?: string | null
          rejection_reason?: string | null
          status?: string
          tx_hash?: string | null
          user_bank_account_name?: string | null
          user_bank_account_number?: string | null
          user_bank_name?: string | null
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      payment_provider_settings: {
        Row: {
          created_at: string
          id: string
          provider: string
          stripe_publishable_key: string | null
          stripe_secret_key: string | null
          stripe_webhook_endpoint: string | null
          stripe_webhook_secret: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          stripe_publishable_key?: string | null
          stripe_secret_key?: string | null
          stripe_webhook_endpoint?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          stripe_publishable_key?: string | null
          stripe_secret_key?: string | null
          stripe_webhook_endpoint?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_balance: number | null
          avatar_url: string | null
          balance_set_at: string | null
          starting_balance: number | null
          created_at: string
          custom_risk_percent: number | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          telegram_username: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          account_balance?: number | null
          avatar_url?: string | null
          balance_set_at?: string | null
          starting_balance?: number | null
          created_at?: string
          custom_risk_percent?: number | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          account_balance?: number | null
          avatar_url?: string | null
          balance_set_at?: string | null
          starting_balance?: number | null
          created_at?: string
          custom_risk_percent?: number | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      provider_telegram_settings: {
        Row: {
          bot_token: string
          chat_id: string
          created_at: string
          id: string
          is_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_token: string
          chat_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_token?: string
          chat_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_integrations: {
        Row: {
          bot_token: string
          categories: string[]
          chat_id: string
          created_at: string
          id: string
          include_risk: boolean
          include_sl: boolean
          include_tp: boolean
          is_enabled: boolean
          message_header: string | null
          message_footer: string | null
          message_tags: string[]
          name: string
          updated_at: string
        }
        Insert: {
          bot_token: string
          categories?: string[]
          chat_id: string
          created_at?: string
          id?: string
          include_risk?: boolean
          include_sl?: boolean
          include_tp?: boolean
          is_enabled?: boolean
          message_header?: string | null
          message_footer?: string | null
          message_tags?: string[]
          name: string
          updated_at?: string
        }
        Update: {
          bot_token?: string
          categories?: string[]
          chat_id?: string
          created_at?: string
          id?: string
          include_risk?: boolean
          include_sl?: boolean
          include_tp?: boolean
          is_enabled?: boolean
          message_header?: string | null
          message_footer?: string | null
          message_tags?: string[]
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          analysis_image_url: string | null
          analysis_notes: string | null
          analysis_video_url: string | null
          category: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          direction: string
          entry_price: number | null
          id: string
          notes: string | null
          pair: string
          send_closed_trades_to_telegram: boolean
          send_updates_to_telegram: boolean
          signal_type: string
          status: string
          stop_loss: number | null
          take_profit: number | null
          tracking_status: string | null
          upcoming_status: string | null
          updated_at: string
        }
        Insert: {
          analysis_image_url?: string | null
          analysis_notes?: string | null
          analysis_video_url?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          entry_price?: number | null
          id?: string
          notes?: string | null
          pair: string
          send_closed_trades_to_telegram?: boolean
          send_updates_to_telegram?: boolean
          signal_type?: string
          status?: string
          stop_loss?: number | null
          take_profit?: number | null
          tracking_status?: string | null
          upcoming_status?: string | null
          updated_at?: string
        }
        Update: {
          analysis_image_url?: string | null
          analysis_notes?: string | null
          analysis_video_url?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          entry_price?: number | null
          id?: string
          notes?: string | null
          pair?: string
          send_closed_trades_to_telegram?: boolean
          send_updates_to_telegram?: boolean
          signal_type?: string
          status?: string
          stop_loss?: number | null
          take_profit?: number | null
          tracking_status?: string | null
          upcoming_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      signal_take_profit_updates: {
        Row: {
          close_percent: number
          created_at: string
          created_by: string
          id: string
          note: string | null
          signal_id: string
          tp_label: string
          tp_price: number
        }
        Insert: {
          close_percent: number
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          signal_id: string
          tp_label: string
          tp_price: number
        }
        Update: {
          close_percent?: number
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          signal_id?: string
          tp_label?: string
          tp_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "signal_take_profit_updates_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          package_id: string | null
          payment_id: string | null
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          starts_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          package_id?: string | null
          payment_id?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          package_id?: string | null
          payment_id?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_trades: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          initial_risk_amount: number
          last_update_at: string | null
          pnl: number | null
          realized_pnl: number
          remaining_risk_amount: number
          result: string | null
          risk_amount: number
          risk_percent: number
          signal_id: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          initial_risk_amount?: number
          last_update_at?: string | null
          pnl?: number | null
          realized_pnl?: number
          remaining_risk_amount?: number
          result?: string | null
          risk_amount: number
          risk_percent: number
          signal_id: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          initial_risk_amount?: number
          last_update_at?: string | null
          pnl?: number | null
          realized_pnl?: number
          remaining_risk_amount?: number
          result?: string | null
          risk_amount?: number
          risk_percent?: number
          signal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_trades_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_trade_take_profit_updates: {
        Row: {
          close_percent: number
          created_at: string
          id: string
          realized_pnl: number
          signal_update_id: string
          user_trade_id: string
        }
        Insert: {
          close_percent: number
          created_at?: string
          id?: string
          realized_pnl: number
          signal_update_id: string
          user_trade_id: string
        }
        Update: {
          close_percent?: number
          created_at?: string
          id?: string
          realized_pnl?: number
          signal_update_id?: string
          user_trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_trade_take_profit_updates_signal_update_id_fkey"
            columns: ["signal_update_id"]
            isOneToOne: false
            referencedRelation: "signal_take_profit_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_trade_take_profit_updates_user_trade_id_fkey"
            columns: ["user_trade_id"]
            isOneToOne: false
            referencedRelation: "user_trades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_reset_tokens: { Args: never; Returns: undefined }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      count_super_admins: { Args: never; Returns: number }
      has_active_subscription: { Args: { _user_id: string }; Returns: boolean }
      has_admin_role: {
        Args: {
          _admin_role: Database["public"]["Enums"]["admin_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      admin_role: "super_admin" | "payments_admin" | "signal_provider_admin"
      app_role: "admin" | "user"
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
      admin_role: ["super_admin", "payments_admin", "signal_provider_admin"],
      app_role: ["admin", "user"],
    },
  },
} as const
