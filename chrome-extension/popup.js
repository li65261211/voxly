// Voxly popup — sign-in state and daily usage.

const DAILY_FREE_LIMIT = 50

async function init() {
  const status = document.getElementById('status')
  const usage = document.getElementById('usage')
  const signIn = document.getElementById('sign-in')
  const signOut = document.getElementById('sign-out')
  const openDash = document.getElementById('open-dashboard')

  openDash.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://voxly.app/dashboard' })
  })

  let response
  try {
    response = await chrome.runtime.sendMessage({ type: 'GET_SESSION' })
  } catch (err) {
    status.textContent = 'Background service worker unavailable — reload the extension.'
    return
  }

  if (response?.ok && response.data.signedIn) {
    status.textContent = `Signed in as ${response.data.email}`
    signOut.hidden = false
  } else {
    status.textContent = 'Not signed in'
    signIn.hidden = false
    signIn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://voxly.app/dashboard' })
    })
  }

  let count = 0
  try {
    const saved = JSON.parse(localStorage.getItem('voxlyUsage') || '{}')
    if (saved.date === new Date().toDateString()) count = Number(saved.count) || 0
  } catch {
    /* ignore */
  }
  usage.textContent = `${Math.max(0, DAILY_FREE_LIMIT - count)}/${DAILY_FREE_LIMIT} free rewrites left today`
}

init()
