import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StyleDNA } from '@/lib/supabase'

export const maxDuration = 30

const TONES = [
  'my_voice',
  'professional',
  'casual',
  'academic',
  'persuasive',
  'concise',
] as const
type Tone = (typeof TONES)[number]

const MAX_CHARS = 5000

// Groq retires models aggressively (llama-3.3-70b-versatile died 2026-08-16),
// so the model is env-overridable: set GROQ_MODEL in Vercel env vars to swap
// without a code change.
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

// Free tier: 50 rewrites inside a rolling 24h window, counted live from the
// rewrites table — so the limit actually resets every day without a cron job.
// Banked credits (purchased, or the signup grant) are only spent once the
// window is exhausted.
const DAILY_FREE_LIMIT = 50
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000

// Anonymous trial: no login needed, 5 rewrites per IP per UTC day.
// Tracked in the anon_usage table keyed by salted SHA-256 of the client IP.
const ANON_DAILY_LIMIT = 5
const ANON_SALT = 'voxly-anon-trial-v1'

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const groqKey = process.env.GROQ_API_KEY
  if (!supabaseUrl || !serviceRoleKey || !groqKey) return null
  return { supabaseUrl, serviceRoleKey, groqKey }
}

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function hashIp(ip: string): string {
  return createHash('sha256').update(`${ANON_SALT}:${ip}`).digest('hex')
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

async function getAnonUsed(
  supabase: SupabaseClient,
  ipHash: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('anon_usage')
    .select('count')
    .eq('ip_hash', ipHash)
    .eq('day', todayUtc())
    .maybeSingle()
  if (error) {
    console.error('Anon usage read failed:', error)
    return null
  }
  return data?.count ?? 0
}

async function bumpAnonUsed(
  supabase: SupabaseClient,
  ipHash: string
): Promise<number | null> {
  const day = todayUtc()
  const current = await getAnonUsed(supabase, ipHash)
  if (current === null) return null
  const next = current + 1
  const { error } = await supabase.from('anon_usage').upsert(
    {
      ip_hash: ipHash,
      day,
      count: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'ip_hash,day' }
  )
  if (error) {
    console.error('Anon usage write failed:', error)
    // TEMP DEBUG: surface the write error to diagnose quota persistence
    throw new Error(`anon_write_failed: ${error.message} [${error.code}]`)
  }
  return next
}

async function callGroq(
  groqKey: string,
  text: string,
  tone: Tone,
  styleDna: StyleDNA | null
): Promise<{ rewritten?: string; tokens?: number; error?: string }> {
  const systemPrompt = buildSystemPrompt(tone, styleDna)

  // Groq uses an OpenAI-compatible API - only the base URL and model name differ.
  const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: tone === 'my_voice' ? 0.55 : 0.7,
    }),
  })

  if (!groqResponse.ok) {
    const detail = await groqResponse.json().catch(() => null)
    console.error('Groq error:', groqResponse.status, detail)
    return { error: 'Rewrite failed upstream' }
  }

  const data = await groqResponse.json()
  const rewritten: string | undefined = data.choices?.[0]?.message?.content?.trim()

  if (!rewritten) {
    console.error('Groq returned an empty completion')
    return { error: 'Rewrite failed upstream' }
  }

  return { rewritten, tokens: data.usage?.total_tokens ?? 0 }
}

/** Quota info for the tool page. Anonymous callers get their trial balance. */
export async function GET(request: NextRequest) {
  const env = getEnv()
  if (!env) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const authed = createClient(env.supabaseUrl, env.serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
    } = await authed.auth.getUser()
    if (user) {
      return NextResponse.json({ loggedIn: true })
    }
  }

  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey)
  const used = await getAnonUsed(supabase, hashIp(getClientIp(request)))
  if (used === null) {
    return NextResponse.json({ error: 'Usage check failed' }, { status: 500 })
  }
  return NextResponse.json({
    loggedIn: false,
    trialLimit: ANON_DAILY_LIMIT,
    trialLeft: Math.max(0, ANON_DAILY_LIMIT - used),
  })
}

