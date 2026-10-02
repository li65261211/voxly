import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Voxly',
  description: 'How Voxly collects, uses, and protects your data.',
}

const sections: { heading: string; body: string[] }[] = [
  {
    heading: 'What we collect',
    body: [
      'Account data (when you sign in with Google): your email address and display name, stored to identify your account, enforce your quota, and keep your voice profile.',
      'Texts you submit for rewriting: sent to our AI provider to generate the rewrite, and stored in your history so you can revisit past rewrites.',
      'Voice samples (only if you use My Voice training): the sample texts you provide, plus the style profile derived from them.',
      'Usage data: how many rewrites you have made, used to enforce free-tier limits.',
      'Anonymous trial: if you use Voxly without signing in, we store a salted hash of your IP address with a daily counter to enforce the 5-per-day trial limit. We never store raw IP addresses for this purpose.',
    ],
  },
  {
    heading: 'How we use it',
    body: [
      'To operate the service: rewriting your text, keeping your history, and applying your voice profile.',
      'To enforce fair-use limits on free accounts.',
      'We do not sell your data. We do not use your texts or voice samples to train AI models.',
    ],
  },
  {
    heading: 'Third-party services',
    body: [
      'Supabase — hosts our database and authentication.',
      'Groq — runs the AI model; the text you submit is sent to Groq\u2019s API to produce the rewrite.',
      'Vercel — hosts the website.',
      'Google — handles Sign in with Google (OAuth). We receive only your email address and basic profile.',
    ],
  },
  {
    heading: 'Data retention and your rights',
    body: [
      'Your account data is kept while your account is active. You may request a copy or deletion of your data at any time by emailing us (see below); we will delete your profile, history, and voice data within 30 days.',
      'Anonymous trial counters expire automatically after 24 hours.',
    ],
  },
  {
    heading: 'Children',
    body: [
      'Voxly is not directed at children under 13, and we do not knowingly collect data from them.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'If we change this policy materially, we will note the new effective date below.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      'Questions about this policy or your data: li604161176@gmail.com.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#08090a',
        color: '#f7f8f8',
        padding: '48px 24px 80px',
        fontFamily:
          'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <a
          href="/"
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: -0.5,
            color: '#f7f8f8',
            textDecoration: 'none',
          }}
        >
          voxly
        </a>

        <h1
          style={{
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: -1,
            margin: '32px 0 8px',
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: '#8a8f98', fontSize: 13, margin: '0 0 40px' }}>
          Effective date: October 2, 2026
        </p>

        {sections.map((s) => (
          <section key={s.heading} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                margin: '0 0 12px',
                color: '#d0d6e0',
              }}
            >
              {s.heading}
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: 20,
                color: '#a7adb8',
                fontSize: 14,
                lineHeight: 1.8,
              }}
            >
              {s.body.map((p, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {p}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
