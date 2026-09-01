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
      app_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      bed_submissions: {
        Row: {
          bed_type_id: string | null
          calculated_fields: Json
          closed: number
          closure_reason: string | null
          created_at: string
          custom_fields: Json
          department_id: string
          id: string
          occupied: number
          submitted_by: string
          submitted_on: string
          total_beds: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bed_type_id?: string | null
          calculated_fields?: Json
          closed?: number
          closure_reason?: string | null
          created_at?: string
          custom_fields?: Json
          department_id: string
          id?: string
          occupied?: number
          submitted_by: string
          submitted_on?: string
          total_beds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bed_type_id?: string | null
          calculated_fields?: Json
          closed?: number
          closure_reason?: string | null
          created_at?: string
          custom_fields?: Json
          department_id?: string
          id?: string
          occupied?: number
          submitted_by?: string
          submitted_on?: string
          total_beds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bed_submissions_bed_type_id_fkey"
            columns: ["bed_type_id"]
            isOneToOne: false
            referencedRelation: "bed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_submissions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      bed_types: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      form_fields: {
        Row: {
          created_at: string
          default_value: string | null
          display_order: number
          editable_roles: Database["public"]["Enums"]["app_role"][]
          field_key: string
          field_type: Database["public"]["Enums"]["form_field_type"]
          id: string
          is_active: boolean
          is_readonly: boolean
          is_required: boolean
          is_system: boolean
          label: string
          options: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          display_order?: number
          editable_roles?: Database["public"]["Enums"]["app_role"][]
          field_key: string
          field_type: Database["public"]["Enums"]["form_field_type"]
          id?: string
          is_active?: boolean
          is_readonly?: boolean
          is_required?: boolean
          is_system?: boolean
          label: string
          options?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          display_order?: number
          editable_roles?: Database["public"]["Enums"]["app_role"][]
          field_key?: string
          field_type?: Database["public"]["Enums"]["form_field_type"]
          id?: string
          is_active?: boolean
          is_readonly?: boolean
          is_required?: boolean
          is_system?: boolean
          label?: string
          options?: Json
          updated_at?: string
        }
        Relationships: []
      }
      kpi_formulas: {
        Row: {
          created_at: string
          created_by: string | null
          expression: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expression: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expression?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      kpi_widgets: {
        Row: {
          aggregation_scope: string
          created_at: string
          created_by: string | null
          display_order: number
          formula_id: string | null
          id: string
          is_visible: boolean
          name: string
          refresh_seconds: number
          updated_at: string
        }
        Insert: {
          aggregation_scope?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          formula_id?: string | null
          id?: string
          is_visible?: boolean
          name: string
          refresh_seconds?: number
          updated_at?: string
        }
        Update: {
          aggregation_scope?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          formula_id?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          refresh_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_widgets_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "kpi_formulas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_admin: { Args: never; Returns: boolean }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_admin_or_director: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "director" | "doctor" | "nurse" | "staff"
      form_field_type:
        | "number"
        | "text"
        | "textarea"
        | "select"
        | "boolean"
        | "date"
        | "formula"
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
      app_role: ["admin", "director", "doctor", "nurse", "staff"],
      form_field_type: [
        "number",
        "text",
        "textarea",
        "select",
        "boolean",
        "date",
        "formula",
      ],
    },
  },
} as const
