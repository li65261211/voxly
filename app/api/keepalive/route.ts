import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Keeps the Supabase project from being auto-paused due to inactivity.
// Triggered once a day by Vercel Cron (see vercel.json). Read-only: a single
// lightweight SELECT that touches the DB without changing anything or
// consuming Groq quota.
export const maxDuration = 30

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return { supabaseUrl, serviceRoleKey }
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // If CRON_SECRET is not configured yet, allow the ping (cron still works).
  // Once set, Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
  // automatically on every cron request.
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const env = getEnv()
  if (!env) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }
  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey)
  const { error } = await supabase
    .from('anon_usage')
    .select('count', { count: 'exact', head: true })
    .limit(1)
  if (error) {
    console.error('Keepalive DB ping failed:', error)
    return NextResponse.json({ error: 'DB ping failed' }, { status: 500 })
  }
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}
