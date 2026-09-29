import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TONES = ['professional', 'casual', 'academic', 'persuasive', 'concise'] as const
type Tone = (typeof TONES)[number]

const MAX_CHARS = 5000

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
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

  // Load the columns we actually use — the previous version read is_pro without selecting it.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits, is_pro')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const isPro = Boolean(profile.is_pro)
  const credits = Number(profile.credits ?? 0)

  if (!isPro && credits <= 0) {
    return NextResponse.json({ error: 'No credits remaining' }, { status: 402 })
  }

  const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt(tone as Tone) },
        { role: 'user', content: text },
      ],
      temperature: 0.7,
    }),
  })

  if (!openAiResponse.ok) {
    const detail = await openAiResponse.json().catch(() => null)
    console.error('OpenAI error:', openAiResponse.status, detail)
    return NextResponse.json({ error: 'Rewrite failed upstream' }, { status: 502 })
  }

  const data = await openAiResponse.json()
  const rewritten: string = data.choices?.[0]?.message?.content?.trim() || text

  if (!isPro) {
    await supabase
      .from('profiles')
      .update({ credits: Math.max(0, credits - 1) })
      .eq('id', user.id)
  }

  await supabase.from('rewrites').insert({
    user_id: user.id,
    original_text: text,
    rewritten_text: rewritten,
    tone,
    tokens_used: data.usage?.total_tokens ?? 0,
  })

  return NextResponse.json({ result: rewritten })
}

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional:
    'You are a professional writing assistant. Rewrite the given text to sound more polished and business-appropriate while keeping the original meaning intact.',
  casual:
    "You are a friendly chat companion. Rewrite the text to sound natural, conversational, and easy to read — like you're talking to a colleague.",
  academic:
    'You are an academic editor. Rewrite the text with formal language, precise vocabulary, and clear logical structure suitable for scholarly work.',
  persuasive:
    'You are a persuasive communication expert. Rewrite the text to be more compelling and impactful, using rhetorical devices where appropriate.',
  concise:
    'You are a brevity expert. Rewrite the text to be as clear and brief as possible without losing any key information.',
}

function buildSystemPrompt(tone: Tone): string {
  // The output rules must apply to EVERY tone, not just the fallback path.
  return [
    TONE_INSTRUCTIONS[tone],
    '',
    'Rules:',
    '1. NEVER change the factual meaning of the original text',
    '2. Keep the response under 200 words',
    '3. Return ONLY the rewritten text, with no preamble, explanation, or quotes',
  ].join('\n')
}
