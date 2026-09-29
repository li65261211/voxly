import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Voxly — Your Voice, Not AI\'s Voice',
  description:
    'Rewrite any text while preserving your unique voice. Works on Gmail, LinkedIn, Twitter, and more. Free 50 rewrites per day.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#08090a',
          color: '#f7f8f8',
          fontFamily:
            'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {children}
      </body>
    </html>
  )
}
