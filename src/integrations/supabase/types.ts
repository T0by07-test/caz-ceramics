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
      bookings: {
        Row: {
          cancelled_at: string | null
          class_id: string
          created_at: string
          id: string
          source: string
          status: string
          student_id: string
        }
        Insert: {
          cancelled_at?: string | null
          class_id: string
          created_at?: string
          id?: string
          source: string
          status?: string
          student_id: string
        }
        Update: {
          cancelled_at?: string | null
          class_id?: string
          created_at?: string
          id?: string
          source?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          capacity_ideal: number
          capacity_max: number
          created_at: string
          date: string
          end_time: string
          id: string
          start_time: string
          status: string
        }
        Insert: {
          capacity_ideal?: number
          capacity_max?: number
          created_at?: string
          date: string
          end_time: string
          id?: string
          start_time: string
          status?: string
        }
        Update: {
          capacity_ideal?: number
          capacity_max?: number
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          start_time?: string
          status?: string
        }
        Relationships: []
      }
      makeups: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          source_booking_id: string
          student_id: string
          used_booking_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          source_booking_id: string
          student_id: string
          used_booking_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          source_booking_id?: string
          student_id?: string
          used_booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "makeups_source_booking_id_fkey"
            columns: ["source_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeups_used_booking_id_fkey"
            columns: ["used_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          dedup_key: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          retry_count: number
          sent_at: string | null
          status: string
          student_id: string
          type: string
        }
        Insert: {
          channel: string
          created_at?: string
          dedup_key?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          retry_count?: number
          sent_at?: string | null
          status?: string
          student_id: string
          type: string
        }
        Update: {
          channel?: string
          created_at?: string
          dedup_key?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          retry_count?: number
          sent_at?: string | null
          status?: string
          student_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          booking_id: string | null
          created_at: string
          id: string
          status: string
          stripe_session_id: string | null
          student_id: string
          subscription_id: string | null
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          created_at?: string
          id?: string
          status?: string
          stripe_session_id?: string | null
          student_id: string
          subscription_id?: string | null
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          status?: string
          stripe_session_id?: string | null
          student_id?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          classes_per_month: number
          created_at: string
          id: string
          name: string
          price_cents: number
          stripe_price_id: string
        }
        Insert: {
          active?: boolean
          classes_per_month: number
          created_at?: string
          id?: string
          name: string
          price_cents?: number
          stripe_price_id?: string
        }
        Update: {
          active?: boolean
          classes_per_month?: number
          created_at?: string
          id?: string
          name?: string
          price_cents?: number
          stripe_price_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          notification_preference: string
          role: string
          surname: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          notification_preference?: string
          role?: string
          surname?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          notification_preference?: string
          role?: string
          surname?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          credits_remaining: number
          credits_total: number
          id: string
          month: string
          plan_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          credits_remaining: number
          credits_total: number
          id?: string
          month: string
          plan_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          credits_remaining?: number
          credits_total?: number
          id?: string
          month?: string
          plan_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          class_id: string
          created_at: string
          id: string
          position: number
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          position: number
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          position?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_cancel_low_attendance: {
        Args: never
        Returns: {
          affected_bookings: number
          cancelled_class_id: string
        }[]
      }
      book_class: {
        Args: { p_class_id: string; p_source: string }
        Returns: {
          booking_id: string
          status: string
        }[]
      }
      cancel_booking: {
        Args: { p_booking_id: string }
        Returns: {
          booking_id: string
          makeup_id: string
          status: string
        }[]
      }
      claim_notifications: {
        Args: { p_limit: number }
        Returns: {
          channel: string
          id: string
          payload: Json
          retry_count: number
          student_id: string
          type: string
        }[]
      }
      confirm_drop_in_booking: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      enqueue_24h_reminders: { Args: never; Returns: number }
      enqueue_monthly_summary: { Args: never; Returns: number }
      enqueue_notification: {
        Args: {
          p_dedup_suffix: string
          p_payload: Json
          p_student_id: string
          p_type: string
        }
        Returns: undefined
      }
      expire_pending_drop_ins: { Args: never; Returns: number }
      fail_payment: { Args: { p_session_id: string }; Returns: undefined }
      grant_plan_subscription: {
        Args: { p_plan_id: string; p_session_id: string; p_student_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      join_waitlist: {
        Args: { p_class_id: string }
        Returns: {
          pos: number
          waitlist_id: string
        }[]
      }
      mark_notification_failed: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      mark_notification_sent: { Args: { p_id: string }; Returns: undefined }
      promote_waitlist: { Args: { p_class_id: string }; Returns: undefined }
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
  public: {
    Enums: {},
  },
} as const
