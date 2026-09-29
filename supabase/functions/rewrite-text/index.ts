// Supabase Edge Function (Deno runtime) — kept out of the Next.js TS program.
// Deploy with: supabase functions deploy rewrite-text
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TONES = ['professional', 'casual', 'academic', 'persuasive', 'concise'] as const
type Tone = (typeof TONES)[number]

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
      return json({ error: 'Function not configured' }, 500)
    }

    // Honour the caller's token so the profile lookup is scoped to them.
    const authorization = req.headers.get('Authorization') ?? ''
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authorization } },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { text, tone, styleProfileId } = await req.json()
    if (typeof text !== 'string' || !text.trim()) {
      return json({ error: 'Missing required field: text' }, 400)
    }
    if (typeof tone !== 'string' || !TONES.includes(tone as Tone)) {
      return json({ error: `Invalid tone. Must be one of: ${TONES.join(', ')}` }, 400)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, is_pro')
      .eq('id', user.id)
      .single()

    if (!profile) return json({ error: 'Profile not found' }, 404)

    const isPro = Boolean(profile.is_pro)
    const credits = Number(profile.credits ?? 0)
    if (!isPro && credits <= 0) return json({ error: 'No credits remaining' }, 402)

    const systemPrompt = [
      TONE_INSTRUCTIONS[tone as Tone],
      styleProfileId
        ? `Additionally, follow this user's personal writing style profile (ID: ${styleProfileId}). Match their sentence length preferences, vocabulary choices, and overall voice.`
        : '',
      '',
      'Rules:',
      '1. NEVER change the factual meaning of the original text',
      '2. Keep the response under 200 words',
      '3. Return ONLY the rewritten text, with no preamble, explanation, or quotes',
    ]
      .filter(Boolean)
      .join('\n')

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.7,
      }),
    })

    if (!openAiResponse.ok) {
      const detail = await openAiResponse.json().catch(() => null)
      console.error('OpenAI error:', openAiResponse.status, detail)
      return json({ error: 'Rewrite failed upstream' }, 502)
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
      style_profile_id: styleProfileId ?? null,
      tokens_used: data.usage?.total_tokens ?? 0,
    })

    return json({ result: rewritten })
  } catch (error) {
    console.error('Unexpected error:', error)
    return json({ error: 'Internal error' }, 500)
  }
})
