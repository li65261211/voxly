'use client'

import { useEffect, useState } from 'react'
import { getSupabase, isSupabaseConfigured, type StyleDNA } from '@/lib/supabase'

const TONES = [
  { id: 'my_voice', label: '✨ My Voice' },
  { id: 'professional', label: 'Professional' },
  { id: 'casual', label: 'Casual' },
  { id: 'academic', label: 'Academic' },
  { id: 'persuasive', label: 'Persuasive' },
  { id: 'concise', label: 'Concise' },
] as const

type ToneId = (typeof TONES)[number]['id']

// Must match the limits enforced by app/api/rewrite/route.ts.
const DAILY_FREE_LIMIT = 50
const MAX_INPUT_CHARS = 5000

export default function ToolClient() {
  const [email, setEmail] = useState<string | null>(null)
  const [isPro, setIsPro] = useState(false)
  const [dailyUsed, setDailyUsed] = useState(0)
  const [styleProfile, setStyleProfile] = useState<StyleDNA | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [input, setInput] = useState('')
  const [tone, setTone] = useState<ToneId>('professional')
  const [output, setOutput] = useState<string | null>(null)
  const [isRewriting, setIsRewriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
      const userId = session.user.id
      const { data } = await supabase
        .from('profiles')
        .select('is_pro, style_profile')
        .eq('id', userId)
        .single()

      if (data) {
        setIsPro(Boolean(data.is_pro))
        const profile = (data.style_profile as StyleDNA) ?? null
        setStyleProfile(profile)
        if (profile) setTone('my_voice')
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('rewrites')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since)
      setDailyUsed(count ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }

  async function signIn() {
    try {
      await getSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/tool` },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    }
  }

  async function handleRewrite() {
    const text = input.trim()
    if (!text || isRewriting) return
    setError(null)
    setOutput(null)
    setCopied(false)
    setIsRewriting(true)
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
        body: JSON.stringify({ text, tone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Rewrite failed')
      setOutput(data.result)
      setDailyUsed((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rewrite failed')
    } finally {
      setIsRewriting(false)
    }
  }

  async function handleCopy() {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Copy failed — please select the text manually.')
    }
  }

  const freeLeft = Math.max(0, DAILY_FREE_LIMIT - dailyUsed)

  return (
    <main style={page}>
      <div style={container}>
        <header style={header}>
          <a href="/" style={logo}>
            voxly
          </a>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {email ? (
              <>
                <span style={{ fontSize: 12, color: '#8a8f98' }}>
                  {isPro ? (
                    <span style={{ color: '#828fff', fontWeight: 600 }}>Pro</span>
                  ) : (
                    `${freeLeft}/${DAILY_FREE_LIMIT} free left`
                  )}
                </span>
                <a href="/dashboard" style={ghostLink}>
                  Dashboard
                </a>
              </>
            ) : (
              <span style={{ fontSize: 12, color: '#8a8f98' }}>
                {DAILY_FREE_LIMIT} free rewrites / day
              </span>
            )}
          </div>
        </header>

        <h1 style={h1}>Rewrite it in your voice</h1>
        <p style={sub}>
          Paste any text, pick a tone, get a sharper version in seconds — no
          install, no extension.
        </p>

        {isLoading ? (
          <p style={muted}>Loading…</p>
        ) : !configured ? (
          <p style={muted}>
            Supabase isn&apos;t configured. Set{' '}
            <code style={code}>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code style={code}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{' '}
            <code style={code}>.env.local</code>.
          </p>
        ) : !email ? (
          <div style={card}>
            <h2 style={{ ...h2, fontSize: 18, margin: '0 0 8px' }}>
              Sign in to start rewriting
            </h2>
            <p style={{ ...muted, fontSize: 13, marginBottom: 20 }}>
              {DAILY_FREE_LIMIT} free rewrites every day. We only use your
              account to keep your quota and your voice profile.
            </p>
            <button style={primaryBtn} onClick={signIn}>
              Sign in with Google
            </button>
            {error && <p style={errorText}>{error}</p>}
          </div>
        ) : (
          <>
            {!styleProfile && (
              <div style={hintBanner}>
                ✨ Want rewrites that sound like <em>you</em>?{' '}
                <a href="/dashboard" style={inlineLink}>
                  Train your voice
                </a>{' '}
                on the dashboard — it takes 2 minutes.
              </div>
            )}

            <div style={card}>
              <div style={labelRow}>
                <span style={cardLabel}>Your text</span>
                <span style={{ fontSize: 11, color: '#62666d' }}>
                  {input.length}/{MAX_INPUT_CHARS}
                </span>
              </div>
              <textarea
                rows={6}
                style={textarea}
                value={input}
                maxLength={MAX_INPUT_CHARS}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste an email, a post, a paragraph — anything you want rewritten…"
              />

              <div style={{ ...labelRow, marginTop: 18 }}>
                <span style={cardLabel}>Tone</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TONES.map((t) => {
                  const disabled = t.id === 'my_voice' && !styleProfile
                  const active = tone === t.id
                  return (
                    <button
                      key={t.id}
                      disabled={disabled}
                      onClick={() => setTone(t.id)}
                      title={
                        disabled
                          ? 'Train your voice on the dashboard first'
                          : undefined
                      }
                      style={{
                        ...pill,
                        ...(active ? pillActive : {}),
                        ...(disabled ? pillDisabled : {}),
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>

              <button
                style={{
                  ...primaryBtn,
                  width: '100%',
                  marginTop: 20,
                  opacity: !input.trim() || isRewriting ? 0.6 : 1,
                  cursor:
                    !input.trim() || isRewriting ? 'not-allowed' : 'pointer',
                }}
                disabled={!input.trim() || isRewriting}
                onClick={handleRewrite}
              >
                {isRewriting ? 'Rewriting…' : 'Rewrite'}
              </button>
              {error && <p style={errorText}>{error}</p>}
            </div>

            {output && (
              <div style={{ ...card, marginTop: 16, borderColor: 'rgba(94,106,210,0.35)' }}>
                <div style={labelRow}>
                  <span style={{ ...cardLabel, color: '#828fff' }}>
                    Rewritten
                  </span>
                  <button style={copyBtn} onClick={handleCopy}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {output}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: '#08090a',
  color: '#f7f8f8',
  padding: 24,
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}
const container: React.CSSProperties = { maxWidth: 720, margin: '0 auto' }
const header: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 48,
  paddingTop: 8,
}
const logo: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: -0.5,
  color: '#f7f8f8',
  textDecoration: 'none',
}
const ghostLink: React.CSSProperties = {
  fontSize: 12,
  color: '#d0d6e0',
  textDecoration: 'none',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: '6px 12px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
}
const h1: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 600,
  letterSpacing: -1,
  margin: '0 0 10px',
}
const sub: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: 15,
  margin: '0 0 32px',
  lineHeight: 1.6,
}
const h2: React.CSSProperties = { fontWeight: 600, margin: '0 0 16px' }
const muted: React.CSSProperties = { color: '#8a8f98', margin: 0 }
const card: React.CSSProperties = {
  padding: 22,
  background: '#141517',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
}
const cardLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#8a8f98',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}
const labelRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 10,
}
const textarea: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  color: '#f7f8f8',
  fontSize: 15,
  lineHeight: 1.6,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  resize: 'vertical',
  outline: 'none',
}
const pill: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 999,
  fontSize: 13,
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.04)',
  color: '#d0d6e0',
  border: '1px solid rgba(255,255,255,0.1)',
}
const pillActive: React.CSSProperties = {
  background: 'rgba(94,106,210,0.2)',
  borderColor: 'rgba(94,106,210,0.6)',
  color: '#a3adff',
  fontWeight: 600,
}
const pillDisabled: React.CSSProperties = {
  opacity: 0.4,
  cursor: 'not-allowed',
}
const primaryBtn: React.CSSProperties = {
  padding: '12px 20px',
  background: '#5e6ad2',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}
const copyBtn: React.CSSProperties = {
  fontSize: 12,
  color: '#a3adff',
  background: 'rgba(94,106,210,0.15)',
  border: '1px solid rgba(94,106,210,0.35)',
  borderRadius: 6,
  padding: '5px 12px',
  cursor: 'pointer',
}
const inlineLink: React.CSSProperties = { color: '#a3adff', fontWeight: 600 }
const hintBanner: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 10,
  marginBottom: 16,
  fontSize: 13,
  lineHeight: 1.6,
  color: '#d0d6e0',
  background: 'rgba(94,106,210,0.1)',
  border: '1px solid rgba(94,106,210,0.3)',
}
const code: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  background: 'rgba(255,255,255,0.05)',
  padding: '2px 6px',
  borderRadius: 4,
}
const errorText: React.CSSProperties = {
  color: '#ff6b6b',
  fontSize: 13,
  marginTop: 16,
  marginBottom: 0,
}
