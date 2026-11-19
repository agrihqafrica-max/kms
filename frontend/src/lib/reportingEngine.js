import { classifyAbcInventory, computeAvailableStock } from './kmsDomain.js'

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function rowTimestampMs(row) {
  const raw = row?.createdAt
  if (!raw) return null
  if (typeof raw?.toDate === 'function') return raw.toDate().getTime()
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function filterRowsByPeriod(rows = [], branchId = null, startDate = '', endDate = '') {
  const startMs = startDate ? Date.parse(`${startDate}T00:00:00+03:00`) : null
  const endMs = endDate ? Date.parse(`${endDate}T23:59:59+03:00`) : null
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (branchId && row?.branchId && row.branchId !== branchId) return false
    if (startMs || endMs) {
      const ts = rowTimestampMs(row)
      if (ts !== null) {
        if (startMs && ts < startMs) return false
        if (endMs && ts > endMs) return false
      }
    }
    return true
  })
}

export function buildDailyBusinessSummary({
  sales = [],
  expenses = [],
  salesReturns = [],
  etimsInvoices = [],
  journalEntries = [],
  branchId = null,
  startDate = '',
  endDate = '',
}) {
  const bSales = filterRowsByPeriod(sales, branchId, startDate, endDate)
  const bExpenses = filterRowsByPeriod(expenses, branchId, startDate, endDate)
  const bReturns = filterRowsByPeriod(salesReturns, branchId, startDate, endDate).filter(r => r.status === 'Approved')
  const bJournals = filterRowsByPeriod(journalEntries, branchId, startDate, endDate)

  const grossSales = round2(bSales.reduce((s, row) => s + Number(row.totalAmount || 0), 0))
  const totalDiscounts = round2(bSales.reduce((s, row) => s + Number(row.discountAmount || 0), 0))
  const totalVat = round2(bSales.reduce((s, row) => s + Number(row.vatAmount || 0), 0))
  const totalRefunds = round2(bReturns.reduce((s, row) => s + Number(row.refundAmount || 0), 0))
  const netSales = round2(grossSales - totalRefunds)
  const totalExpenses = round2(bExpenses.reduce((s, row) => s + Number(row.amount || 0), 0))
  const netOperatingCashFlow = round2(netSales - totalExpenses)

  const etimsAccepted = etimsInvoices.filter(i => i.status === 'Accepted').length
  const etimsPending = etimsInvoices.filter(i => i.status !== 'Accepted').length

  return {
    transactionCount: bSales.length,
    grossSales,
    totalDiscounts,
    totalVat,
    totalRefunds,
    netSales,
    totalExpenses,
    netOperatingCashFlow,
    journalEntryCount: bJournals.length,
    etimsAccepted,
    etimsPending,
  }
}

export function buildSalesReport({ sales = [], salesReturns = [], branchId = null, startDate = '', endDate = '', paymentMethod = 'all' }) {
  let bSales = filterRowsByPeriod(sales, branchId, startDate, endDate)
  if (paymentMethod && paymentMethod !== 'all') {
    bSales = bSales.filter(s => s.paymentMethod === paymentMethod)
  }
  const bReturns = filterRowsByPeriod(salesReturns, branchId, startDate, endDate).filter(r => r.status === 'Approved')

  const byMethod = {}
  for (const s of bSales) {
    const splitList = Array.isArray(s.payments) && s.payments.length ? s.payments : [{ method: s.paymentMethod || 'cash', amount: s.totalAmount }]
    for (const part of splitList) {
      const method = part.method || 'cash'
      if (!byMethod[method]) byMethod[method] = { method, count: 0, total: 0 }
      byMethod[method].count += 1
      byMethod[method].total = round2(byMethod[method].total + Number(part.amount || 0))
    }
  }

  return {
    rows: bSales,
    returns: bReturns,
    byPaymentMethod: Object.values(byMethod),
    grossTotal: round2(bSales.reduce((acc, s) => acc + Number(s.totalAmount || 0), 0)),
    returnsTotal: round2(bReturns.reduce((acc, r) => acc + Number(r.refundAmount || 0), 0)),
  }
}

