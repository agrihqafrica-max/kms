import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney } from '../lib/format.js'
import { AI_ROLE_PRESETS, classifyStockVelocity, selectAiModelForMode } from '../lib/kmsDomain.js'

const MODE_OPTIONS = [
  { id: 'standard', label: 'General · gemini-4-hydrogen' },
  { id: 'fast', label: 'Fast · gemini-3.1-flash-lite' },
  { id: 'search', label: 'Web Search · Google Search' },
  { id: 'maps', label: 'Nearby Places · Google Maps' },
]

const STARTER_PROMPTS = [
  'Verify OEM part numbers & Kenya prices for Bajaj Boxer BM150 chain & sprocket kit.',
  'Find wholesale motorcycle spare-parts shops and boda garages near Kirinyaga Road, Nairobi.',
  'Review my low-stock and dead-stock risks and recommend an immediate reorder action.',
]

export default function Assistant() {
  const {
    inventory,
    sales,
    expenses,
    creditAccounts,
    etimsInvoices,
    chatThreads,
    createChatThread,
    updateChatThreadConfig,
    subscribeChatThread,
    appendChatMessage,
    createPurchaseOrder,
    agentControls,
    toggleAgentControl,
    activeBranchId,
  } = useWorkspace()

  const [selectedThreadId, setSelectedThreadId] = useState('')
  const activeThreadId = selectedThreadId || chatThreads[0]?.id || 'thread-default'
  const activeThread = chatThreads.find(th => th.id === activeThreadId)

  const [messages, setMessages] = useState([])
  const [rolePresetOverride, setRolePresetOverride] = useState('')
  const [modelModeOverride, setModelModeOverride] = useState('')
  const rolePreset = rolePresetOverride || activeThread?.rolePreset || AI_ROLE_PRESETS[0].id
  const modelMode = modelModeOverride || activeThread?.modelMode || 'standard'

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [coords, setCoords] = useState(null)
  const [geoStatus, setGeoStatus] = useState('')
  const threadEndRef = useRef(null)

  useEffect(() => {
    if (!activeThreadId) return
    return subscribeChatThread(activeThreadId, rows => {
      setMessages(rows)
    })
  }, [activeThreadId, subscribeChatThread])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, busy])

  function requestLocation() {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocation unavailable in this browser.')
      return
    }
    setGeoStatus('Detecting coordinates…')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        setGeoStatus(`Using GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
      },
      () => {
        setCoords({ latitude: -1.2833, longitude: 36.8167 })
        setGeoStatus('Location permission denied — using Nairobi CBD reference (-1.2833, 36.8167).')
      },
      { timeout: 8000 },
    )
  }

  async function handleNewThread() {
    const created = await createChatThread({
      title: `Session ${chatThreads.length + 1}`,
      rolePreset,
      modelMode,
    })
    if (created?.id) setSelectedThreadId(created.id)
  }

  async function sendPrompt(textToSend) {
    const text = String(textToSend ?? draft).trim()
    if (!text || busy) return
    const targetThreadId = activeThreadId || chatThreads[0]?.id || 'thread-default'
    setDraft('')
    setError('')
    setBusy(true)

    try {
      const presetObj = AI_ROLE_PRESETS.find(p => p.id === rolePreset) || AI_ROLE_PRESETS[0]
      const branchSummary = `Active branch: ${activeBranchId}. SKUs in stock: ${inventory.length}. Low-stock alerts: ${inventory.filter(i => i.stockQuantity <= i.reorderLevel).length}.`
      const systemInstruction = `${presetObj.systemInstruction} Current workspace context: ${branchSummary}`

      const historyPayload = messages
        .filter(m => m.role === 'user' || m.role === 'model')
        .slice(-16)
        .map(m => ({ role: m.role, text: m.text }))

      await appendChatMessage(targetThreadId, {
        role: 'user',
        text,
        mode: modelMode,
        model: selectAiModelForMode(modelMode),
      })

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          systemInstruction,
          mode: modelMode,
          latLng: modelMode === 'maps' ? coords || { latitude: -1.2833, longitude: 36.8167 } : undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.detail || data.error || 'AI service returned an error.')
      }

      await appendChatMessage(targetThreadId, {
        role: 'model',
        text: data.text || 'No response generated.',
        model: data.model || selectAiModelForMode(modelMode),
        mode: data.mode || modelMode,
        links: {
          webSources: data.webSources || [],
          mapPlaces: data.mapPlaces || [],
        },
      })
    } catch (err) {
      setError(err.message || 'Unable to reach Gemini AI endpoint.')
    } finally {
      setBusy(false)
    }
  }

  const branchInventory = inventory.filter(i => i.branchId === activeBranchId)
  const reorderSuggestions = branchInventory
    .map(item => ({ item, meta: classifyStockVelocity(item) }))
    .filter(row => row.meta.needsReorder)

  const todaySales = sales.filter(s => s.branchId === activeBranchId).reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const todayExpenses = expenses.filter(e => e.branchId === activeBranchId).reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const highChurnCount = creditAccounts.filter(c => c.churnRisk === 'High').length
  const queuedEtims = etimsInvoices.filter(inv => inv.status === 'Queued').length

  async function approveAiReorder(row) {
    setNotice('')
    await createPurchaseOrder({
      supplierName: 'Kirinyaga OEM Distributors Ltd',
      itemsSummary: `${row.item.partNumber} (${row.item.partName}) x ${row.meta.suggestedOrderQty}`,
      totalCost: row.meta.estimatedReorderCost,
      freightCharges: 450,
    })
    setNotice(`AI Reorder Draft approved -> PO created for ${row.item.partNumber}.`)
  }

  return (
    <div className="assistant-layout">
      <section className="card chat-panel">
        <div className="card-head wrap-head">
          <div>
            <p className="eyebrow">Phase 5 · Gemini Multi-Turn Co-Pilot</p>
            <h2>KenyaMoto AI Supply Assistant</h2>
          </div>
          <div className="inline-controls">
            <select
              aria-label="Conversation thread"
              value={activeThreadId}
              onChange={e => setSelectedThreadId(e.target.value)}
            >
              {chatThreads.map(th => (
                <option key={th.id} value={th.id}>
                  {th.title}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleNewThread}>
              + New thread
            </button>
          </div>
        </div>

        <div className="ai-config-bar">
          <label>
            Role &amp; System Instruction
            <select
              value={rolePreset}
              onChange={e => {
                setRolePresetOverride(e.target.value)
                if (activeThreadId) void updateChatThreadConfig(activeThreadId, { rolePreset: e.target.value })
              }}
            >
              {AI_ROLE_PRESETS.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model &amp; Grounding Mode
            <select
              value={modelMode}
              onChange={e => {
                const next = e.target.value
                setModelModeOverride(next)
                if (next === 'maps' && !coords) requestLocation()
                if (activeThreadId) void updateChatThreadConfig(activeThreadId, { modelMode: next })
              }}
            >
              {MODE_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {modelMode === 'maps' && (
          <div className="geo-bar">
            <span>{geoStatus || 'Maps grounding uses your GPS location to rank nearby wholesalers & garages.'}</span>
            <button type="button" onClick={requestLocation}>
              Refresh GPS
            </button>
          </div>
        )}

        <div className="starter-chips">
          {STARTER_PROMPTS.map(prompt => (
            <button
              key={prompt}
              type="button"
              className="chip-btn"
              onClick={() => void sendPrompt(prompt)}
              disabled={busy}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="chat-thread" aria-live="polite">
          {messages.length === 0 ? (
            <p className="muted">Ask a question about parts fitment, KES margins, Google Search market prices, or nearby Nairobi wholesalers.</p>
          ) : (
            messages.map(msg => {
              let parsedLinks = null
              if (msg.linksJson) {
                try {
                  parsedLinks = JSON.parse(msg.linksJson)
                } catch {
                  parsedLinks = null
                }
              }
              return (
                <article key={msg.id} className={`chat-bubble ${msg.role === 'user' ? 'user' : 'model'}`}>
                  <header className="bubble-meta">
                    <strong>{msg.role === 'user' ? 'You' : 'Gemini Co-Pilot'}</strong>
                    {msg.model && <span>{msg.model}</span>}
                  </header>
                  <p className="bubble-text">{msg.text}</p>
                  {parsedLinks?.webSources?.length > 0 && (
                    <div className="grounding-box">
                      <strong>Google Search Sources</strong>
                      <ul>
                        {parsedLinks.webSources.map(src => (
                          <li key={src.uri}>
                            <a href={src.uri} target="_blank" rel="noreferrer">
                              {src.title || src.uri}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {parsedLinks?.mapPlaces?.length > 0 && (
                    <div className="grounding-box">
                      <strong>Google Maps Places</strong>
                      <ul>
                        {parsedLinks.mapPlaces.map(place => (
                          <li key={place.uri}>
                            <a href={place.uri} target="_blank" rel="noreferrer">
                              {place.title}
                            </a>
                            {place.snippets?.map((snip, idx) => (
                              <small key={idx} className="snippet-note">
                                {snip.snippet}
                              </small>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              )
            })
          )}
          {busy && <p className="muted">Thinking…</p>}
          <div ref={threadEndRef} />
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <form
          className="chat-composer"
          onSubmit={e => {
            e.preventDefault()
            void sendPrompt()
          }}
        >
          <input
            aria-label="Ask KenyaMoto Co-Pilot"
            placeholder="Ask about part compatibility, KES pricing, or nearby suppliers…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={busy}
          />
          <button className="primary" type="submit" disabled={busy || !draft.trim()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </form>
      </section>

      <aside className="copilot-rail">
        <section className="card">
          <p className="eyebrow">Morning Briefing</p>
          <h2>Executive Snapshot</h2>
          <ul className="briefing-list">
            <li>
              <span>Branch Sales</span>
              <strong>{formatMoney(todaySales)}</strong>
            </li>
            <li>
              <span>Branch Expenses</span>
              <strong>{formatMoney(todayExpenses)}</strong>
            </li>
            <li>
              <span>High Churn Buyers</span>
              <strong>{highChurnCount}</strong>
            </li>
            <li>
              <span>Queued eTIMS Docs</span>
              <strong>{queuedEtims}</strong>
            </li>
          </ul>
        </section>

        <section className="card">
          <p className="eyebrow">Approval Queue</p>
          <h2>AI Reorder Drafts</h2>
          {notice && <p className="notice" role="status">{notice}</p>}
          {!agentControls.reorderIntelligence ? (
            <p className="muted">Reorder Intelligence agent is suspended via Kill Switch.</p>
          ) : reorderSuggestions.length === 0 ? (
            <p className="muted">All branch SKUs are above reorder thresholds.</p>
          ) : (
            <ul className="draft-list">
              {reorderSuggestions.map(row => (
                <li key={row.item.id}>
                  <div>
                    <strong>{row.item.partNumber}</strong>
                    <small>
                      Stock {row.item.stockQuantity}/{row.item.reorderLevel} · Suggest +{row.meta.suggestedOrderQty} ({formatMoney(row.meta.estimatedReorderCost)})
                    </small>
                  </div>
                  <button className="primary" type="button" onClick={() => void approveAiReorder(row)}>
                    Approve PO
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">Governance</p>
          <h2>Agent Kill Switches</h2>
          <div className="switch-list">
            {[
              ['reorderIntelligence', 'Reorder Intelligence'],
              ['marginGuardian', 'Margin Guardian'],
              ['partsRadarMatcher', 'Parts Radar Matcher'],
              ['whatsappCopilot', 'WhatsApp Quote Co-Pilot'],
            ].map(([key, label]) => (
              <label key={key} className="switch-row">
                <span>{label}</span>
                <button
                  type="button"
                  className={agentControls[key] ? 'status-tag ok' : 'status-tag muted'}
                  onClick={() => void toggleAgentControl(key)}
                >
                  {agentControls[key] ? 'Active' : 'Suspended'}
                </button>
              </label>
            ))}
          </div>
        </section>
      </aside>
    </div>
  )
}
