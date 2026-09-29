import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client factory.
 *
 * Uses @supabase/ssr's browser client on purpose: it stores the session in a
 * cookie (sb-<ref>-auth-token) instead of localStorage, so the Chrome
 * extension can read the session via the `cookies` permission and call
 * /api/rewrite on the user's behalf. With a plain createClient the session
 * would live in localStorage and the extension could never see it.
 *
 * Created lazily: constructing the client throws when the URL/key are
 * missing, and a module-level call would break `next build` (which
 * prerenders /dashboard) on any machine without NEXT_PUBLIC_SUPABASE_* set.
 */
let cached: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export function getSupabase(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  cached = createBrowserClient(url, anonKey)
  return cached
}

export const TONES = [
  'professional',
  'casual',
  'academic',
  'persuasive',
  'concise',
] as const

export type Tone = (typeof TONES)[number]

export interface Profile {
  id: string
  email?: string
  display_name?: string
  credits: number
  total_credits_purchased: number
  is_pro: boolean
  style_profile: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Rewrite {
  id: number
  user_id: string
  original_text: string
  rewritten_text: string
  tone: Tone
  style_profile_id: string | null
  tokens_used: number
  created_at: string
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

export async function rewriteText(
  text: string,
  tone: Tone
): Promise<{ result: string; tokensUsed: number }> {
  const { data, error } = await getSupabase().functions.invoke('rewrite-text', {
    body: { text, tone },
  })

  if (error) throw error
  return data
}