export function buildProfitCogsReport({ sales = [], expenses = [], stockMovements = [], inventory = [], branchId = null, startDate = '', endDate = '' }) {
  const bSales = filterRowsByPeriod(sales, branchId, startDate, endDate)
  const bExpenses = filterRowsByPeriod(expenses, branchId, startDate, endDate)
  const bMovements = filterRowsByPeriod(stockMovements, branchId, startDate, endDate)

  const costByItemId = new Map(inventory.map(i => [i.id, Number(i.unitCost || 0)]))
  const cogs = round2(
    bMovements
      .filter(m => m.movementType === 'sale')
      .reduce((sum, m) => {
        const unitsSold = Math.abs(Number(m.quantityDelta || 0))
        const unitCost = Number(m.unitCostSnapshot ?? costByItemId.get(m.itemId) ?? 0)
        return sum + unitsSold * unitCost
      }, 0),
  )

  const netRevenueExVat = round2(
    bSales.reduce((sum, s) => sum + (Number(s.totalAmount || 0) - Number(s.vatAmount || 0)), 0),
  )
  const grossProfit = round2(netRevenueExVat - cogs)
  const operatingExpenses = round2(bExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0))
  const netProfit = round2(grossProfit - operatingExpenses)
  const grossMarginPct = netRevenueExVat > 0 ? Math.round((grossProfit / netRevenueExVat) * 1000) / 10 : 0

  return {
    netRevenueExVat,
    cogs,
    grossProfit,
    grossMarginPct,
    operatingExpenses,
    netProfit,
  }
}

export function buildCashReconciliationReport({ drawerShifts = [], branchId = null, startDate = '', endDate = '' }) {
  const bShifts = filterRowsByPeriod(drawerShifts, branchId, startDate, endDate)
  const totalVariance = round2(bShifts.reduce((sum, sh) => sum + Number(sh.variance || 0), 0))
  return {
    shifts: bShifts,
    openCount: bShifts.filter(s => s.status === 'Open').length,
    closedCount: bShifts.filter(s => s.status !== 'Open').length,
    totalVariance,
  }
}

export function buildStockReport({ inventory = [], stockMovements = [], branchId = null }) {
  const bItems = branchId ? inventory.filter(i => i.branchId === branchId) : inventory
  const abcMap = classifyAbcInventory(bItems, stockMovements)
  return bItems.map(item => {
    const view = computeAvailableStock(item)
    const abc = abcMap[item.id] || { abcTier: 'C', soldUnits: 0 }
    return {
      id: item.id,
      partNumber: item.partNumber,
      partName: item.partName,
      binLocation: item.binLocation || 'UNASSIGNED',
      abcTier: abc.abcTier,
      soldUnits: abc.soldUnits,
      onHand: view.onHand,
      reserved: view.reserved,
      available: view.available,
      costValue: round2(view.onHand * Number(item.unitCost || 0)),
      retailValue: round2(view.onHand * Number(item.retailPrice || 0)),
    }
  })
}

export function buildPurchaseReport({ purchaseOrders = [], suppliers = [], branchId = null }) {
  const bPOs = branchId ? purchaseOrders.filter(p => p.branchId === branchId) : purchaseOrders
  const totalBaseCost = round2(bPOs.reduce((s, p) => s + Number(p.totalCost || 0), 0))
  const totalLandedCost = round2(bPOs.reduce((s, p) => s + Number(p.landedCost || 0), 0))
  const freightOverheadPct =
    totalBaseCost > 0 ? Math.round(((totalLandedCost - totalBaseCost) / totalBaseCost) * 1000) / 10 : 0

  return {
    orderCount: bPOs.length,
    receivedCount: bPOs.filter(p => p.status === 'Received').length,
    totalBaseCost,
    totalLandedCost,
    freightOverheadPct,
    activeSuppliers: suppliers.length,
  }
}

export function buildPlatformHealthReport({ outbox = [], etimsInvoices = [], notifications = [], journalEntries = [], auditLogs = [] }) {
  const balancedCount = journalEntries.filter(
    j => Math.abs(Number(j.totalDebit || 0) - Number(j.totalCredit || 0)) <= 0.005,
  ).length
  return {
    offlineOutboxPending: outbox.length,
    etimsFailedOrQueued: etimsInvoices.filter(i => i.status !== 'Accepted').length,
    suppressedNotifications: notifications.filter(n => n.status === 'Suppressed').length,
    unreadNotifications: notifications.filter(n => n.status === 'Unread').length,
    balancedJournalRatio: journalEntries.length > 0 ? `${balancedCount}/${journalEntries.length}` : '0/0',
    auditEventCount: auditLogs.length,
  }
}

function csvCell(val) {
  const s = String(val ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportReportToCsv(columns = [], rows = []) {
  const headerLine = columns.map(csvCell).join(',')
  const dataLines = rows.map(row => row.map(csvCell).join(','))
  return [headerLine, ...dataLines].join('\n')
}
