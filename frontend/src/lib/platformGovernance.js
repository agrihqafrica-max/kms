export const DEFAULT_FEATURE_FLAGS = {
  etimsVscu: true,
  offlineOutbox: true,
  packBreaking: true,
  partsRadar: true,
  blindStock: true,
  aiCopilot: true,
}

export const ROLE_APPROVAL_LIMITS = {
  cashier: { maxDiscountPct: 5, maxDirectRefundKes: 500, maxPayoutApproveKes: 0 },
  manager: { maxDiscountPct: 15, maxDirectRefundKes: 5000, maxPayoutApproveKes: 25000 },
  accountant: { maxDiscountPct: 10, maxDirectRefundKes: 5000, maxPayoutApproveKes: 50000 },
  owner: { maxDiscountPct: 100, maxDirectRefundKes: Infinity, maxPayoutApproveKes: Infinity },
}

export function evaluateDiscountApproval(role = 'owner', subtotal = 0, discountAmount = 0) {
  const safeSubtotal = Math.max(0, Number(subtotal || 0))
  const safeDiscount = Math.max(0, Number(discountAmount || 0))
  const limits = ROLE_APPROVAL_LIMITS[role] || ROLE_APPROVAL_LIMITS.cashier
  const discountPct = safeSubtotal > 0 ? Math.round((safeDiscount / safeSubtotal) * 1000) / 10 : 0
  const requiresManagerApproval = safeDiscount > 0 && discountPct > limits.maxDiscountPct
  return {
    role,
    discountPct,
    maxAllowedPct: limits.maxDiscountPct,
    requiresManagerApproval,
    allowed: !requiresManagerApproval,
  }
}

export const NOTIFICATION_TEMPLATES = {
  LOW_STOCK_ALERT: ({ partNumber, partName, stockQuantity, reorderLevel }) => ({
    title: `Low stock: ${partNumber}`,
    body: `${partName} dropped to ${stockQuantity} units (reorder threshold ${reorderLevel}). Draft a PO in Inventory -> Reorder.`,
  }),
  SALE_RECEIPT: ({ saleId, totalAmount, customerName }) => ({
    title: `Receipt ${saleId}`,
    body: `Thank you ${customerName || 'Customer'}. Confirmed KES ${Number(totalAmount || 0).toLocaleString()} at KenyaMoto Supply Hub.`,
  }),
  RETURN_APPROVED: ({ partNumber, refundAmount, refundMethod }) => ({
    title: `Return approved: ${partNumber}`,
    body: `Refund of KES ${Number(refundAmount || 0).toLocaleString()} approved via ${refundMethod} and stock restored to branch ledger.`,
  }),
  MARKETING_PROMO: ({ partName, discountLabel }) => ({
    title: `Special spares offer: ${partName}`,
    body: `Enjoy ${discountLabel || '15%'} off ${partName} at Kirinyaga Road & Industrial Area branches. Reply STOP to opt out.`,
  }),
}

export function renderNotificationTemplate(templateKey, vars = {}) {
  const fn = NOTIFICATION_TEMPLATES[templateKey]
  if (!fn) {
    return {
      title: String(vars.title || templateKey).slice(0, 160),
      body: String(vars.body || 'Workspace event recorded.').slice(0, 600),
    }
  }
  const rendered = fn(vars)
  return {
    title: String(rendered.title).slice(0, 160),
    body: String(rendered.body).slice(0, 600),
  }
}

export function evaluateNotificationDelivery({
  channel = 'in_app',
  category = 'operational',
  customer = null,
  prefs = { inAppEnabled: true, whatsAppEnabled: true, smsEnabled: true, quietHoursEnabled: true },
  nairobiHour = null,
}) {
  if (channel === 'in_app') {
    return {
      status: prefs?.inAppEnabled === false ? 'Suppressed' : 'Unread',
      reason: prefs?.inAppEnabled === false ? 'In-app channel disabled in preferences' : 'Delivered to header inbox',
    }
  }

  if (channel === 'whatsapp' && prefs?.whatsAppEnabled === false) {
    return { status: 'Suppressed', reason: 'WhatsApp channel disabled in workspace settings' }
  }
  if (channel === 'sms' && prefs?.smsEnabled === false) {
    return { status: 'Suppressed', reason: 'SMS channel disabled in workspace settings' }
  }

  if (customer) {
    if (channel === 'whatsapp' && customer.consentWhatsApp === false) {
      return { status: 'Suppressed', reason: 'Customer opted out of WhatsApp messages (consentWhatsApp=false)' }
    }
    if (channel === 'sms' && customer.consentSms === false) {
      return { status: 'Suppressed', reason: 'Customer opted out of SMS messages (consentSms=false)' }
    }
    if (category === 'marketing' && customer.consentMarketing === false) {
      return { status: 'Suppressed', reason: 'Customer opted out of marketing promotions (consentMarketing=false)' }
    }
  }

  const hour =
    typeof nairobiHour === 'number'
      ? nairobiHour
      : Number(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Africa/Nairobi',
            hour: '2-digit',
            hour12: false,
          }).format(new Date()),
        )
  if (prefs?.quietHoursEnabled && (hour >= 21 || hour < 7) && category !== 'urgent_security') {
    return { status: 'Queued', reason: `Deferred during Kenya quiet hours (${hour}:00 EAT)` }
  }

  return { status: 'Queued', reason: `Queued for external ${channel} gateway dispatch (sandbox/provider pending)` }
}

