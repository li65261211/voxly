import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StyleDNA } from '@/lib/supabase'

export const maxDuration = 30

// Cost guards for this LLM-backed endpoint:
// - cap total sample size so a single request can't burn arbitrary tokens
// - rate-limit trainings per user (tracked in style_profiles when migrated)
const MAX_SAMPLE_CHARS = 20000
const MAX_TRAININGS_PER_DAY = 5
const TRAINING_WINDOW_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('style_profile')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json({ styleProfile: profile.style_profile ?? null })
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const groqKey = process.env.GROQ_API_KEY

  if (!supabaseUrl || !serviceRoleKey || !groqKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { samples?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { samples } = body
  if (!Array.isArray(samples) || samples.length === 0) {
    return NextResponse.json(
      { error: 'Please provide at least 1-3 writing samples' },
      { status: 400 }
    )
  }

  const validSamples = samples
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())

  const totalLength = validSamples.reduce((acc, s) => acc + s.length, 0)
  if (validSamples.length < 1 || totalLength < 50) {
    return NextResponse.json(
      { error: 'Writing samples are too short. Please provide at least 50 characters total.' },
      { status: 400 }
    )
  }

  if (totalLength > MAX_SAMPLE_CHARS) {
    return NextResponse.json(
      {
        error: `Writing samples are too long (${totalLength.toLocaleString()} characters, max ${MAX_SAMPLE_CHARS.toLocaleString()}). Please shorten them and try again.`,
      },
      { status: 400 }
    )
  }

  // Rate-limit trainings per user: fail open when the history table isn't
  // migrated yet (null = check unavailable), block only on a firm true.
  if (await isTrainingRateLimited(supabase, user.id)) {
    return NextResponse.json(
      {
        error: `Style training limit reached (${MAX_TRAININGS_PER_DAY} per day). Please try again tomorrow.`,
      },
      { status: 429 }
    )
  }

  const analysisPrompt = [
    `You are an elite linguistic profiler and writing style analyst.`,
    `Analyze the following writing samples from a real person. Your job is to extract their authentic "Style DNA" so that an AI rewriting assistant can faithfully replicate their natural voice, cadence, and tone without sounding like generic AI prose.`,
    ``,
    `Writing Samples:`,
    ...validSamples.map((sample, idx) => `--- Sample ${idx + 1} ---\n${sample}`),
    ``,
    `Instructions:`,
    `Return ONLY a valid JSON object (without markdown code blocks, backticks, or other text).`,
    `The JSON must match this exact structure:`,
    `{`,
    `  "voice_name": "A concise, catchy title for this persona (e.g. 'Crisp & Direct Tech Strategist')",`,
    `  "cadence": "Sentence length distribution, rhythmic flow, pacing, preference for short vs compound sentences",`,
    `  "formality": "Formality level, warmth, relationship to reader, emotional stance",`,
    `  "vocabulary_level": "Vocabulary complexity, colloquialisms, jargon usage, contractions",`,
    `  "signature_habits": "Punctuation habits (em-dash, parentheses, exclamation), formatting quirks, greeting/signoff patterns",`,
    `  "forbidden_words": ["delve", "testament", "pivotal", "furthermore", "tapestry", "and any words this author would never use"],`,
    `  "prompt_instruction": "A concise, actionable 2-4 sentence directive instructing an AI exactly how to rewrite text in this author's voice."`,
    `}`,
  ].join('\n')

  const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            'You are a precise linguistic analysis engine. Output ONLY raw JSON matching the requested schema.',
        },
        { role: 'user', content: analysisPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  })

  if (!groqResponse.ok) {
    const detail = await groqResponse.json().catch(() => null)
    console.error('Style analysis Groq error:', groqResponse.status, detail)
    return NextResponse.json({ error: 'Failed to analyze writing style upstream' }, { status: 502 })
  }

  const completionData = await groqResponse.json()
  const rawContent: string | undefined = completionData.choices?.[0]?.message?.content?.trim()

  if (!rawContent) {
    return NextResponse.json({ error: 'Empty response from analysis engine' }, { status: 502 })
  }

  let styleDna: StyleDNA
  try {
    const parsed = JSON.parse(rawContent)
    styleDna = {
      voice_name: String(parsed.voice_name || 'My Custom Voice'),
      cadence: String(parsed.cadence || 'Natural and balanced'),
      formality: String(parsed.formality || 'Conversational and clear'),
      vocabulary_level: String(parsed.vocabulary_level || 'Everyday vocabulary'),
      signature_habits: String(parsed.signature_habits || 'Direct phrasing'),
      forbidden_words: Array.isArray(parsed.forbidden_words)
        ? parsed.forbidden_words.map(String)
        : ['delve', 'testament', 'pivotal', 'furthermore'],
      prompt_instruction: String(
        parsed.prompt_instruction ||
          'Rewrite naturally while preserving the user original voice and avoiding AI cliches.'
      ),
      analyzed_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error('Failed to parse style DNA JSON:', rawContent, err)
    return NextResponse.json({ error: 'Failed to parse style analysis result' }, { status: 500 })
  }

  // Save to profiles table
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ style_profile: styleDna, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateError) {
    console.error('Failed to save style profile:', updateError)
    return NextResponse.json({ error: 'Failed to save style profile' }, { status: 500 })
  }

  // Record training history when the style_profiles table exists (best-effort).
  // Supabase returns errors instead of throwing, so check the error object.
  const { error: historyError } = await supabase.from('style_profiles').insert({
    user_id: user.id,
    name: styleDna.voice_name,
    sample_texts: validSamples,
  })
  if (historyError) {
    if (historyError.code === '42P01') {
      // Table not migrated yet — expected, skip quietly.
      console.warn('style_profiles table not migrated yet — skipping training history')
    } else {
      console.error('Failed to record style training history:', historyError)
    }
  }

  return NextResponse.json({
    success: true,
    styleProfile: styleDna,
  })
}

async function isTrainingRateLimited(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean | null> {
  const since = new Date(Date.now() - TRAINING_WINDOW_MS).toISOString()
  const { count, error } = await supabase
    .from('style_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if (error) {
    // Table may not be migrated yet — fail open so training still works.
    console.warn('Style training rate-limit check skipped:', error.message)
    return null
  }
  return (count ?? 0) >= MAX_TRAININGS_PER_DAY
}

export async function DELETE(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ style_profile: null, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to reset style profile' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