export async function POST(request: NextRequest) {
  const env = getEnv()
  if (!env) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }
  const { supabaseUrl, serviceRoleKey, groqKey } = env

  let body: { text?: unknown; tone?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { text, tone } = body

  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Missing required field: text' }, { status: 400 })
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Text too long (max ${MAX_CHARS} characters)` },
      { status: 413 }
    )
  }
  if (typeof tone !== 'string' || !TONES.includes(tone as Tone)) {
    return NextResponse.json(
      { error: `Invalid tone. Must be one of: ${TONES.join(', ')}` },
      { status: 400 }
    )
  }

  // Optional auth: a valid session unlocks the 50/day logged-in quota,
  // otherwise the request falls through to the anonymous trial quota.
  let user: { id: string } | null = null
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const authed = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: authUser },
    } = await authed.auth.getUser()
    user = authUser ? { id: authUser.id } : null
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  if (!user) {
    return handleAnonymousRewrite(supabase, groqKey, request, text, tone as Tone)
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits, is_pro, style_profile')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const isPro = Boolean(profile.is_pro)
  const credits = Number(profile.credits ?? 0)
  const styleDna = (profile.style_profile as StyleDNA | null) ?? null

  if (tone === 'my_voice') {
    if (!styleDna || !styleDna.prompt_instruction) {
      return NextResponse.json(
        { error: 'No voice profile found. Please train your voice first in the Dashboard.' },
        { status: 400 }
      )
    }
  }

  let spentCredit = false

  if (!isPro) {
    const freeWindowFull = await isFreeWindowFull(supabase, user.id)
    if (freeWindowFull === null) {
      return NextResponse.json({ error: 'Usage check failed' }, { status: 500 })
    }

    if (freeWindowFull) {
      if (credits <= 0) {
        return NextResponse.json(
          { error: 'Daily free limit reached. Upgrade to Pro for unlimited rewrites.' },
          { status: 402 }
        )
      }

      const { data: reserved, error: reserveError } = await supabase
        .from('profiles')
        .update({ credits: credits - 1 })
        .eq('id', user.id)
        .eq('credits', credits)
        .select('credits')

      if (reserveError) {
        console.error('Credit reservation failed:', reserveError)
        return NextResponse.json({ error: 'Credit reservation failed' }, { status: 500 })
      }
      if (!reserved || reserved.length === 0) {
        return NextResponse.json({ error: 'No credits remaining' }, { status: 402 })
      }
      spentCredit = true
    }
  }

  const { rewritten, tokens, error } = await callGroq(groqKey, text, tone as Tone, styleDna)
  if (error || !rewritten) {
    if (spentCredit) await refundCredit(supabase, user.id, credits)
    return NextResponse.json({ error: error ?? 'Rewrite failed upstream' }, { status: 502 })
  }

  await supabase.from('rewrites').insert({
    user_id: user.id,
    original_text: text,
    rewritten_text: rewritten,
    tone,
    tokens_used: tokens ?? 0,
  })

  return NextResponse.json({ result: rewritten })
}

async function handleAnonymousRewrite(
  supabase: SupabaseClient,
  groqKey: string,
  request: NextRequest,
  text: string,
  tone: Tone
) {
  if (tone === 'my_voice') {
    return NextResponse.json(
      { error: 'My Voice needs a trained voice profile. Sign in to train yours.' },
      { status: 400 }
    )
  }

  const ipHash = hashIp(getClientIp(request))
  const used = await getAnonUsed(supabase, ipHash)
  if (used === null) {
    return NextResponse.json({ error: 'Usage check failed' }, { status: 500 })
  }
  if (used >= ANON_DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: `You've used all ${ANON_DAILY_LIMIT} free trial rewrites for today. Sign in with Google for ${DAILY_FREE_LIMIT} free rewrites every day.`,
        trialLeft: 0,
        signupPrompt: true,
      },
      { status: 429 }
    )
  }

  const { rewritten, error } = await callGroq(groqKey, text, tone, null)
  if (error || !rewritten) {
    return NextResponse.json({ error: error ?? 'Rewrite failed upstream' }, { status: 502 })
  }

  let next: number | null
  try {
    next = await bumpAnonUsed(supabase, ipHash)
  } catch (e) {
    // TEMP DEBUG
    return NextResponse.json(
      { result: rewritten, debug_write_error: e instanceof Error ? e.message : String(e) },
      { status: 200 }
    )
  }
  const trialLeft = next === null ? Math.max(0, ANON_DAILY_LIMIT - used - 1) : Math.max(0, ANON_DAILY_LIMIT - next)

  return NextResponse.json({ result: rewritten, trialLeft, anonymous: true })
}

