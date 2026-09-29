'use client'

import { useEffect, useState } from 'react'
import { getSupabase, isSupabaseConfigured, type Rewrite } from '@/lib/supabase'

const TONE_LABEL: Record<string, string> = {
  professional: 'Professional',
  casual: 'Casual',
  academic: 'Academic',
  persuasive: 'Persuasive',
  concise: 'Concise',
}

export default function Dashboard() {
  const [email, setEmail] = useState<string | null>(null)
  const [credits, setCredits] = useState<number>(0)
  const [isPro, setIsPro] = useState(false)
  const [rewrites, setRewrites] = useState<Rewrite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      await Promise.all([loadProfile(session.user.id), loadRewrites(session.user.id)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }

  async function loadProfile(userId: string) {
    const { data } = await getSupabase()
      .from('profiles')
      .select('credits, is_pro')
      .eq('id', userId)
      .single()

    if (data) {
      setCredits(Number(data.credits ?? 0))
      setIsPro(Boolean(data.is_pro))
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

  async function signIn() {
    try {
      await getSupabase().auth.signInWithOAuth({ provider: 'google' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
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
          marginBottom: 48,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ ...h1, margin: 0, fontSize: 24 }}>Voxly Dashboard</h1>
        <span style={muted}>
          {isPro ? 'Pro member' : `${credits} credits left`} · {email}
        </span>
      </header>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ ...h2, fontSize: 20 }}>Recent rewrites</h2>
        {rewrites.length === 0 ? (
          <p style={muted}>
            Nothing here yet. Install the Chrome extension and rewrite some text.
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
  marginTop: 24,
  padding: '12px 24px',
  background: '#5e6ad2',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
}
const card: React.CSSProperties = {
  padding: 20,
  background: '#191a1b',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
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
  color: '#62666d',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}
const errorText: React.CSSProperties = { color: '#ff6b6b', fontSize: 13, marginTop: 16 }
