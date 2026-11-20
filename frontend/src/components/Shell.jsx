import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useTenant } from '../tenancy/context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
import { BranchSwitcher } from '../tenancy/SelectionPages.jsx'
import { Brand, ErrorState } from './States.jsx'
import { getLanguage, setLanguage, t } from '../i18n/index.js'
import { formatMoney, nairobiDay } from '../lib/format.js'
import { canAccessNavItem, canAccessRoute } from '../lib/platformGovernance.js'

const NAV_SECTIONS = [
  {
    groupKey: 'navGroupOps',
    items: [
      { id: 'overview', to: '/app/overview', basePath: '/app/overview', tab: null, labelKey: 'overview', icon: 'overview' },
      { id: 'pos', to: '/app/pos', basePath: '/app/pos', tab: 'register', isDefaultTab: true, labelKey: 'pos', icon: 'pos' },
      { id: 'pos_returns', to: '/app/pos?tab=returns', basePath: '/app/pos', tab: 'returns', labelKey: 'posReturns', icon: 'returns' },
      { id: 'pos_shifts', to: '/app/pos?tab=shifts', basePath: '/app/pos', tab: 'shifts', labelKey: 'posShifts', icon: 'shifts' },
      { id: 'pos_customers', to: '/app/pos?tab=customers', basePath: '/app/pos', tab: 'customers', labelKey: 'posCustomers', icon: 'customers' },
      { id: 'dispatch', to: '/app/dispatch', basePath: '/app/dispatch', tab: null, labelKey: 'dispatch', icon: 'dispatch' },
    ],
  },
  {
    groupKey: 'navGroupSupply',
    items: [
      { id: 'inventory', to: '/app/inventory', basePath: '/app/inventory', tab: 'catalogue', isDefaultTab: true, labelKey: 'inventory', icon: 'inventory' },
      { id: 'inventory_locations', to: '/app/inventory?tab=locations', basePath: '/app/inventory', tab: 'locations', labelKey: 'inventoryLocations', icon: 'locations' },
      { id: 'inventory_reorder', to: '/app/inventory?tab=reorder', basePath: '/app/inventory', tab: 'reorder', labelKey: 'inventoryReorder', icon: 'reorder' },
      { id: 'inventory_procurement', to: '/app/inventory?tab=procurement', basePath: '/app/inventory', tab: 'procurement', labelKey: 'inventoryProcurement', icon: 'procurement' },
      { id: 'inventory_counts', to: '/app/inventory?tab=counts', basePath: '/app/inventory', tab: 'counts', labelKey: 'inventoryCounts', icon: 'counts' },
      { id: 'radar', to: '/app/radar', basePath: '/app/radar', tab: null, labelKey: 'radar', icon: 'radar' },
    ],
  },
  {
    groupKey: 'navGroupFinance',
    items: [
      { id: 'finance', to: '/app/finance', basePath: '/app/finance', tab: 'eod', isDefaultTab: true, labelKey: 'finance', icon: 'finance', requiresFinanceRole: true },
      { id: 'finance_ledger', to: '/app/finance?tab=ledger', basePath: '/app/finance', tab: 'ledger', labelKey: 'financeLedger', icon: 'ledger', requiresFinanceRole: true },
      { id: 'finance_reports', to: '/app/finance?tab=reports', basePath: '/app/finance', tab: 'reports', labelKey: 'financeReports', icon: 'reports', requiresFinanceRole: true },
      { id: 'assistant', to: '/app/assistant', basePath: '/app/assistant', tab: null, labelKey: 'assistant', icon: 'assistant' },
    ],
  },
  {
    groupKey: 'navGroupAdmin',
    items: [
      { id: 'network', to: '/app/network', basePath: '/app/network', tab: 'governance', isDefaultTab: true, labelKey: 'network', icon: 'network' },
      { id: 'network_health', to: '/app/network?tab=health', basePath: '/app/network', tab: 'health', labelKey: 'networkHealth', icon: 'health' },
      { id: 'network_support', to: '/app/network?tab=support', basePath: '/app/network', tab: 'support', labelKey: 'networkSupport', icon: 'support' },
    ],
  },
]

function isNavItemActive(item, pathname, search) {
  if (pathname !== item.basePath) return false
  const currentTab = new URLSearchParams(search || '').get('tab')
  if (!item.tab) return true
  if (!currentTab) return Boolean(item.isDefaultTab)
  return currentTab === item.tab
}

