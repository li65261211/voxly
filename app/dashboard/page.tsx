'use client'

import { useEffect, useState } from 'react'
import { getSupabase, isSupabaseConfigured, type Rewrite, type StyleDNA } from '@/lib/supabase'

const TONE_LABEL: Record<string, string> = {
  my_voice: '✨ My Voice',
  professional: 'Professional',
  casual: 'Casual',
  academic: 'Academic',
  persuasive: 'Persuasive',
  concise: 'Concise',
}

// Must match the limit enforced by app/api/rewrite/route.ts.
const DAILY_FREE_LIMIT = 50

export default function Dashboard() {
  const [email, setEmail] = useState<string | null>(null)
  const [credits, setCredits] = useState<number>(0)
  const [dailyUsed, setDailyUsed] = useState<number>(0)
  const [isPro, setIsPro] = useState(false)
  const [styleProfile, setStyleProfile] = useState<StyleDNA | null>(null)
  const [rewrites, setRewrites] = useState<Rewrite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Style Learning state
  const [isTraining, setIsTraining] = useState(false)
  const [samples, setSamples] = useState<string[]>([
    'Hey team! Quick update on the rollout: we squashed the latency bug on the edge workers this morning. Looking solid for our Friday demo, but let me know if anyone notices unexpected timeouts.',
    'I really appreciate you digging into this. My main concern is not the upfront engineering cost, but whether our users will actually find this intuitive without three tutorial steps.',
  ])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [styleMsg, setStyleMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  // Live Playground for My Voice
  const [testInput, setTestInput] = useState('i think this feature is kinda broken and we should fix it soon or clients will be mad')
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const configured = isSupabaseConfigured()

  useEffect(() => {
    if (!configured) {
      setIsLoading(false)
      return
    }
    void loadSession()
  }, [configured])

  async function loadSession() {
    try {
      const supabase = getSupabase()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        setIsLoading(false)
        return
      }

      setEmail(session.user.email ?? null)
      await Promise.all([
        loadProfile(session.user.id),
        loadRewrites(session.user.id),
        loadDailyUsage(session.user.id),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }

  async function loadProfile(userId: string) {
    const { data } = await getSupabase()
      .from('profiles')
      .select('credits, is_pro, style_profile')
      .eq('id', userId)
      .single()

    if (data) {
      setCredits(Number(data.credits ?? 0))
      setIsPro(Boolean(data.is_pro))
      setStyleProfile((data.style_profile as StyleDNA) ?? null)
    }
  }

  async function loadRewrites(userId: string) {
    const { data } = await getSupabase()
      .from('rewrites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    setRewrites((data as Rewrite[]) ?? [])
  }

  // Matches the API's free-tier limit: rewrites inside a rolling 24h window.
  async function loadDailyUsage(userId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await getSupabase()
      .from('rewrites')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since)

    setDailyUsed(count ?? 0)
  }

  async function signIn() {
    try {
      await getSupabase().auth.signInWithOAuth({ provider: 'google' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    }
  }

  async function handleAnalyzeStyle() {
    setStyleMsg(null)
    const validSamples = samples.filter((s) => s.trim().length > 0)
    const totalChars = validSamples.reduce((acc, s) => acc + s.length, 0)

    if (validSamples.length === 0 || totalChars < 50) {
      setStyleMsg({
        type: 'error',
        text: 'Please provide at least 50 characters of personal writing so we can analyze your style.',
      })
      return
    }

    setIsAnalyzing(true)
    try {
      const {
        data: { session },
      } = await getSupabase().auth.getSession()

      if (!session?.access_token) {
        throw new Error('You must be signed in to analyze your style.')
      }

      const res = await fetch('/api/style', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ samples: validSamples }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Style analysis failed')

      setStyleProfile(json.styleProfile)
      setIsTraining(false)
      setStyleMsg({ type: 'success', text: '🎉 Style DNA successfully extracted & saved!' })
    } catch (err) {
      setStyleMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to analyze style',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleResetStyle() {
    if (!confirm('Are you sure you want to reset your personal voice profile?')) return
    try {
      const {
        data: { session },
      } = await getSupabase().auth.getSession()

      if (!session?.access_token) return

      await fetch('/api/style', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      setStyleProfile(null)
      setStyleMsg({ type: 'success', text: 'Voice profile reset.' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reset failed')
    }
  }

  async function handleTestRewrite() {
    if (!testInput.trim()) return
    setIsTesting(true)
    setTestOutput(null)
    try {
      const {
        data: { session },
      } = await getSupabase().auth.getSession()

      if (!session?.access_token) throw new Error('Not signed in')

      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: testInput, tone: 'my_voice' }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Rewrite failed')
      setTestOutput(data.result)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Test rewrite failed')
    } finally {
      setIsTesting(false)
    }
  }

  if (isLoading) {
    return (
      <Shell>
        <p style={muted}>Loading…</p>
      </Shell>
    )
  }

  if (!configured) {
    return (
      <Shell>
        <h1 style={h1}>Supabase isn&apos;t configured</h1>
        <p style={muted}>
          Set <code style={code}>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code style={code}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{' '}
          <code style={code}>.env.local</code>, then restart the dev server.
        </p>
      </Shell>
    )
  }

  if (!email) {
    return (
      <Shell>
        <h1 style={h1}>Welcome to Voxly</h1>
        <p style={muted}>Sign in to see your rewrites and credits.</p>
        <button style={primaryBtn} onClick={signIn}>
          Sign in with Google
        </button>
        {error && <p style={errorText}>{error}</p>}
      </Shell>
    )
  }

  return (
    <Shell>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 40,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ ...h1, margin: 0, fontSize: 26, letterSpacing: '-0.5px' }}>
            Voxly Dashboard
          </h1>
          <p style={{ ...muted, fontSize: 13, marginTop: 4 }}>
            {email} ·{' '}
            {isPro ? (
              <span style={{ color: '#828fff', fontWeight: 600 }}>Pro Member</span>
            ) : (
              <span>
                {Math.max(0, DAILY_FREE_LIMIT - dailyUsed)}/{DAILY_FREE_LIMIT} daily free left · {credits} credits banked
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Style Learning / My Voice Section */}
      <section style={{ marginBottom: 44 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ ...h2, fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              ✨ Style Learning — My Voice
            </h2>
            <p style={{ ...muted, fontSize: 13, marginTop: 4 }}>
              Train Voxly to write in your authentic voice instead of generic AI prose.
            </p>
          </div>
          {styleProfile && !isTraining && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ ...secondaryBtn, fontSize: 12, padding: '6px 12px' }}
                onClick={() => setIsTraining(true)}
              >
                Re-train Voice
              </button>
              <button
                style={{ ...secondaryBtn, fontSize: 12, padding: '6px 12px', color: '#ff7676' }}
                onClick={handleResetStyle}
              >
                Reset
              </button>
            </div>
          )}
        </div>

        {styleMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
              background: styleMsg.type === 'error' ? 'rgba(255,107,107,0.1)' : 'rgba(94,106,210,0.15)',
              border: `1px solid ${styleMsg.type === 'error' ? 'rgba(255,107,107,0.3)' : 'rgba(94,106,210,0.35)'}`,
              color: styleMsg.type === 'error' ? '#ff9d9d' : '#a3adff',
            }}
          >
            {styleMsg.text}
          </div>
        )}

        {styleProfile && !isTraining ? (
          <div style={{ ...card, borderColor: 'rgba(94,106,210,0.35)', background: 'linear-gradient(180deg, #15161c 0%, #101114 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#f7f8f8' }}>
                🏷️ Persona: <span style={{ color: '#828fff' }}>{styleProfile.voice_name}</span>
              </span>
              <span style={{ fontSize: 11, color: '#62666d' }}>
                Analyzed {new Date(styleProfile.analyzed_at).toLocaleDateString()}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div style={dnaChip}>
                <div style={dnaLabel}>Cadence & Flow</div>
                <div style={dnaValue}>{styleProfile.cadence}</div>
              </div>
              <div style={dnaChip}>
                <div style={dnaLabel}>Formality & Tone</div>
                <div style={dnaValue}>{styleProfile.formality}</div>
              </div>
              <div style={dnaChip}>
                <div style={dnaLabel}>Vocabulary Level</div>
                <div style={dnaValue}>{styleProfile.vocabulary_level}</div>
              </div>
              <div style={dnaChip}>
                <div style={dnaLabel}>Signature Quirks & Habits</div>
                <div style={dnaValue}>{styleProfile.signature_habits}</div>
              </div>
            </div>

            {styleProfile.forbidden_words?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={cardLabel}>Strictly Suppressed AI Cliches</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {styleProfile.forbidden_words.map((w) => (
                    <span
                      key={w}
                      style={{
                        fontSize: 11,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        padding: '3px 8px',
                        borderRadius: 4,
                        color: '#ff9d9d',
                      }}
                    >
                      ✕ {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Live My Voice Test */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
              <div style={cardLabel}>Live Test: Rewrite with My Voice</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="Type or paste any draft sentence to test your voice..."
                  style={textInput}
                />
                <button
                  style={{ ...primaryBtn, marginTop: 0, whiteSpace: 'nowrap', padding: '8px 16px', fontSize: 13 }}
                  disabled={isTesting}
                  onClick={handleTestRewrite}
                >
                  {isTesting ? 'Rewriting…' : 'Test Rewrite'}
                </button>
              </div>

              {testOutput && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(94,106,210,0.1)',
                    border: '1px solid rgba(94,106,210,0.25)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#828fff', fontWeight: 600, marginBottom: 4 }}>
                    Rewritten in your voice:
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#f7f8f8' }}>
                    {testOutput}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ ...card, borderColor: 'rgba(94,106,210,0.3)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>
              {styleProfile ? 'Update your Writing Samples' : 'Teach Voxly how you write'}
            </h3>
            <p style={{ ...muted, fontSize: 13, marginBottom: 18 }}>
              Paste 2-3 short writing samples (past emails, Slack messages, LinkedIn posts, or notes). Our linguistic model will reverse-engineer your unique cadence, vocabulary, and quirks.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {samples.map((sample, idx) => (
                <div key={idx}>
                  <div style={{ ...cardLabel, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Writing Sample #{idx + 1}</span>
                    {samples.length > 1 && (
                      <button
                        style={{ background: 'none', border: 'none', color: '#8a8f98', cursor: 'pointer', fontSize: 11 }}
                        onClick={() => setSamples(samples.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    style={textarea}
                    value={sample}
                    onChange={(e) => {
                      const copy = [...samples]
                      copy[idx] = e.target.value
                      setSamples(copy)
                    }}
                    placeholder={
                      idx === 0
                        ? 'e.g., A work email or message showing your typical communication tone...'
                        : idx === 1
                        ? 'e.g., A social media post, reflection, or note you wrote...'
                        : 'e.g., Another writing snippet...'
                    }
                  />
                </div>
              ))}

              {samples.length < 4 && (
                <button
                  style={{ ...secondaryBtn, width: 'fit-content', fontSize: 12, padding: '6px 12px' }}
                  onClick={() => setSamples([...samples, ''])}
                >
                  + Add another sample
                </button>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  style={{ ...primaryBtn, marginTop: 0 }}
                  disabled={isAnalyzing}
                  onClick={handleAnalyzeStyle}
                >
                  {isAnalyzing ? 'Extracting Style DNA…' : '✨ Extract & Save My Voice'}
                </button>
                {styleProfile && (
                  <button
                    style={{ ...secondaryBtn, marginTop: 0 }}
                    onClick={() => setIsTraining(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Recent rewrites */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ ...h2, fontSize: 20 }}>Recent rewrites</h2>
        {rewrites.length === 0 ? (
          <p style={muted}>
            Nothing here yet. Install the Chrome extension, select any text, and pick a tone to rewrite.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {rewrites.map((rewrite) => (
              <article key={rewrite.id} style={card}>
                <div style={cardMeta}>
                  {TONE_LABEL[rewrite.tone] ?? rewrite.tone} ·{' '}
                  {new Date(rewrite.created_at).toLocaleDateString()}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 24,
                  }}
                >
                  <div>
                    <div style={cardLabel}>Original</div>
                    <p style={{ ...body, color: '#d0d6e0' }}>{rewrite.original_text}</p>
                  </div>
                  <div>
                    <div style={cardLabel}>Rewritten</div>
                    <p style={body}>{rewrite.rewritten_text}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {!isPro && (
        <section>
          <h2 style={{ ...h2, fontSize: 20 }}>Upgrade to Pro</h2>
          <div style={{ ...card, maxWidth: 420, borderColor: 'rgba(94,106,210,0.3)' }}>
            <div style={{ fontSize: 32, fontWeight: 600, marginBottom: 16 }}>
              $19 <span style={{ fontSize: 16, color: '#8a8f98' }}>one-time</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', ...body }}>
              {[
                'Unlimited rewrites',
                'Style Learning — teach Voxly your voice',
                'Rewrite history & favorites',
                'Keyboard shortcuts',
                'Priority support',
              ].map((feature) => (
                <li key={feature} style={{ padding: '6px 0', color: '#d0d6e0' }}>
                  <span style={{ color: '#5e6ad2', marginRight: 10 }}>✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <button style={{ ...primaryBtn, width: '100%', marginTop: 0 }}>
              Upgrade Now
            </button>
            <p style={{ ...muted, fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              Stripe checkout lands in Phase 2.
            </p>
          </div>
        </section>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#08090a',
        color: '#f7f8f8',
        padding: 48,
        fontFamily:
          'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto' }}>{children}</div>
    </main>
  )
}

const h1: React.CSSProperties = { fontSize: 32, fontWeight: 600, margin: '0 0 12px' }
const h2: React.CSSProperties = { fontWeight: 600, margin: '0 0 16px' }
const muted: React.CSSProperties = { color: '#8a8f98', margin: 0 }
const body: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: '#f7f8f8',
  margin: 0,
}
const code: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  background: 'rgba(255,255,255,0.05)',
  padding: '2px 6px',
  borderRadius: 4,
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 20px',
  background: '#5e6ad2',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.15s ease',
}
const secondaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  background: 'rgba(255,255,255,0.05)',
  color: '#d0d6e0',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}
const textInput: React.CSSProperties = {
  flex: 1,
  padding: '9px 12px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#f7f8f8',
  fontSize: 13,
  outline: 'none',
}
const textarea: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: '#f7f8f8',
  fontSize: 13,
  lineHeight: 1.5,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  resize: 'vertical',
  outline: 'none',
}
const card: React.CSSProperties = {
  padding: 22,
  background: '#141517',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
}
const cardMeta: React.CSSProperties = {
  fontSize: 12,
  color: '#62666d',
  marginBottom: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}
const cardLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#8a8f98',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}
const dnaChip: React.CSSProperties = {
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10,
}
const dnaLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#828fff',
  fontWeight: 600,
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}
const dnaValue: React.CSSProperties = {
  fontSize: 12,
  color: '#d0d6e0',
  lineHeight: 1.5,
}
const errorText: React.CSSProperties = { color: '#ff6b6b', fontSize: 13, marginTop: 16 }
