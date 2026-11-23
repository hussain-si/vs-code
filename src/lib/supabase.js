import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

/** Storage bucket that holds file contents (created by supabase/schema.sql). */
export const BUCKET = 'user-files'

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

// No login: every request uses the publishable/anon key directly.
export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null