async function isFreeWindowFull(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean | null> {
  const since = new Date(Date.now() - FREE_WINDOW_MS).toISOString()
  const { count, error } = await supabase
    .from('rewrites')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if (error) {
    console.error('Rewrite count failed:', error)
    return null
  }
  return (count ?? 0) >= DAILY_FREE_LIMIT
}

async function refundCredit(supabase: SupabaseClient, userId: string, previousCredits: number) {
  const { error } = await supabase
    .from('profiles')
    .update({ credits: previousCredits })
    .eq('id', userId)
    .eq('credits', previousCredits - 1)
  if (error) console.error('Credit refund failed:', error)
}

const TONE_INSTRUCTIONS: Record<Exclude<Tone, 'my_voice'>, string> = {
  professional:
    'You are a professional writing assistant. Rewrite the given text to sound more polished and business-appropriate while keeping the original meaning intact.',
  casual:
    "You are a friendly chat companion. Rewrite the text to sound natural, conversational, and easy to read - like you're talking to a colleague.",
  academic:
    'You are an academic editor. Rewrite the text with formal language, precise vocabulary, and clear logical structure suitable for scholarly work.',
  persuasive:
    'You are a persuasive communication expert. Rewrite the text to be more compelling and impactful, using rhetorical devices where appropriate.',
  concise:
    'You are a brevity expert. Rewrite the text to be as clear and brief as possible without losing any key information.',
}

function buildSystemPrompt(tone: Tone, styleDna?: StyleDNA | null): string {
  if (tone === 'my_voice' && styleDna) {
    const forbidden = (styleDna.forbidden_words || []).join(', ')
    return [
      `You are an elite personal writing assistant for Voxly.`,
      `Your #1 objective: Rewrite the given text so it faithfully embodies the author's authentic writing style.`,
      ``,
      `Author's Style DNA:`,
      `- Voice Profile: ${styleDna.voice_name}`,
      `- Cadence & Sentence Structure: ${styleDna.cadence}`,
      `- Formality & Tone: ${styleDna.formality}`,
      `- Vocabulary: ${styleDna.vocabulary_level}`,
      `- Signature Habits & Quirks: ${styleDna.signature_habits}`,
      `- Guiding Directive: ${styleDna.prompt_instruction}`,
      ``,
      `Strict Anti-AI & Rewriting Constraints:`,
      `1. NEVER use generic AI cliches, filler, or robotic transitions. Strictly avoid: [${forbidden || 'delve, testament, pivotal, furthermore, tapestry, utilize, in conclusion, leverage'}].`,
      `2. Do NOT over-polish into lifeless corporate PR speak. Keep the author's natural rhythm and human touch.`,
      `3. Preserve the core meaning, intent, and facts with 100% accuracy.`,
      `4. Output ONLY the rewritten text, with no preamble, quotes, or conversational explanations.`,
    ].join('\n')
  }

  const instruction =
    tone === 'my_voice'
      ? TONE_INSTRUCTIONS.professional
      : TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS.professional

  return [
    instruction,
    '',
    'Rules:',
    '1. NEVER change the factual meaning of the original text',
    '2. Keep the response under 200 words',
    '3. Return ONLY the rewritten text, with no preamble, explanation, or quotes',
  ].join('\n')
}
