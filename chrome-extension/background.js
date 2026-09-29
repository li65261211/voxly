// Voxly background service worker (MV3).
// Owns all network calls so the content script never touches auth or the API directly.

const API_BASE = 'https://voxly.app' // override in production
const SUPABASE_URL = 'https://your-project-ref.supabase.co'
const SUPABASE_ANON_KEY = 'your-anon-key'

// The context menu must be created here — content scripts have no access to
// chrome.contextMenus, so creating it from content.js silently does nothing.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'voxly-rewrite',
    title: 'Rewrite with Voxly',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'voxly-rewrite' || !info.selectionText || !tab?.id) return
  chrome.tabs.sendMessage(tab.id, {
    type: 'VOXLY_REWRITE',
    payload: { text: info.selectionText.trim() },
  })
})

// Ctrl+Shift+R — ask the active tab to rewrite its current selection.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'rewrite-selection') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  chrome.tabs.sendMessage(tab.id, { type: 'VOXLY_REWRITE' })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'REWRITE_REQUEST':
      handleRewrite(message.payload)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: err.message }))
      return true // keep the channel open for the async reply

    case 'GET_SESSION':
      getSession()
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: err.message }))
      return true

    case 'SIGN_OUT':
      clearSession()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }))
      return true

    default:
      return false
  }
})

/** Pull a Supabase access token out of the dashboard's auth cookie. */
async function getAccessToken() {
  const cookies = await chrome.cookies.getAll({ domain: new URL(API_BASE).hostname })
  const token = cookies.find((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  if (!token) return null
  try {
    return decodeURIComponent(token.value)
  } catch {
    return token.value
  }
}

async function getSession() {
  const token = await getAccessToken()
  if (!token) return { signedIn: false, email: null }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  })
  if (!res.ok) return { signedIn: false, email: null }

  const user = await res.json()
  return { signedIn: true, email: user.email ?? null }
}

async function clearSession() {
  const cookies = await chrome.cookies.getAll({ domain: new URL(API_BASE).hostname })
  const authCookie = cookies.find((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  if (authCookie) await chrome.cookies.remove({ url: API_BASE, name: authCookie.name })
}

async function handleRewrite({ text, tone }) {
  if (!text || !tone) throw new Error('Missing text or tone')

  const token = await getAccessToken()
  if (!token) {
    throw new Error('Sign in at voxly.app/dashboard to use Voxly')
  }

  const res = await fetch(`${API_BASE}/api/rewrite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text, tone }),
  })

  if (res.status === 402) throw new Error('Out of credits — top up from your dashboard')
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.error ?? `Rewrite failed (${res.status})`)
  }

  const { result } = await res.json()
  return { original: text, rewritten: result, tone }
}
