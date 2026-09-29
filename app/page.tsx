export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 56, fontWeight: 600, letterSpacing: -2, margin: 0 }}>
        voxly
      </h1>
      <p style={{ fontSize: 18, color: '#8a8f98', maxWidth: 520, margin: 0 }}>
        Your voice, not AI&apos;s voice. An AI text rewriter that keeps your
        writing style intact.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a
          href="/dashboard"
          style={{
            padding: '12px 24px',
            background: '#5e6ad2',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Open Dashboard
        </a>
        <a
          href="/api/health"
          style={{
            padding: '12px 24px',
            background: 'rgba(255,255,255,0.04)',
            color: '#d0d6e0',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 15,
          }}
        >
          API Status
        </a>
      </div>

      <p style={{ fontSize: 13, color: '#62666d', margin: 0 }}>
        Chrome extension coming soon · Built by a solo founder
      </p>
    </main>
  )
}