function NavIcon({ name }) {
  const props = {
    className: 'nav-icon',
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }
  switch (name) {
    case 'overview':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    case 'pos':
      return (
        <svg {...props}>
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 14h4" />
        </svg>
      )
    case 'returns':
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      )
    case 'shifts':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 13h18" />
          <path d="M10 16h4" />
        </svg>
      )
    case 'customers':
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'dispatch':
      return (
        <svg {...props}>
          <path d="M10 17h4V5H2v12h3" />
          <path d="M14 9h4l4 4v4h-3" />
          <circle cx="7.5" cy="17.5" r="2.5" />
          <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
      )
    case 'inventory':
      return (
        <svg {...props}>
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      )
    case 'locations':
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10a8 8 0 1 0-16 0c0 6 8 10 8 10Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'reorder':
      return (
        <svg {...props}>
          <path d="m21 16-4 4-4-4" />
          <path d="M17 20V4" />
          <path d="m3 8 4-4 4 4" />
          <path d="M7 4v16" />
        </svg>
      )
    case 'procurement':
      return (
        <svg {...props}>
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      )
    case 'counts':
      return (
        <svg {...props}>
          <path d="m9 11 3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    case 'radar':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
          <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
        </svg>
      )
    case 'finance':
      return (
        <svg {...props}>
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      )
    case 'ledger':
      return (
        <svg {...props}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      )
    case 'reports':
      return (
        <svg {...props}>
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      )
    case 'assistant':
      return (
        <svg {...props}>
          <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
        </svg>
      )
    case 'network':
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
    case 'health':
      return (
        <svg {...props}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      )
    case 'support':
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <path d="m4.93 4.93 4.24 4.24" />
          <path d="m14.83 14.83 4.24 4.24" />
          <path d="m14.83 9.17 4.24-4.24" />
          <path d="m4.93 19.07 4.24-4.24" />
        </svg>
      )
  }
}

