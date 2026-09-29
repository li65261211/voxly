import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'voxly-web',
    env: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      openai: Boolean(process.env.OPENAI_API_KEY),
    },
    timestamp: new Date().toISOString(),
  })
}
