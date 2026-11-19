import { useEffect, useState } from 'react'
import './App.css'

const API = 'http://127.0.0.1:8000'

const navItems = [
  ['overview', '▦', 'Overview'], ['pos', '＋', 'Counter POS'],
  ['inventory', '◫', 'Inventory'], ['radar', '⌁', 'Parts Radar'],
  ['finance', '↗', 'Finance'], ['dispatch', '▱', 'Dispatch'],
]

const demoSales = [
  ['#POS-10482', 'Chain sprocket kit', 'M-Pesa', 'KSh 7,850'],
  ['#POS-10481', 'Brake pads ×2', 'Cash', 'KSh 3,200'],
  ['#POS-10480', 'Spark plugs ×6', 'M-Pesa', 'KSh 1,980'],
]

function App() {
  const [active, setActive] = useState('overview')
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetch(`${API}/health/db`).then(r => r.json()).then(setHealth).catch(() => setHealth({ status: 'offline' }))
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">KM</div><div><strong>KenyaMoto</strong><span>Supply Hub</span></div></div>
        <nav>{navItems.map(([id, icon, label]) => (
          <button key={id} className={active === id ? 'nav-item active' : 'nav-item'} onClick={() => setActive(id)}>
            <span className="nav-icon">{icon}</span>{label}
          </button>
        ))}</nav>
        <div className="sidebar-footer"><div className="avatar">JM</div><div><strong>James Mwangi</strong><span>Branch Manager</span></div></div>
      </aside>

      <main>
        <header className="topbar"><div><p className="eyebrow">Nairobi Central</p><h1>{active === 'overview' ? 'Good morning, James' : navItems.find(i => i[0] === active)?.[2]}</h1></div>
          <div className="top-actions"><span className="live-dot">{health?.status === 'ok' ? 'Database live' : 'Checking database'}</span><button className="icon-button">◉</button><button className="primary">＋ New sale</button></div>
        </header>

        {active === 'overview' && <Overview />}
        {active === 'pos' && <POS />}
        {active === 'inventory' && <SimplePage title="Inventory" />}
        {active === 'radar' && <SimplePage title="Parts Radar" />}
        {active === 'finance' && <SimplePage title="Finance & EOD" />}
        {active === 'dispatch' && <SimplePage title="Dispatch & Logistics" />}
      </main>

      <nav className="mobile-nav">{navItems.slice(0, 5).map(([id, icon]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}>{icon}</button>)}</nav>
    </div>
  )
}

function Overview() {
  return <>
    <section className="stats-grid">
      <Stat label="Today's sales" value="KSh 284,650" change="+12.5%" accent="green" />
      <Stat label="Gross profit" value="KSh 76,420" change="+8.2%" accent="orange" />
      <Stat label="Parts sold" value="1,248" change="+18 units" accent="blue" />
      <Stat label="Low stock" value="23 items" change="Needs attention" accent="red" />
    </section>

    <section className="dashboard-grid">
      <div className="card chart-card"><div className="card-head"><div><p className="eyebrow">Sales performance</p><h2>Weekly revenue</h2></div><button className="filter">This week⌄</button></div>
        <div className="chart"><div className="bars">{[58,72,48,86,64,92,76].map((h,i)=><div className="bar-wrap" key={i}><span style={{height:`${h}%`}} /><small>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</small></div>)}</div></div>
      </div>
      <div className="card radar-card"><div className="card-head"><div><p className="eyebrow">Live requests</p><h2>Parts Radar</h2></div><button className="text-button">View all</button></div>
        {['Boxer 150 fuel tank','TVS HLX clutch plate','Honda CG steering stem'].map((p,i)=><div className="radar-row" key={p}><span className={`radar-badge b${i}`}>{i+1}</span><div><strong>{p}</strong><small>{i === 0 ? 'Nairobi · 4 quotes' : i === 1 ? 'Kiambu · 2 quotes' : 'Thika · 1 quote'}</small></div><b>{i===0?'Urgent':'Open'}</b></div>)}
      </div>
    </section>

    <section className="card sales-card"><div className="card-head"><div><p className="eyebrow">Recent activity</p><h2>Latest sales</h2></div><button className="text-button">View all sales</button></div>
      <div className="sales-table"><div className="table-head"><span>Receipt</span><span>Part</span><span>Payment</span><span>Amount</span></div>{demoSales.map(row=><div className="table-row" key={row[0]}>{row.map((v,i)=><span key={v} className={i===2?'payment':''}>{v}</span>)}</div>)}</div>
    </section>
  </>
}

function Stat({label,value,change,accent}) { return <div className="stat-card"><div className={`stat-icon ${accent}`}>↗</div><div><p>{label}</p><h3>{value}</h3><small className={accent === 'red' ? 'red-text' : 'green-text'}>{change}</small></div></div> }

function POS() { return <section className="pos-layout"><div className="card pos-products"><div className="card-head"><h2>Spare parts</h2><input placeholder="Search part number or name…" /></div><div className="product-grid">{['Chain sprocket kit','Brake pads','Spark plugs','Engine oil','Clutch cable','Headlight'].map((p,i)=><button className="product" key={p}><span>#{1001+i}</span><strong>{p}</strong><small>KSh {[7850,1600,330,1450,650,2200][i].toLocaleString()}</small></button>)}</div></div><div className="card cart"><h2>Current sale</h2><div className="cart-empty">Scan or select items to build a cart</div><div className="totals"><p><span>Subtotal</span><b>KSh 0</b></p><p><span>VAT (16%)</span><b>KSh 0</b></p><p className="total"><span>Total</span><b>KSh 0</b></p></div><button className="checkout">Complete sale</button></div></section> }

function SimplePage({title}) { return <section className="card simple-page"><div className="empty-icon">◫</div><h2>{title}</h2><p>Live workspace ready for data from the FastAPI backend.</p><button className="primary">Add new record</button></section> }

export default App
