import { useState } from 'react'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney } from '../lib/format.js'

export default function Radar() {
  const { radarRequests, createRadarRequest, updateRadarRequest } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  // Google Maps Grounding state (Nearby Suppliers & Hubs)
  const [mapsQuery, setMapsQuery] = useState('Motorcycle spare parts wholesalers and boda garages near Kirinyaga Road, Nairobi')
  const [mapsResult, setMapsResult] = useState(null)
  const [mapsBusy, setMapsBusy] = useState(false)
  const [geoInfo, setGeoInfo] = useState('')

  // Google Search Grounding state (Quick Market Price Check)
  const [searchResult, setSearchResult] = useState(null)
  const [searchBusy, setSearchBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setNotice('')
    try {
      await createRadarRequest({
        partDescription: form.get('partDescription'),
        motorcycleModel: form.get('motorcycleModel'),
        urgencyStatus: form.get('urgencyStatus'),
        locationArea: form.get('locationArea'),
      })
      event.currentTarget.reset()
      setNotice('Reverse-search request broadcasted to verified stockists.')
    } finally {
      setBusy(false)
    }
  }

  async function findNearbySuppliers(event) {
    event.preventDefault()
    if (!mapsQuery.trim() || mapsBusy) return
    setMapsBusy(true)
    setMapsResult(null)

    const getCoords = () =>
      new Promise(resolve => {
        if (!navigator.geolocation) {
          setGeoInfo('GPS unavailable — centered on Nairobi CBD (-1.2833, 36.8167).')
          resolve({ latitude: -1.2833, longitude: 36.8167 })
          return
        }
        navigator.geolocation.getCurrentPosition(
          pos => {
            setGeoInfo(`Using live GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
            resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
          },
          () => {
            setGeoInfo('GPS permission declined — centered on Nairobi CBD (-1.2833, 36.8167).')
            resolve({ latitude: -1.2833, longitude: 36.8167 })
          },
          { timeout: 6000 },
        )
      })

    try {
      const latLng = await getCoords()
      const res = await fetch('/api/ai/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mapsQuery.trim(), latLng }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || 'Maps lookup failed')
      setMapsResult(data)
    } catch (err) {
      setMapsResult({ error: err.message })
    } finally {
      setMapsBusy(false)
    }
  }

  async function checkMarketPrice(partDescription, motorcycleModel) {
    setSearchBusy(true)
    setSearchResult(null)
    try {
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${partDescription} ${motorcycleModel || ''} spare part price and OEM compatibility in Kenya`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || 'Search check failed')
      setSearchResult(data)
    } catch (err) {
      setSearchResult({ error: err.message })
    } finally {
      setSearchBusy(false)
    }
  }

  return (
    <div className="stacked-pages">
      <section className="card">
        <p className="eyebrow">Phase 4 · Parts Radar &amp; Fitment Verification</p>
        <h2>Reverse-Search Requests &amp; Blind-Stock Quotes</h2>
        {notice && <p className="notice" role="status">{notice}</p>}

        <ul className="request-list">
          {radarRequests.map(row => (
            <li key={row.id}>
              <div className="card-head wrap-head">
                <div>
                  <strong>{row.partDescription}</strong>
                  <p className="muted">{row.motorcycleModel || 'Universal Fit'} · Area: {row.locationArea || 'Nairobi'}</p>
                  <div className="request-meta">
                    <span>Urgency: <strong>{row.urgencyStatus}</strong></span>
                    <span>Status: <strong>{row.status}</strong></span>
                    {row.fitConfidence && <span>Fitment: {row.fitConfidence.replace('_', ' ')}</span>}
                    {row.quotedPrice > 0 && <span>Quote: <strong>{formatMoney(row.quotedPrice)}</strong> ({row.quotedSupplierArea})</span>}
                    {row.reservationExpiresAt && <span>Hold expires: {row.reservationExpiresAt}</span>}
                    {row.disputeStatus === 'Open' && <strong className="form-error">Dispute Flagged</strong>}
                  </div>
                </div>

                <div className="inline-controls">
                  {row.status === 'Open' && (
                    <button
                      type="button"
                      onClick={() =>
                        void updateRadarRequest(row.id, {
                          status: 'Pending',
                          quotedPrice: 1850,
                          quotedSupplierArea: 'Kirinyaga Road Stockist',
                          fitConfidence: 'verified_fit',
                        })
                      }
                    >
                      Simulate Verified Quote
                    </button>
                  )}
                  {(row.status === 'Pending' || row.status === 'Open') && (
                    <button
                      className="primary"
                      type="button"
                      onClick={() =>
                        void updateRadarRequest(row.id, {
                          status: 'Reserved',
                          fitConfidence: row.fitConfidence || 'verified_fit',
                          reservationExpiresAt: new Date(Date.now() + 2 * 3600 * 1000).toLocaleTimeString(),
                        })
                      }
                    >
                      Reserve (2h Hold)
                    </button>
                  )}
                  {row.status === 'Reserved' && (
                    <button className="primary" type="button" onClick={() => void updateRadarRequest(row.id, { status: 'Resolved' })}>
                      Confirm Delivery
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={searchBusy}
                    onClick={() => void checkMarketPrice(row.partDescription, row.motorcycleModel)}
                  >
                    Web Price Check
                  </button>
                  {row.status !== 'Resolved' && row.disputeStatus !== 'Open' && (
                    <button type="button" onClick={() => void updateRadarRequest(row.id, { disputeStatus: 'Open' })}>
                      Flag Wrong-Part
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {searchResult && (
          <div className="sub-card">
            <strong>Google Search Market Benchmark</strong>
            {searchResult.error ? (
              <p className="form-error">{searchResult.error}</p>
            ) : (
              <>
                <p className="bubble-text">{searchResult.text}</p>
                {searchResult.webSources?.length > 0 && (
                  <div className="grounding-box">
                    <ul>
                      {searchResult.webSources.map(s => (
                        <li key={s.uri}><a href={s.uri} target="_blank" rel="noreferrer">{s.title || s.uri}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <form className="inventory-form" onSubmit={handleSubmit}>
          <h3>Broadcast New Part Request</h3>
          <div className="form-grid">
            <label>Part Description<input name="partDescription" required placeholder="Rear Shock Absorber Pair — Heavy Duty" /></label>
            <label>Motorcycle Model<input name="motorcycleModel" placeholder="Bajaj Boxer BM150" /></label>
            <label>Area / Stage<input name="locationArea" defaultValue="Nairobi CBD" /></label>
            <label>
              Urgency
              <select name="urgencyStatus">
                <option value="Urgent">Urgent (Breakdown)</option>
                <option value="Normal">Normal Restock</option>
              </select>
            </label>
          </div>
          <button className="primary" type="submit" disabled={busy}>Broadcast Radar Request</button>
        </form>
      </section>

      <section className="card">
        <p className="eyebrow">Google Maps Grounding · Nearby Suppliers &amp; Garages</p>
        <h2>Find Nearby Wholesalers &amp; Rider Hubs</h2>
        <form onSubmit={findNearbySuppliers} className="inline-search-form">
          <input
            aria-label="Nearby supplier query"
            value={mapsQuery}
            onChange={e => setMapsQuery(e.target.value)}
            placeholder="Find motorcycle spare shops near me…"
          />
          <button className="primary" type="submit" disabled={mapsBusy || !mapsQuery.trim()}>
            {mapsBusy ? 'Locating…' : 'Search Google Maps'}
          </button>
        </form>
        {geoInfo && <p className="muted">{geoInfo}</p>}

        {mapsResult?.error && <p className="form-error" role="alert">{mapsResult.error}</p>}
        {mapsResult?.text && (
          <div className="sub-card">
            <p className="bubble-text">{mapsResult.text}</p>
            {mapsResult.mapPlaces?.length > 0 && (
              <div className="grounding-box">
                <strong>Verified Google Maps Locations</strong>
                <ul>
                  {mapsResult.mapPlaces.map(place => (
                    <li key={place.uri}>
                      <a href={place.uri} target="_blank" rel="noreferrer">{place.title}</a>
                      {place.snippets?.map((snip, idx) => (
                        <small key={idx} className="snippet-note">{snip.snippet}</small>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
