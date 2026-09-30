// Voxly content script — selection detection, tone picker, result panel.
// All network work is delegated to the background service worker.

(function () {
  'use strict'

  if (window.__voxlyLoaded) return
  window.__voxlyLoaded = true

  const DAILY_FREE_LIMIT = 50
  const USAGE_KEY = 'voxlyUsage'
  const PANEL_ID = 'voxly-panel'
  const FLOAT_ID = 'voxly-float-btn'

  const TONES = [
    { id: 'professional', label: 'Professional', icon: '💼' },
    { id: 'casual', label: 'Casual', icon: '😊' },
    { id: 'academic', label: 'Academic', icon: '📚' },
    { id: 'persuasive', label: 'Persuasive', icon: '🎯' },
    { id: 'concise', label: 'Concise', icon: '✂️' },
  ]

  let activeTone = 'professional'
  let currentText = ''
  let currentRange = null // Range captured when the text was selected
  let currentField = null // { el, start, end } when the selection is in an input/textarea
  let panel = null
  let floatBtn = null

  // ------------------------------------------------- messages from background
  // The context menu and the Ctrl+Shift+R shortcut both arrive this way, so the
  // selection bubble below is only a convenience — this is the real entry point.
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'VOXLY_REWRITE') return
    const captured = readSelection()
    currentText = message.payload?.text || captured?.text || ''
    currentRange = captured?.range ?? null
    currentField = captured?.field ?? null
    if (!currentText.trim()) return
    openPanel()
  })

  // ------------------------------------------------------------------ usage cap
  function getUsage() {
    try {
      const saved = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}')
      const today = new Date().toDateString()
      if (saved.date !== today) return { date: today, count: 0 }
      return { date: today, count: Number(saved.count) || 0 }
    } catch {
      return { date: new Date().toDateString(), count: 0 }
    }
  }

  function bumpUsage() {
    const usage = getUsage()
    usage.count += 1
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage))
  }

  function remaining() {
    return Math.max(0, DAILY_FREE_LIMIT - getUsage().count)
  }

  // ------------------------------------------------------------- selection capture
  // Capture both *what* was selected and *where* it lives. "Replace in page"
  // runs long after the browser has cleared the selection (our panel takes
  // focus), so the range/field must be remembered up front. Input and textarea
  // selections never appear in window.getSelection(), hence the activeElement
  // branch.
  function readSelection() {
    const el = document.activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart
      const end = el.selectionEnd
      if (start !== null && end !== null && end > start) {
        return { text: el.value.slice(start, end), range: null, field: { el, start, end } }
      }
    }

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (range.toString().trim()) {
        return { text: range.toString(), range: range.cloneRange(), field: null }
      }
    }
    return null
  }

  // Input/textarea selections have no DOM range — anchor the bubble near the field.
  function captureRect() {
    if (currentField) {
      const rect = currentField.el.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width }
    }
    return currentRange.getBoundingClientRect()
  }

  // ------------------------------------------------------------ selection bubble
  document.addEventListener('mouseup', debounce(onSelectionChange, 200))

  function onSelectionChange() {
    const captured = readSelection()
    if (!captured || captured.text.trim().length < 3) {
      removeFloatBtn()
      return
    }
    // Don't pop the bubble while the user is interacting with our own panel.
    if (panel && panel.contains(document.activeElement)) return

    currentText = captured.text
    currentRange = captured.range
    currentField = captured.field
    showFloatBtn(captureRect(), captured.text)
  }

  function showFloatBtn(rect, text) {
    removeFloatBtn()
    floatBtn = document.createElement('button')
    floatBtn.id = FLOAT_ID
    floatBtn.title = 'Rewrite with Voxly'
    floatBtn.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'

    Object.assign(floatBtn.style, {
      position: 'fixed',
      left: `${Math.max(8, rect.left + rect.width / 2 - 16)}px`,
      top: `${Math.max(8, rect.top - 38)}px`,
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#5e6ad2',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(94,106,210,0.45)',
      zIndex: '2147483647',
    })

    floatBtn.addEventListener('click', () => {
      currentText = text
      openPanel()
    })

    document.body.appendChild(floatBtn)
    setTimeout(removeFloatBtn, 6000)
  }

  function removeFloatBtn() {
    floatBtn?.remove()
    floatBtn = null
  }

  // ----------------------------------------------------------------------- panel
  function openPanel() {
    removeFloatBtn()
    panel?.remove()

    panel = document.createElement('div')
    panel.id = PANEL_ID
    panel.innerHTML = renderPanel()
    document.body.appendChild(panel)

    panel.addEventListener('click', onPanelClick)
    renderLimit()
  }

  function renderPanel() {
    const toneButtons = TONES.map(
      (t) => `
      <button class="voxly-tone" data-tone="${t.id}"
        style="${toneStyle(t.id === activeTone)}">${t.icon} ${t.label}</button>`
    ).join('')

    return `
      <button class="voxly-close" aria-label="Close">×</button>
      <div class="voxly-head">
        <span class="voxly-brand">voxly</span>
        <span class="voxly-limit"></span>
      </div>

      <div class="voxly-section">
        <div class="voxly-label">Original</div>
        <div class="voxly-original">${escapeHtml(currentText)}</div>
      </div>

      <div class="voxly-section">
        <div class="voxly-label">Tone</div>
        <div class="voxly-tones">${toneButtons}</div>
      </div>

      <button class="voxly-go">Rewrite</button>

      <div class="voxly-result" hidden>
        <div class="voxly-label">Rewritten</div>
        <p class="voxly-output"></p>
        <div class="voxly-result-actions">
          <button class="voxly-copy">Copy</button>
          <button class="voxly-replace">Replace in page</button>
        </div>
      </div>

      <div class="voxly-error" hidden></div>
    `
  }

  function toneStyle(active) {
    return active
      ? 'background:rgba(94,106,210,0.16);border-color:#5e6ad2;color:#828fff;'
      : 'background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.08);color:#8a8f98;'
  }

  async function onPanelClick(event) {
    const target = event.target

    if (target.classList.contains('voxly-close')) {
      panel.remove()
      panel = null
      return
    }

    if (target.classList.contains('voxly-tone')) {
      activeTone = target.dataset.tone
      panel.querySelectorAll('.voxly-tone').forEach((btn) => {
        btn.style.cssText = toneStyle(btn.dataset.tone === activeTone)
      })
      return
    }

    if (target.classList.contains('voxly-go')) {
      await runRewrite()
      return
    }

    if (target.classList.contains('voxly-copy')) {
      const text = panel.querySelector('.voxly-output').textContent
      if (await copyText(text)) flash(target, 'Copied')
      else showError('Copy failed — select the text and copy it manually.')
      return
    }

    if (target.classList.contains('voxly-replace')) {
      replaceSelection(panel.querySelector('.voxly-output').textContent)
    }
  }

  async function runRewrite() {
    if (remaining() <= 0) {
      showError('Daily free limit reached. Add the Pro extension for unlimited rewrites.')
      return
    }

    const goBtn = panel.querySelector('.voxly-go')
    const result = panel.querySelector('.voxly-result')
    const output = panel.querySelector('.voxly-output')
    const errorBox = panel.querySelector('.voxly-error')

    goBtn.disabled = true
    goBtn.textContent = 'Rewriting…'
    errorBox.hidden = true
    result.hidden = true

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REWRITE_REQUEST',
        payload: { text: currentText, tone: activeTone },
      })

      if (!response?.ok) throw new Error(response?.error ?? 'Rewrite failed')

      output.textContent = response.data.rewritten
      result.hidden = false
      bumpUsage()
      renderLimit()
    } catch (err) {
      showError(err.message)
    } finally {
      goBtn.disabled = false
      goBtn.textContent = 'Rewrite'
    }
  }

  function showError(message) {
    const errorBox = panel.querySelector('.voxly-error')
    errorBox.textContent = message
    errorBox.hidden = false
  }

  function renderLimit() {
    const el = panel?.querySelector('.voxly-limit')
    if (el) el.textContent = `${remaining()}/${DAILY_FREE_LIMIT} today`
  }

  function replaceSelection(replacement) {
    // The live selection is usually long gone by now — the panel took focus —
    // so work from the range/field captured when the text was selected.
    if (currentField && currentField.el.isConnected) {
      const { el, start, end } = currentField
      el.focus()
      el.value = el.value.slice(0, start) + replacement + el.value.slice(end)
      const caret = start + replacement.length
      el.setSelectionRange(caret, caret)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      closePanel()
      return
    }

    if (currentRange && rangeIsAttached(currentRange)) {
      currentRange.deleteContents()
      currentRange.insertNode(document.createTextNode(replacement))
      closePanel()
      return
    }

    showError('The original selection is gone — copy the result instead.')
  }

  function rangeIsAttached(range) {
    // A range whose endpoints were removed from the document can't be edited.
    return range.startContainer.isConnected && range.endContainer.isConnected
  }

  function closePanel() {
    currentRange = null
    currentField = null
    panel?.remove()
    panel = null
  }

  // -------------------------------------------------------------------- helpers
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // The Clipboard API can reject when the page lacks focus — fall back.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      ta.remove()
      return ok
    }
  }

  function flash(btn, text) {
    const original = btn.textContent
    btn.textContent = text
    setTimeout(() => (btn.textContent = original), 1400)
  }

  function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  function debounce(fn, delay) {
    let timer
    return (...args) => {
      clearTimeout(timer)
      timer = setTimeout(() => fn(...args), delay)
    }
  }

  // ---------------------------------------------------------------- panel styles
  const style = document.createElement('style')
  style.textContent = `
    #${PANEL_ID} {
      position: fixed; right: 20px; top: 50%; transform: translateY(-50%);
      width: 340px; max-height: 84vh; overflow-y: auto; z-index: 2147483647;
      background: #0f1011; border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px; padding: 18px; box-sizing: border-box;
      box-shadow: 0 24px 60px rgba(0,0,0,0.55);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #f7f8f8; animation: voxlyIn 0.18s ease;
    }
    @keyframes voxlyIn {
      from { opacity: 0; transform: translateY(-50%) scale(0.97); }
      to   { opacity: 1; transform: translateY(-50%) scale(1); }
    }
    #${PANEL_ID} * { box-sizing: border-box; }
    #${PANEL_ID} .voxly-close {
      position: absolute; top: 12px; right: 14px; background: none; border: none;
      color: #62666d; font-size: 20px; line-height: 1; cursor: pointer; padding: 2px 6px;
    }
    #${PANEL_ID} .voxly-close:hover { color: #f7f8f8; }
    #${PANEL_ID} .voxly-head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 16px; padding-right: 28px;
    }
    #${PANEL_ID} .voxly-brand { font-size: 15px; font-weight: 600; letter-spacing: -0.3px; }
    #${PANEL_ID} .voxly-brand::first-letter { color: #5e6ad2; }
    #${PANEL_ID} .voxly-limit { font-size: 11px; color: #62666d; }
    #${PANEL_ID} .voxly-section { margin-bottom: 14px; }
    #${PANEL_ID} .voxly-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px;
      color: #62666d; margin-bottom: 6px;
    }
    #${PANEL_ID} .voxly-original {
      font-size: 13px; line-height: 1.55; color: #8a8f98;
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
      border-radius: 8px; padding: 10px; max-height: 90px; overflow-y: auto;
    }
    #${PANEL_ID} .voxly-tones { display: flex; flex-wrap: wrap; gap: 6px; }
    #${PANEL_ID} .voxly-tone {
      padding: 6px 11px; border-radius: 6px; font-size: 12px; cursor: pointer;
      border: 1px solid; font-family: inherit; transition: all 0.15s;
    }
    #${PANEL_ID} .voxly-tone:hover { border-color: rgba(94,106,210,0.5); }
    #${PANEL_ID} .voxly-go {
      width: 100%; padding: 10px; background: #5e6ad2; color: #fff; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;
      font-family: inherit;
    }
    #${PANEL_ID} .voxly-go:hover:not(:disabled) { background: #828fff; }
    #${PANEL_ID} .voxly-go:disabled { opacity: 0.55; cursor: default; }
    #${PANEL_ID} .voxly-result {
      margin-top: 14px; padding: 12px; border-radius: 10px;
      background: rgba(94,106,210,0.06); border: 1px solid rgba(94,106,210,0.2);
    }
    #${PANEL_ID} .voxly-output { font-size: 13px; line-height: 1.6; margin: 0 0 10px; }
    #${PANEL_ID} .voxly-result-actions { display: flex; gap: 6px; }
    #${PANEL_ID} .voxly-copy, #${PANEL_ID} .voxly-replace {
      flex: 1; padding: 7px; border-radius: 6px; font-size: 12px; cursor: pointer;
      background: rgba(255,255,255,0.04); color: #d0d6e0;
      border: 1px solid rgba(255,255,255,0.08); font-family: inherit;
    }
    #${PANEL_ID} .voxly-copy:hover, #${PANEL_ID} .voxly-replace:hover {
      background: rgba(255,255,255,0.08); color: #f7f8f8;
    }
    #${PANEL_ID} .voxly-error {
      margin-top: 12px; padding: 10px; border-radius: 8px; font-size: 12px;
      background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.25);
      color: #ff9d9d;
    }
  `
  document.head.appendChild(style)
})()
