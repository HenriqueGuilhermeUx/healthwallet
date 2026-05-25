import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types para o banco de dados
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          avatar_url?: string
          created_at: string
        }
        Insert: {
          email: string
          name?: string
          avatar_url?: string
        }
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          birth_date?: string
          gender?: 'male' | 'female' | 'other'
          blood_type?: string
          allergies?: string[]
          phone?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          birth_date?: string
          gender?: 'male' | 'female' | 'other'
          blood_type?: string
          allergies?: string[]
          phone?: string
        }
      }
      health_plans: {
        Row: {
          id: string
          user_id: string
          plan_name: string
          plan_type: 'private' | 'sus'
          card_number: string
          operator_name?: string
          beneficiary_name: string
          validity?: string
          created_at: string
        }
        Insert: {
          user_id: string
          plan_name: string
          plan_type: 'private' | 'sus'
          card_number: string
          operator_name?: string
          beneficiary_name: string
          validity?: string
        }
      }
      medical_records: {
        Row: {
          id: string
          user_id: string
          file_url: string
          file_name: string
          exam_type: string
          exam_date?: string
          laboratory?: string
          extracted_data?: Record<string, unknown>
          ai_analysis?: string
          status: 'pending' | 'processed'
          created_at: string
        }
        Insert: {
          user_id: string
          file_url: string
          file_name: string
          exam_type: string
          exam_date?: string
          laboratory?: string
        }
      }
      medications: {
        Row: {
          id: string
          user_id: string
          name: string
          dosage: string
          frequency: string
          start_date?: string
          end_date?: string
          notes?: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          name: string
          dosage: string
          frequency: string
          start_date?: string
          end_date?: string
          notes?: string
          is_active?: boolean
        }
      }
      family_members: {
        Row: {
          id: string
          user_id: string
          name: string
          relationship: string
          birth_date?: string
          blood_type?: string
          allergies?: string[]
          created_at: string
        }
        Insert: {
          user_id: string
          name: string
          relationship: string
          birth_date?: string
          blood_type?: string
          allergies?: string[]
        }
      }
    }
  }
}