export function computeShiftReconciliation({
  openingFloat = 0,
  cashSales = 0,
  cashRefunds = 0,
  cashExpenses = 0,
  countedCash = 0,
}) {
  const floatKes = Math.max(0, Number(openingFloat || 0))
  const salesKes = Math.max(0, Number(cashSales || 0))
  const refundsKes = Math.max(0, Number(cashRefunds || 0))
  const expensesKes = Math.max(0, Number(cashExpenses || 0))
  const expectedCash = Math.round((floatKes + salesKes - refundsKes - expensesKes) * 100) / 100
  const counted = Math.max(0, Number(countedCash || 0))
  const variance = Math.round((counted - expectedCash) * 100) / 100
  return {
    openingFloat: floatKes,
    cashSales: salesKes,
    cashRefunds: refundsKes,
    cashExpenses: expensesKes,
    expectedCash,
    countedCash: counted,
    variance,
    isShort: variance < 0,
  }
}

export function parseCatalogueCsvAndDetectDuplicates(csvText, existingItems = []) {
  const existingSkus = new Set(
    (Array.isArray(existingItems) ? existingItems : [])
      .map(i => String(i?.partNumber || '').trim().toLowerCase())
      .filter(Boolean),
  )
  const existingBarcodes = new Set(
    (Array.isArray(existingItems) ? existingItems : [])
      .map(i => String(i?.barcode || '').trim().toLowerCase())
      .filter(Boolean),
  )

  const rawLines = String(csvText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)

  if (!rawLines.length) {
    return { validRows: [], duplicates: [], errors: ['CSV input is empty.'] }
  }

  const firstLower = rawLines[0].toLowerCase()
  const hasHeader = firstLower.includes('partname') || firstLower.includes('part_name') || firstLower.includes('partnumber')
  const dataLines = hasHeader ? rawLines.slice(1) : rawLines

  const seenFileSkus = new Set()
  const validRows = []
  const duplicates = []
  const errors = []

  dataLines.forEach((line, idx) => {
    const rowNum = idx + (hasHeader ? 2 : 1)
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const [partNumber, partName, category, brand, barcode, unitCostRaw, retailPriceRaw, stockQtyRaw, reorderRaw, compatibleModels] = cols
    if (!partNumber || !partName) {
      errors.push(`Row ${rowNum}: partNumber and partName are required.`)
      return
    }
    const unitCost = Number(unitCostRaw)
    const retailPrice = Number(retailPriceRaw)
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(retailPrice) || retailPrice <= 0) {
      errors.push(`Row ${rowNum} (${partNumber}): invalid unitCost or retailPrice.`)
      return
    }
    const skuKey = partNumber.toLowerCase()
    const barcodeKey = String(barcode || '').trim().toLowerCase()
    if (existingSkus.has(skuKey) || seenFileSkus.has(skuKey)) {
      duplicates.push({ rowNum, partNumber, partName, reason: 'Duplicate partNumber' })
      return
    }
    if (barcodeKey && existingBarcodes.has(barcodeKey)) {
      duplicates.push({ rowNum, partNumber, partName, reason: `Duplicate barcode ${barcode}` })
      return
    }
    seenFileSkus.add(skuKey)
    validRows.push({
      partNumber: partNumber.slice(0, 100),
      partName: partName.slice(0, 255),
      category: (category || 'General').slice(0, 100),
      brand: (brand || 'Standard').slice(0, 100),
      barcode: (barcode || '').slice(0, 100),
      unitCost,
      retailPrice,
      stockQuantity: Math.max(0, Math.trunc(Number(stockQtyRaw || 0))),
      reorderLevel: Math.max(0, Math.trunc(Number(reorderRaw || 5))),
      compatibleModels: (compatibleModels || '').slice(0, 500),
    })
  })

  return { validRows, duplicates, errors }
}

export function buildPackBreakMovements({ parentItem, packsToBreak = 1 }) {
  if (!parentItem) throw new Error('Source SKU is required to break pack.')
  const packs = Math.trunc(Number(packsToBreak || 0))
  const packSize = Math.max(1, Math.trunc(Number(parentItem.packSize || 1)))
  if (packSize <= 1) {
    throw new Error(`${parentItem.partNumber} has packSize=1 and cannot be broken down further.`)
  }
  if (packs < 1) {
    throw new Error('Must break at least 1 pack.')
  }
  const reserved = Math.max(0, Math.trunc(Number(parentItem.reservedQuantity || 0)))
  const available = Math.max(0, Math.trunc(Number(parentItem.stockQuantity || 0)) - reserved)
  if (packs > available) {
    throw new Error(`Insufficient unreserved packs (${available} available, requested ${packs}).`)
  }
  const looseUnitsCreated = packs * packSize
  const unitCostPerPiece = Math.round((Number(parentItem.unitCost || 0) / packSize) * 100) / 100
  const retailPricePerPiece = Math.max(1, Math.round(Number(parentItem.retailPrice || 0) / packSize))
  return {
    packsBroken: packs,
    looseUnitsCreated,
    nextParentStock: Math.trunc(Number(parentItem.stockQuantity)) - packs,
    unitCostPerPiece,
    retailPricePerPiece,
    loosePartNumber: `${parentItem.partNumber}-UNIT`,
    loosePartName: `${parentItem.partName} (Loose Piece)`,
  }
}