function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone === true
    )
  })
  const [isIOS] = useState(() => {
    if (typeof window === 'undefined') return false
    return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
  })
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    const onPrompt = event => {
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isInstalled) return null

  if (deferredPrompt) {
    return (
      <button
        type="button"
        className="btn-sm primary"
        onClick={async () => {
          await deferredPrompt.prompt()
          const choice = await deferredPrompt.userChoice
          if (choice?.outcome === 'accepted') {
            setIsInstalled(true)
            setDeferredPrompt(null)
          }
        }}
      >
        Install App
      </button>
    )
  }

  if (isIOS) {
    return (
      <>
        <button type="button" className="btn-sm" onClick={() => setShowIOSGuide(true)}>
          Install iOS App
        </button>
        {showIOSGuide && (
          <div className="pwa-modal-backdrop" role="dialog" aria-modal="true" aria-label="Install iOS App">
            <div className="pwa-modal">
              <h3>Install Kenya Motorcycle Spare Parts General</h3>
              <p className="muted">
                1. Tap the <strong>Share</strong> icon in Safari.<br />
                2. Tap <strong>Add to Home Screen</strong> for offline POS access.
              </p>
              <button type="button" className="primary" onClick={() => setShowIOSGuide(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  return null
}

function SyncIndicator() {
  const { session } = useAuth()
  const { isFirebaseSession, offlineMode, outbox = [], outboxConflicts = [] } = useWorkspace()
  const unverifiedFirebase = session?.provider === 'firebase' && session?.user?.emailVerified === false
  let label = 'Local Workspace'
  if (offlineMode) {
    label = 'Offline outbox'
  } else if (isFirebaseSession) {
    label = 'Cloud Firestore Synced'
  } else if (session?.provider === 'supabase') {
    label = 'Supabase Auth Connected'
  } else if (unverifiedFirebase) {
    label = 'Verify Email for Cloud Sync'
  }
  return (
    <span className={`sync-state ${offlineMode || outboxConflicts.length ? 'healthOffline' : 'healthOk'}`} role="status">
      {label}
      {outbox.length > 0 ? ` · ${outbox.length} queued` : ''}
      {outboxConflicts.length > 0 ? ` · ${outboxConflicts.length} conflict(s)` : ''}
    </span>
  )
}

function FloatingUtilityDock() {
  const navigate = useNavigate()
  const { data: { context }, setBranch } = useTenant()
  const {
    activeBranchId,
    branches = [],
    inventory = [],
    sales = [],
    expenses = [],
    radarRequests = [],
    notifications = [],
    markNotificationRead,
    drawerShifts = [],
    offlineMode,
    outbox = [],
    outboxConflicts = [],
    syncOutbox,
    resolveOutboxConflict,
    recordDailyExpense,
  } = useWorkspace()

  const role = context.role || 'cashier'
  const isOwner = role === 'owner'
  const canRecordExpense = ['owner', 'manager', 'accountant', 'cashier'].includes(role)
  const canOpenPos = canAccessNavItem(role, 'pos')
  const canOpenRadar = canAccessNavItem(role, 'radar')
  const canOpenAssistant = canAccessNavItem(role, 'assistant')

  const [open, setOpen] = useState(false)
  const [dockTab, setDockTab] = useState('spares')
  const [sparesQuery, setSparesQuery] = useState('')
  const [sparesAllBranches, setSparesAllBranches] = useState(false)
  const [costKes, setCostKes] = useState('1450')
  const [sellKes, setSellKes] = useState('2200')
  const [locatorQuery, setLocatorQuery] = useState('')
  const [nearbyQuery, setNearbyQuery] = useState('Motorcycle spare parts wholesale Kirinyaga Road Nairobi')
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const [nearbyResult, setNearbyResult] = useState(null)
  const [nearbyError, setNearbyError] = useState('')
  const [waPhone, setWaPhone] = useState('+2547')
  const [waMessage, setWaMessage] = useState('')
  const [waConsent, setWaConsent] = useState(true)
  const [waBusy, setWaBusy] = useState(false)
  const [expCat, setExpCat] = useState('Boda Courier')
  const [expAmt, setExpAmt] = useState('')
  const [dockMsg, setDockMsg] = useState('')

  const targetBranchId = context.branch_id || activeBranchId
  const companyBranches = branches.filter(b => !b.organizationId || b.organizationId === context.organization_id)
  const branchMap = new Map(branches.map(b => [b.id, b]))
  const activeBranch = branchMap.get(targetBranchId) || companyBranches[0] || branches[0]

  const openRadarItems = radarRequests.filter(r => r.status === 'Open' || r.status === 'Pending')
  const radarNotifications = notifications.filter(
    n => n.templateKey === 'RADAR_ITEM_POSTED' || String(n.title || '').toLowerCase().includes('radar'),
  )
  const unreadRadarNotifs = radarNotifications.filter(n => n.status === 'Unread')
  const radarBadgeCount = unreadRadarNotifs.length > 0 ? unreadRadarNotifs.length : openRadarItems.length

  const cost = Math.max(0, Number(costKes || 0))
  const sell = Math.max(0, Number(sellKes || 0))
  const profit = sell - cost
  const marginPct = sell > 0 ? Math.round((profit / sell) * 1000) / 10 : 0
  const vatAmount = Math.round(sell * 0.16 * 100) / 100
  const incVat = Math.round((sell + vatAmount) * 100) / 100

  const sparesNeedle = sparesQuery.trim().toLowerCase()
  const matchingSpares = inventory
    .filter(item => {
      if (!sparesAllBranches && targetBranchId && item.branchId !== targetBranchId) return false
      if (!sparesNeedle) return true
      return [item.partName, item.partNumber, item.compatibleModels, item.binLocation, item.brand, item.category]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(sparesNeedle))
    })
    .slice(0, 12)

  const locatorNeedle = locatorQuery.trim().toLowerCase()
  const locatorSkus = inventory
    .filter(item => {
      if (targetBranchId && item.branchId !== targetBranchId) return false
      if (!locatorNeedle) return true
      return [item.partName, item.partNumber, item.binLocation, item.compatibleModels]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(locatorNeedle))
    })
    .slice(0, 6)

  const effectiveTab = !isOwner && dockTab === 'report' ? 'spares' : dockTab

  const dockTabs = [
    ['spares', 'Check Spares'],
    ['calc', 'Calculator'],
    ['locator', 'Locator'],
    ['whatsapp', 'WhatsApp'],
    ['radar', radarBadgeCount > 0 ? `Radar (${radarBadgeCount})` : 'Radar'],
    ['expense', canRecordExpense ? 'Expense & Sync' : 'Sync Queue'],
    ...(isOwner ? [['report', 'Day Report']] : []),
  ]

  function handleQuoteOnWhatsApp(item) {
    const itemBranch = branchMap.get(item.branchId)
    const available = Math.max(0, Number(item.stockQuantity || 0) - Number(item.reservedQuantity || 0))
    const statusText = available > 0 ? `${available} ${item.uom || 'pc'}(s) in stock` : 'currently out of stock (can source on Radar)'
    setWaMessage(
      `Hello from ${context.organization_name} (${itemBranch?.name || activeBranch?.name || 'Counter'}): ${item.partName} [${item.partNumber}] for ${item.compatibleModels || 'your bike'} is ${statusText} at ${formatMoney(item.sellingPrice)}. Reply to confirm pickup or boda delivery.`,
    )
    setDockMsg(`Prepared WhatsApp quote for ${item.partNumber}.`)
    setDockTab('whatsapp')
  }

  async function handleQuickExpense(event) {
    event.preventDefault()
    if (!Number(expAmt)) return
    try {
      await recordDailyExpense({ category: expCat, amount: Number(expAmt), description: 'Captured via Quick Dock' })
      setExpAmt('')
      setDockMsg(`Recorded KES ${expAmt} petty cash expense & balanced JE.`)
    } catch (err) {
      setDockMsg(err?.message || 'Could not save expense.')
    }
  }

  async function handleSendWhatsApp(event) {
    event.preventDefault()
    const cleanPhone = waPhone.replace(/\s+/g, '')
    if (!cleanPhone || !waMessage.trim()) return
    setWaBusy(true)
    setDockMsg('')
    try {
      const res = await fetch('/api/notifications/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanPhone,
          message: waMessage.trim(),
          customerConsentWhatsApp: waConsent,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'WhatsApp Cloud gateway not configured — use Open wa.me Chat below.')
      }
      setDockMsg(`WhatsApp sent to ${cleanPhone} (${data.provider || 'API'}).`)
    } catch (err) {
      setDockMsg(err?.message || 'Could not send via WhatsApp Cloud API. Use Open wa.me Chat below.')
    } finally {
      setWaBusy(false)
    }
  }

  async function handleLocateNearby(event) {
    event.preventDefault()
    const q = nearbyQuery.trim()
    if (!q) return
    setNearbyBusy(true)
    setNearbyError('')
    let latLng = { latitude: -1.2833, longitude: 36.8167 }
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3500 }),
        )
        latLng = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
      } catch {
        // Use Nairobi CBD fallback coordinates when permission is denied/unavailable
      }
    }
    try {
      const res = await fetch('/api/ai/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, latLng }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Maps lookup unavailable right now.')
      }
      setNearbyResult({
        text: data.text || '',
        places: Array.isArray(data.mapPlaces) ? data.mapPlaces : [],
      })
    } catch (err) {
      setNearbyError(err?.message || 'Maps grounding unavailable; use Google Maps link below.')
    } finally {
      setNearbyBusy(false)
    }
  }

  const todayKey = nairobiDay()
  const isTodayRecord = row => {
    const raw = row?.saleDate || row?.expenseDate || row?.createdAt || ''
    if (!raw) return true
    if (typeof raw === 'string') return raw.slice(0, 10) === todayKey
    if (typeof raw?.toDate === 'function') return nairobiDay(raw.toDate()) === todayKey
    if (typeof raw?.seconds === 'number') return nairobiDay(new Date(raw.seconds * 1000)) === todayKey
    return true
  }

  const inventoryById = new Map(inventory.map(i => [i.id, i]))
  const daySalesAll = isOwner ? sales.filter(isTodayRecord) : []
  const daySalesBranch = isOwner ? daySalesAll.filter(s => !targetBranchId || s.branchId === targetBranchId) : []
  const dayExpensesBranch = isOwner ? expenses.filter(e => isTodayRecord(e) && (!targetBranchId || e.branchId === targetBranchId)) : []
  const daySalesTotal = daySalesBranch.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const dayCompanySalesTotal = daySalesAll.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const dayExpensesTotal = dayExpensesBranch.reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const dayCogs = daySalesBranch.reduce((sum, s) => {
    if (Number.isFinite(Number(s.totalCogs))) return sum + Number(s.totalCogs)
    const lines = Array.isArray(s.items) ? s.items : []
    return (
      sum +
      lines.reduce((acc, line) => {
        const sku = inventoryById.get(line.skuId || line.id)
        const unitCost = Number(line.unitCost ?? sku?.unitCost ?? 0)
        return acc + unitCost * Number(line.qty || line.quantity || 1)
      }, 0)
    )
  }, 0)
  const dayGrossProfit = daySalesTotal - dayCogs
  const dayGrossMarginPct = daySalesTotal > 0 ? Math.round((dayGrossProfit / daySalesTotal) * 1000) / 10 : 0
  const dayCashSales = daySalesBranch
    .filter(s => String(s.paymentMethod || '').toLowerCase().includes('cash'))
    .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const dayMpesaSales = daySalesBranch
    .filter(s => String(s.paymentMethod || '').toLowerCase().includes('mpesa') || String(s.paymentMethod || '').toLowerCase().includes('m-pesa'))
    .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const branchLowStockCount = inventory.filter(
    i => (!targetBranchId || i.branchId === targetBranchId) && Number(i.stockQuantity || 0) <= Number(i.reorderLevel || 0),
  ).length
  const closedShiftsToday = drawerShifts.filter(sh => sh.status === 'Closed').length

  function downloadOwnerDayReportCsv() {
    if (!isOwner) return
    const rows = [
      ['Kenya Motorcycle Spare Parts Ecosystem - Owner Day Report', todayKey],
      ['Company', context.organization_name || 'Workspace'],
      ['Active Branch', activeBranch?.name || targetBranchId || 'All'],
      ['Branch Sales Today (KES)', daySalesTotal.toFixed(2)],
      ['Company Total Sales Today (KES)', dayCompanySalesTotal.toFixed(2)],
      ['Estimated COGS Today (KES)', dayCogs.toFixed(2)],
      ['Gross Profit Today (KES)', dayGrossProfit.toFixed(2)],
      ['Gross Margin (%)', `${dayGrossMarginPct}%`],
      ['Daily Expenses Today (KES)', dayExpensesTotal.toFixed(2)],
      ['Net Cashflow Today (KES)', (daySalesTotal - dayExpensesTotal).toFixed(2)],
      ['Cash Sales (KES)', dayCashSales.toFixed(2)],
      ['M-Pesa Sales (KES)', dayMpesaSales.toFixed(2)],
      ['Completed Orders Today', String(daySalesBranch.length)],
      ['Low Stock SKUs', String(branchLowStockCount)],
      ['Open Radar Requests', String(openRadarItems.length)],
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `owner-day-report-${todayKey}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setDockMsg(`Downloaded Owner Day Report CSV (${todayKey}).`)
  }

  const waDigits = waPhone.replace(/[^\d]/g, '')
  const waDirectUrl = `https://wa.me/${waDigits || '254700000000'}?text=${encodeURIComponent(waMessage || 'Hello from Kenya Motorcycle Spare Parts Ecosystem.')}`

  return (
    <div className="floating-dock no-print">
      {open && (
        <section className="dock-panel" aria-label="Quick Dock">
          <div className="card-head">
            <div>
              <strong>Quick Dock</strong>
              <span className="cell-sub">{context.organization_name} · {t(`role_${role}`)}</span>
            </div>
            <button type="button" className="btn-sm" onClick={() => setOpen(false)}>Close</button>
          </div>

          <div className="actions-inline">
            {canOpenPos && (
              <button type="button" className="btn-sm" onClick={() => { navigate('/app/pos'); setOpen(false) }}>
                Fast POS
              </button>
            )}
            {canOpenRadar && (
              <button type="button" className="btn-sm" onClick={() => { navigate('/app/radar'); setOpen(false) }}>
                Parts Radar ({openRadarItems.length})
              </button>
            )}
            {canOpenAssistant && (
              <button type="button" className="btn-sm" onClick={() => { navigate('/app/assistant'); setOpen(false) }}>
                AI Co-Pilot
              </button>
            )}
          </div>

          <div className="dock-tabs" role="tablist" aria-label="Quick dock tools">
            {dockTabs.map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={effectiveTab === tabId}
                className={`dock-tab${effectiveTab === tabId ? ' active' : ''}`}
                onClick={() => { setDockTab(tabId); setDockMsg('') }}
              >
                {label}
              </button>
            ))}
          </div>

          {effectiveTab === 'spares' && (
            <div className="sub-card">
              <div className="card-head">
                <strong>Check Spares (Client Stock Search)</strong>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => setSparesAllBranches(v => !v)}
                >
                  {sparesAllBranches ? 'All Branches' : 'This Branch'}
                </button>
              </div>
              <input
                type="search"
                value={sparesQuery}
                onChange={e => setSparesQuery(e.target.value)}
                placeholder="Search part name, SKU, bike model, or bin…"
                aria-label="Search spare parts stock for client"
              />
              <div className="dock-list">
                {!matchingSpares.length ? (
                  <p className="muted">No spare parts matched "{sparesQuery}".</p>
                ) : (
                  matchingSpares.map(item => {
                    const available = Math.max(0, Number(item.stockQuantity || 0) - Number(item.reservedQuantity || 0))
                    const itemBranch = branchMap.get(item.branchId)
                    return (
                      <div className="dock-item" key={item.id}>
                        <div className="dock-item-head">
                          <div>
                            <strong>{item.partName}</strong>
                            <small className="muted mono">{item.partNumber} · Bin {item.binLocation || 'Counter'}</small>
                          </div>
                          <strong>{formatMoney(item.sellingPrice)}</strong>
                        </div>
                        <small className="muted">
                          {item.compatibleModels || 'Universal'} · {itemBranch?.area || itemBranch?.name || item.branchId}
                        </small>
                        <div className="dock-item-head">
                          <span className={available <= 0 ? 'status-tag danger' : available <= Number(item.reorderLevel || 0) ? 'status-tag warn' : 'status-tag ok'}>
                            {available > 0 ? `${available} ${item.uom || 'pcs'} available` : 'Out of Stock'}
                          </span>
                          <button type="button" className="btn-sm" onClick={() => handleQuoteOnWhatsApp(item)}>
                            Quote on WhatsApp
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {effectiveTab === 'calc' && (
            <div className="sub-card">
              <strong>KES Margin &amp; eTIMS VAT Calculator</strong>
              <div className="dock-calc-grid">
                <label>
                  Cost (KES)
                  <input type="number" min="0" value={costKes} onChange={e => setCostKes(e.target.value)} />
                </label>
                <label>
                  Ex-VAT Price
                  <input type="number" min="0" value={sellKes} onChange={e => setSellKes(e.target.value)} />
                </label>
              </div>
              <div className="dock-calc-result">
                <span>Profit: <strong>{formatMoney(profit)}</strong> ({marginPct}%)</span>
                <span>16% eTIMS VAT: <strong>{formatMoney(vatAmount)}</strong> · Inc VAT: <strong>{formatMoney(incVat)}</strong></span>
              </div>
            </div>
          )}

          {effectiveTab === 'locator' && (
            <div className="sub-card">
              <strong>Branch, Shelf Bin &amp; Nearby Locator</strong>
              <div className="dock-list">
                {companyBranches.map(b => {
                  const isActive = b.id === targetBranchId
                  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.area || ''} Kenya`)}`
                  return (
                    <div className="dock-item" key={b.id}>
                      <div className="dock-item-head">
                        <div>
                          <strong>{b.name}</strong>
                          <small className="muted">{b.area || 'Kenya'}</small>
                        </div>
                        <span className={isActive ? 'status-tag ok' : 'status-tag muted'}>
                          {isActive ? 'Active' : 'Branch'}
                        </span>
                      </div>
                      <div className="actions-inline">
                        {!isActive && (
                          <button type="button" className="btn-sm" onClick={() => { setBranch(b.id); setDockMsg(`Switched to ${b.name}.`) }}>
                            Switch Here
                          </button>
                        )}
                        <a className="button-link btn-sm" href={mapUrl} target="_blank" rel="noreferrer">
                          Open in Maps ↗
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>

              <label className="mt-xs">
                Find Part Shelf / Bin in {activeBranch?.name || 'Active Branch'}
                <input
                  value={locatorQuery}
                  onChange={e => setLocatorQuery(e.target.value)}
                  placeholder="Type SKU or part to check shelf bin…"
                />
              </label>
              <div className="dock-list">
                {locatorSkus.map(item => (
                  <div className="dock-item" key={item.id}>
                    <div className="dock-item-head">
                      <span><strong>{item.partNumber}</strong> · {item.partName}</span>
                      <span className="status-tag ok mono">{item.binLocation || 'A1-COUNTER'}</span>
                    </div>
                  </div>
                ))}
              </div>

              <form className="mt-xs" onSubmit={handleLocateNearby}>
                <label>
                  Nearby Parts / Garage Finder (Google Maps)
                  <div className="inline-controls mt-xs">
                    <input
                      value={nearbyQuery}
                      onChange={e => setNearbyQuery(e.target.value)}
                      placeholder="Boda garage or wholesaler near…"
                    />
                    <button type="submit" className="btn-sm primary" disabled={nearbyBusy}>
                      {nearbyBusy ? 'Finding…' : 'Locate'}
                    </button>
                  </div>
                </label>
              </form>
              {nearbyError && <small className="form-error">{nearbyError}</small>}
              {nearbyResult && (
                <div className="dock-calc-result">
                  {nearbyResult.text && <p>{nearbyResult.text.slice(0, 260)}</p>}
                  {nearbyResult.places.slice(0, 3).map((pl, idx) => (
                    <a key={`${pl.placeId || idx}`} href={pl.uri} target="_blank" rel="noreferrer">
                      {pl.title} ↗
                    </a>
                  ))}
                </div>
              )}
              <a
                className="text-button"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nearbyQuery || 'motorcycle spare parts Kenya')}`}
                target="_blank"
                rel="noreferrer"
              >
                Search on Google Maps Web ↗
              </a>
            </div>
          )}

          {effectiveTab === 'whatsapp' && (
            <form className="sub-card" onSubmit={handleSendWhatsApp}>
              <strong>WhatsApp Customer Dispatch</strong>
              <label>
                Customer Phone (+254…)
                <input
                  value={waPhone}
                  onChange={e => setWaPhone(e.target.value)}
                  placeholder="+254712345678"
                  required
                />
              </label>
              <label>
                Message / Part Quote
                <textarea
                  rows={4}
                  value={waMessage}
                  onChange={e => setWaMessage(e.target.value)}
                  placeholder="Write a part quote, pickup confirmation, or boda dispatch update…"
                  required
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={waConsent}
                  onChange={e => setWaConsent(e.target.checked)}
                />
                <span>Customer WhatsApp consent confirmed</span>
              </label>
              <div className="actions-inline">
                <button type="submit" className="btn-sm primary" disabled={waBusy}>
                  {waBusy ? 'Sending…' : 'Send via WhatsApp API'}
                </button>
                <a className="button-link btn-sm" href={waDirectUrl} target="_blank" rel="noreferrer">
                  Open wa.me Chat ↗
                </a>
              </div>
            </form>
          )}

          {effectiveTab === 'radar' && (
            <div className="sub-card">
              <div className="card-head">
                <strong>Posted Radar Item Alerts</strong>
                {canOpenRadar && (
                  <button type="button" className="btn-sm primary" onClick={() => { navigate('/app/radar'); setOpen(false) }}>
                    Open Radar
                  </button>
                )}
              </div>

              {radarNotifications.length > 0 && (
                <div className="dock-list">
                  {radarNotifications.slice(0, 4).map(n => (
                    <div className="dock-item" key={n.id}>
                      <div className="dock-item-head">
                        <strong>{n.title}</strong>
                        <span className={n.status === 'Unread' ? 'status-tag warn' : 'status-tag muted'}>
                          {n.status}
                        </span>
                      </div>
                      <small className="muted">{n.body}</small>
                      {n.status === 'Unread' && (
                        <div>
                          <button type="button" className="btn-sm" onClick={() => void markNotificationRead(n.id)}>
                            Mark Seen
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <strong className="mt-xs">Live Open Radar Requests ({openRadarItems.length})</strong>
              <div className="dock-list">
                {!openRadarItems.length ? (
                  <p className="muted">No open Radar requests right now.</p>
                ) : (
                  openRadarItems.slice(0, 6).map(req => (
                    <div className="dock-item" key={req.id}>
                      <div className="dock-item-head">
                        <strong>{req.partDescription}</strong>
                        <span className={req.urgencyStatus === 'Urgent' ? 'status-tag danger' : 'status-tag warn'}>
                          {req.urgencyStatus || 'Normal'}
                        </span>
                      </div>
                      <small className="muted">
                        {req.motorcycleModel || 'Universal'} · {req.locationArea || 'Nairobi'} · {req.status}
                      </small>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {effectiveTab === 'expense' && (
            <>
              {canRecordExpense && (
                <form className="sub-card" onSubmit={handleQuickExpense}>
                  <strong>Quick Petty Cash Expense</strong>
                  <div className="dock-calc-grid">
                    <label>
                      Category
                      <input value={expCat} onChange={e => setExpCat(e.target.value)} required />
                    </label>
                    <label>
                      Amount (KES)
                      <input type="number" min="1" value={expAmt} onChange={e => setExpAmt(e.target.value)} placeholder="350" required />
                    </label>
                  </div>
                  <button type="submit" className="primary btn-sm">Save Expense &amp; Post JE</button>
                </form>
              )}

              <div className="sub-card">
                <strong>Sync &amp; Conflict Queue</strong>
                <p className="muted">{outbox.length} queued · {outboxConflicts.length} conflict(s)</p>
                {outbox.length > 0 && !offlineMode && (
                  <button type="button" className="btn-sm primary" onClick={() => void syncOutbox()}>
                    Sync {outbox.length} Now
                  </button>
                )}
                {outboxConflicts.slice(0, 2).map(conf => (
                  <div key={conf.idempotencyKey} className="mt-xs">
                    <small className="form-error">{conf.conflictReasons?.[0] || 'Outbox sync conflict'}</small>
                    <div className="actions-inline mt-xs">
                      <button type="button" className="btn-sm primary" onClick={() => void resolveOutboxConflict(conf.idempotencyKey, 'accept_current')}>
                        Re-price &amp; Sync
                      </button>
                      <button type="button" className="btn-sm" onClick={() => void resolveOutboxConflict(conf.idempotencyKey, 'discard')}>
                        Discard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {isOwner && effectiveTab === 'report' && (
            <div className="sub-card">
              <div className="card-head">
                <div>
                  <strong>Owner Day Report ({todayKey} EAT)</strong>
                  <span className="cell-sub">Owner-only executive snapshot · Hidden from staff</span>
                </div>
                <span className="status-tag ok">OWNER</span>
              </div>

              <div className="dock-kpi-grid">
                <div className="dock-kpi">
                  <span>Branch Sales Today</span>
                  <strong>{formatMoney(daySalesTotal)}</strong>
                  <small className="muted">{daySalesBranch.length} order(s)</small>
                </div>
                <div className="dock-kpi">
                  <span>Company Total Sales</span>
                  <strong>{formatMoney(dayCompanySalesTotal)}</strong>
                  <small className="muted">{daySalesAll.length} company order(s)</small>
                </div>
                <div className="dock-kpi">
                  <span>Gross Profit ({dayGrossMarginPct}%)</span>
                  <strong>{formatMoney(dayGrossProfit)}</strong>
                  <small className="muted">COGS {formatMoney(dayCogs)}</small>
                </div>
                <div className="dock-kpi">
                  <span>Expenses / Net Cash</span>
                  <strong>{formatMoney(dayExpensesTotal)}</strong>
                  <small className="muted">Net {formatMoney(daySalesTotal - dayExpensesTotal)}</small>
                </div>
              </div>

              <div className="dock-calc-result">
                <span>Cash Sales: <strong>{formatMoney(dayCashSales)}</strong> · M-Pesa: <strong>{formatMoney(dayMpesaSales)}</strong></span>
                <span>Low Stock SKUs: <strong>{branchLowStockCount}</strong> · Open Radar: <strong>{openRadarItems.length}</strong> · Closed Shifts: <strong>{closedShiftsToday}</strong></span>
              </div>

              <div className="actions-inline">
                <button type="button" className="btn-sm primary" onClick={downloadOwnerDayReportCsv}>
                  Download Day CSV
                </button>
                <button type="button" className="btn-sm" onClick={() => { navigate('/app/finance'); setOpen(false) }}>
                  Open Finance &amp; EOD
                </button>
              </div>
            </div>
          )}

          {dockMsg && <p className="notice" role="status">{dockMsg}</p>}
        </section>
      )}
      <button
        type="button"
        className="dock-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {open
          ? 'Hide Dock'
          : `Quick Dock${radarBadgeCount ? ` · ${radarBadgeCount} Radar` : ''}${outboxConflicts.length ? ` · ${outboxConflicts.length}!` : ''}`}
      </button>
    </div>
  )
}

export default function Shell() {
  const { session, signOut, resendVerification, refreshVerification } = useAuth()
  const { data: { context, memberships = [] }, revision, notice } = useTenant()
  const {
    branches,
    activeBranchId,
    notifications = [],
    markNotificationRead,
    markAllNotificationsRead,
    trainingMode,
    setTrainingMode,
  } = useWorkspace()
  const [inboxOpen, setInboxOpen] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState('')
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [lang, setLang] = useState(() => getLanguage())
  const location = useLocation()
  const visibleSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => canAccessNavItem(context.role, item.id)),
  })).filter(section => section.items.length > 0)
  const visibleItems = visibleSections.flatMap(s => s.items)
  const activeItem = visibleItems.find(item => isNavItemActive(item, location.pathname, location.search))
  const current = location.pathname.split('/').pop()
  const mobileItems = visibleItems.filter(item => item.isDefaultTab || !item.tab)
  const routeAllowed = canAccessRoute(context.role, location.pathname, location.search)
  const targetBranchId = context.branch_id || activeBranchId
  const membershipMatch = memberships.find(
    m => m.organization_id === context.organization_id && (!targetBranchId || m.branch_id === targetBranchId),
  )
  const activeBranch =
    branches.find(b => b.id === targetBranchId) ||
    (membershipMatch
      ? { id: membershipMatch.branch_id, name: membershipMatch.branch_name || 'Main Shop', area: membershipMatch.area || 'Kenya' }
      : branches[0])
  const unreadCount = notifications.filter(n => n.status === 'Unread').length
  const needsEmailVerification = session?.provider === 'firebase' && session?.user?.emailVerified === false

  function switchLanguage(nextLang) {
    setLanguage(nextLang)
    setLang(nextLang)
  }

  async function handleResend() {
    setVerifyBusy(true)
    setVerifyMsg('')
    try {
      await resendVerification()
      setVerifyMsg(`Verification email sent to ${session.user.email}. Check your inbox and spam folder.`)
    } catch (err) {
      setVerifyMsg(err?.message || 'Could not send verification email right now.')
    } finally {
      setVerifyBusy(false)
    }
  }

  async function handleRefresh() {
    setVerifyBusy(true)
    setVerifyMsg('')
    try {
      const ok = await refreshVerification()
      setVerifyMsg(ok ? 'Email verified! Cloud Firestore sync is now active.' : 'Email is not verified yet. Open the verification link in your inbox first.')
    } catch (err) {
      setVerifyMsg(err?.message || 'Could not refresh verification status.')
    } finally {
      setVerifyBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label={t('navigation')}>
          {visibleSections.map(section => (
            <div className="nav-group" key={section.groupKey}>
              <div className="nav-group-label">{t(section.groupKey)}</div>
              {section.items.map(item => {
                const active = isNavItemActive(item, location.pathname, location.search)
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={`nav-item${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <NavIcon name={item.icon} />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>
            <strong>{session.user.displayName || 'Workspace User'}</strong>
            <span>{t(`role_${context.role}`)} · {activeBranch?.area || 'Kenya'}</span>
            <div className="lang-toggle mt-sm" role="group" aria-label="Language toggle">
              <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => switchLanguage('en')}>EN</button>
              <button type="button" className={lang === 'sw' ? 'active' : ''} onClick={() => switchLanguage('sw')}>SW</button>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="topbar-left">
            <div className="breadcrumb-trail" aria-label="Breadcrumb">
              <span>{context.organization_name}</span>
              <span aria-hidden="true">/</span>
              <span>{activeBranch?.name || 'Active Shop'}</span>
            </div>
            <h1 tabIndex={-1}>{activeItem ? t(activeItem.labelKey) : t(current)}</h1>
          </div>
          <div className="topbar-right">
            <PWAInstallButton />
            <BranchSwitcher compact />
            <div className="account">
              <SyncIndicator />
              <div className="notif-wrap">
                <button
                  type="button"
                  className="btn-sm"
                  aria-expanded={inboxOpen}
                  aria-label="Open workspace notifications"
                  onClick={() => setInboxOpen(v => !v)}
                >
                  Alerts ({unreadCount})
                </button>
              </div>
              <span aria-hidden="true" className="meta-sep">·</span>
              <span className="account-email">{session.user.email}</span>
              <button type="button" className="btn-quiet" onClick={() => void signOut()}>
                {t('signOut')}
              </button>
            </div>
          </div>
        </header>

        {trainingMode && (
          <section className="sandbox-banner" role="status">
            <div>
              <strong>Training / Sandbox Mode Active (ADM-005)</strong> — Counter sales stay local and do not queue live eTIMS VAT or Firestore production writes.
            </div>
            <button type="button" className="btn-sm" onClick={() => setTrainingMode(false)}>
              Exit Sandbox
            </button>
          </section>
        )}

        {needsEmailVerification && (
          <section className="verify-banner" role="status">
            <div>
              <strong>Verify your email ({session.user.email})</strong>
              <p className="muted">
                {verifyMsg || 'You are working in local workspace mode. Verify your email address to enable live Cloud Firestore sync.'}
              </p>
            </div>
            <div className="inline-controls">
              <button type="button" className="btn-sm" onClick={() => void handleResend()} disabled={verifyBusy}>
                Resend verification email
              </button>
              <button type="button" className="btn-sm primary" onClick={() => void handleRefresh()} disabled={verifyBusy}>
                I verified — Refresh
              </button>
            </div>
          </section>
        )}

        {inboxOpen && (
          <section className="notif-popover" aria-label="Notification Center">
            <div className="card-head">
              <strong>Notification Center</strong>
              <div className="inline-controls">
                {unreadCount > 0 && (
                  <button type="button" className="btn-sm" onClick={() => void markAllNotificationsRead()}>
                    Mark all read
                  </button>
                )}
                <button type="button" className="btn-sm" onClick={() => setInboxOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            {!notifications.length ? (
              <p className="muted">No alerts recorded yet.</p>
            ) : (
              notifications.slice(0, 12).map(n => (
                <article className="notif-item" key={n.id}>
                  <div className="notif-item-head">
                    <strong>{n.title}</strong>
                    <span
                      className={
                        n.status === 'Unread'
                          ? 'status-tag warn'
                          : n.status === 'Suppressed'
                            ? 'status-tag danger'
                            : 'status-tag muted'
                      }
                    >
                      {n.channel} · {n.status}
                    </span>
                  </div>
                  <p className="muted">{n.body}</p>
                  {n.status === 'Unread' && (
                    <div>
                      <button type="button" className="btn-sm" onClick={() => void markNotificationRead(n.id)}>
                        Mark read
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
        )}

        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="workspace-content" key={`${revision}-${lang}`}>
          {routeAllowed ? <Outlet /> : <ErrorState error={{ status: 403 }} />}
        </div>
      </main>
      <FloatingUtilityDock />
      <nav className="mobile-nav" aria-label={t('navigation')}>
        {mobileItems.map(item => (
          <NavLink to={item.basePath} key={item.id}>
            <NavIcon name={item.icon} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
