export const DEFAULT_FEATURE_FLAGS = {
  etimsVscu: true,
  offlineOutbox: true,
  packBreaking: true,
  partsRadar: true,
  blindStock: true,
  aiCopilot: true,
}

export const PLAN_ENTITLEMENTS = {
  Starter: {
    tier: 'Starter',
    maxBranches: 1,
    maxDevices: 2,
    modules: ['pos', 'inventory', 'offlineOutbox'],
  },
  Growth: {
    tier: 'Growth',
    maxBranches: 5,
    maxDevices: 12,
    modules: ['pos', 'inventory', 'offlineOutbox', 'etimsVscu', 'packBreaking', 'partsRadar'],
  },
  Enterprise: {
    tier: 'Enterprise',
    maxBranches: 50,
    maxDevices: 100,
    modules: ['pos', 'inventory', 'offlineOutbox', 'etimsVscu', 'packBreaking', 'partsRadar', 'blindStock', 'aiCopilot'],
  },
}

export function isModuleEntitled(planTier = 'Growth', moduleKey = 'pos') {
  const plan = PLAN_ENTITLEMENTS[planTier] || PLAN_ENTITLEMENTS.Growth
  return plan.modules.includes(moduleKey)
}

export const ROLE_APPROVAL_LIMITS = {
  cashier: { maxDiscountPct: 5, maxDirectRefundKes: 500, maxPayoutApproveKes: 0 },
  manager: { maxDiscountPct: 15, maxDirectRefundKes: 5000, maxPayoutApproveKes: 25000 },
  accountant: { maxDiscountPct: 10, maxDirectRefundKes: 5000, maxPayoutApproveKes: 50000 },
  storekeeper: { maxDiscountPct: 0, maxDirectRefundKes: 0, maxPayoutApproveKes: 0 },
  owner: { maxDiscountPct: 100, maxDirectRefundKes: Infinity, maxPayoutApproveKes: Infinity },
}

export function resolveEffectivePermissions(staffMember = null, roleOverride = null) {
  const role = staffMember?.role || roleOverride || 'owner'
  const baseLimits = ROLE_APPROVAL_LIMITS[role] || ROLE_APPROVAL_LIMITS.cashier
  const abac = staffMember?.abacOverrides || {}
  const maxDiscountPct =
    typeof abac.maxDiscountPct === 'number' && Number.isFinite(abac.maxDiscountPct)
      ? Math.min(100, Math.max(0, abac.maxDiscountPct))
      : baseLimits.maxDiscountPct
  return {
    role,
    canViewCost: typeof abac.canViewCost === 'boolean' ? abac.canViewCost : ['owner', 'manager', 'accountant'].includes(role),
    canApproveDiscounts: typeof abac.canApproveDiscounts === 'boolean' ? abac.canApproveDiscounts : ['owner', 'manager'].includes(role),
    canApproveCounts: typeof abac.canApproveCounts === 'boolean' ? abac.canApproveCounts : ['owner', 'manager'].includes(role),
    maxDiscountPct,
    allowedBranches: Array.isArray(abac.allowedBranches) && abac.allowedBranches.length ? abac.allowedBranches : ['*'],
  }
}

export function evaluateDiscountApproval(role = 'owner', subtotal = 0, discountAmount = 0, policyOverrides = {}) {
  const safeSubtotal = Math.max(0, Number(subtotal || 0))
  const safeDiscount = Math.max(0, Number(discountAmount || 0))
  const baseLimits = ROLE_APPROVAL_LIMITS[role] || ROLE_APPROVAL_LIMITS.cashier
  const configuredCap = policyOverrides?.roleDiscountCaps?.[role]
  const staffCap = policyOverrides?.abacMaxDiscountPct
  const maxAllowedPct =
    typeof staffCap === 'number' && Number.isFinite(staffCap)
      ? Math.min(100, Math.max(0, staffCap))
      : typeof configuredCap === 'number' && Number.isFinite(configuredCap)
        ? Math.min(100, Math.max(0, configuredCap))
        : baseLimits.maxDiscountPct
  const discountPct = safeSubtotal > 0 ? Math.round((safeDiscount / safeSubtotal) * 1000) / 10 : 0
  const requiresManagerApproval = safeDiscount > 0 && discountPct > maxAllowedPct
  return {
    role,
    discountPct,
    maxAllowedPct,
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
    body: `Thank you ${customerName || 'Customer'}. Confirmed KES ${Number(totalAmount || 0).toLocaleString()} at Kenya Motorcycle Spare Parts General.`,
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

export const DEFAULT_TENANT_SETTINGS = {
  businessName: 'Kenya Motor',
  phone: '+254 712 340 500',
  locationArea: 'Kirinyaga Road, Nairobi CBD',
  category: 'RETAIL',
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  language: 'en',
  fiscalYearStart: '07-01',
  receiptPrefix: 'KMSP',
  operatingHours: 'Mon-Sat 08:00-18:30 EAT',
  cashVarianceToleranceKes: 0,
  offlineSaleCapKes: 50000,
  poApprovalThresholdKes: 20000,
  roleDiscountCaps: { cashier: 5, manager: 15, accountant: 10, owner: 100 },
  managerOverridePinHash: null,
  planTier: 'Growth',
  releaseCohort: 'pilot',
  rpoMinutes: 15,
  rtoMinutes: 60,
  lastBackupDrillAt: null,
  lastBackupDrillStatus: 'Pending',
  tenantStatus: 'Active',
}

export function redactFinancialsForPlatformAdmin(record = {}, viewerMode = 'tenant_operator') {
  if (viewerMode !== 'platform_admin' || !record || typeof record !== 'object') return record
  const redacted = { ...record }
  const sensitiveKeys = [
    'unitCost',
    'totalCost',
    'landedCost',
    'totalAmount',
    'subtotal',
    'vatAmount',
    'netProfit',
    'grossProfit',
    'grossMarginPct',
    'netRevenueExVat',
    'cogs',
    'operatingExpenses',
    'amount',
    'expectedCash',
    'countedCash',
    'openingFloat',
    'totalDebit',
    'totalCredit',
    'netSales',
  ]
  for (const key of sensitiveKeys) {
    if (key in redacted) {
      redacted[key] = '[REDACTED]'
    }
  }
  return redacted
}

export function validateReturnActorSeparation({ requestedBy, approverName, role = 'owner' }) {
  const reqActor = String(requestedBy || '').trim().toLowerCase()
  const appActor = String(approverName || '').trim().toLowerCase()
  if (reqActor && appActor && reqActor === appActor && role !== 'owner') {
    return {
      allowed: false,
      reason: 'Separation of duties (BR-002): the staff member who staged this return cannot self-approve it.',
    }
  }
  return { allowed: true, reason: null }
}

export function evaluateOpsAlertRules({
  outbox = [],
  outboxConflicts = [],
  etimsInvoices = [],
  serverMetrics = null,
}) {
  const alerts = []
  if (outbox.length >= 5) {
    alerts.push({
      id: 'alert-outbox-lag',
      severity: 'warn',
      rule: 'Offline outbox backlog >= 5',
      detail: `${outbox.length} queued offline sales awaiting sync.`,
    })
  }
  if (outboxConflicts.length > 0) {
    alerts.push({
      id: 'alert-dlq-conflicts',
      severity: 'danger',
      rule: 'Dead-letter / conflict queue > 0',
      detail: `${outboxConflicts.length} conflicted sync item(s) require manual resolution.`,
    })
  }
  const failedEtims = etimsInvoices.filter(i => i.status === 'Failed').length
  if (failedEtims > 0) {
    alerts.push({
      id: 'alert-etims-fail',
      severity: 'danger',
      rule: 'Failed eTIMS submissions > 0',
      detail: `${failedEtims} eTIMS invoice(s) failed submission and need retry.`,
    })
  }
  if (serverMetrics && Number(serverMetrics.error5xxRatePct || 0) > 1) {
    alerts.push({
      id: 'alert-5xx-rate',
      severity: 'danger',
      rule: 'API 5xx error rate > 1%',
      detail: `Observed 5xx rate ${serverMetrics.error5xxRatePct}% (${serverMetrics.errors5xx} errors).`,
    })
  }
  if (serverMetrics && Number(serverMetrics.p95LatencyMs || 0) > 2000) {
    alerts.push({
      id: 'alert-latency',
      severity: 'warn',
      rule: 'API p95 latency > 2000ms',
      detail: `Observed p95 latency ${serverMetrics.p95LatencyMs}ms.`,
    })
  }
  return alerts
}

export function buildApiKeyMetadata(label = 'Partner ERP Key', scope = 'inventory:read') {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  const prefix = `kmsp_live_${suffix}`
  return {
    id: `key-${Date.now().toString(36)}`,
    label: String(label).trim().slice(0, 80),
    maskedPrefix: `${prefix}••••••••`,
    scope,
    status: 'Active',
    createdAt: new Date().toISOString(),
  }
}

export function buildWorkspaceBackupPayload(state = {}) {
  const snapshot = {
    schemaVersion: 'kmsp-backup-v1',
    exportedAt: new Date().toISOString(),
    tenantSettings: state.tenantSettings || DEFAULT_TENANT_SETTINGS,
    branches: state.branches || [],
    inventory: state.inventory || [],
    sales: state.sales || [],
    expenses: state.expenses || [],
    journalEntries: state.journalEntries || [],
    stockMovements: state.stockMovements || [],
    purchaseOrders: state.purchaseOrders || [],
    suppliers: state.suppliers || [],
    customers: state.customers || [],
    auditLogs: state.auditLogs || [],
  }
  const counts = {
    inventory: snapshot.inventory.length,
    sales: snapshot.sales.length,
    journalEntries: snapshot.journalEntries.length,
    stockMovements: snapshot.stockMovements.length,
    auditLogs: snapshot.auditLogs.length,
  }
  return { snapshot, counts }
}

export function verifyWorkspaceBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Backup payload is not a valid JSON object.'], balancedJournals: 0, totalJournals: 0 }
  }
  const errors = []
  if (payload.schemaVersion !== 'kmsp-backup-v1') errors.push('Unsupported or missing schemaVersion.')
  if (!Array.isArray(payload.inventory)) errors.push('Missing inventory array.')
  if (!Array.isArray(payload.journalEntries)) errors.push('Missing journalEntries array.')
  if (!Array.isArray(payload.stockMovements)) errors.push('Missing stockMovements array.')

  const journals = Array.isArray(payload.journalEntries) ? payload.journalEntries : []
  const balancedJournals = journals.filter(
    j => Math.abs(Number(j?.totalDebit || 0) - Number(j?.totalCredit || 0)) <= 0.01,
  ).length
  if (balancedJournals !== journals.length) {
    errors.push(`Detected ${journals.length - balancedJournals} unbalanced journal entries in backup.`)
  }
  return {
    valid: errors.length === 0,
    errors,
    balancedJournals,
    totalJournals: journals.length,
    skuCount: Array.isArray(payload.inventory) ? payload.inventory.length : 0,
    movementCount: Array.isArray(payload.stockMovements) ? payload.stockMovements.length : 0,
  }
}

export function simulateBackupRestoreDrill(payload = {}) {
  const baseCheck = verifyWorkspaceBackupPayload(payload)
  const errors = [...baseCheck.errors]
  const inventoryIds = new Set((Array.isArray(payload.inventory) ? payload.inventory : []).map(i => i.id).filter(Boolean))
  const movements = Array.isArray(payload.stockMovements) ? payload.stockMovements : []
  const orphanMovements = movements.filter(m => m.itemId && inventoryIds.size > 0 && !inventoryIds.has(m.itemId))
  if (orphanMovements.length > 0) {
    errors.push(`Restore integrity check flagged ${orphanMovements.length} movement(s) referencing uncatalogued itemIds.`)
  }
  const stockValuationKes = (Array.isArray(payload.inventory) ? payload.inventory : []).reduce(
    (sum, i) => sum + Number(i.unitCost || 0) * Number(i.stockQuantity || 0),
    0,
  )
  return {
    ...baseCheck,
    valid: errors.length === 0,
    errors,
    orphanMovementCount: orphanMovements.length,
    stockValuationKes: Math.round(stockValuationKes * 100) / 100,
    drilledAt: new Date().toISOString(),
  }
}

export function parseCustomerCsvImport(csvText, existingCustomers = []) {
  const existingPhones = new Set(
    (Array.isArray(existingCustomers) ? existingCustomers : [])
      .map(c => String(c?.phone || '').trim().toLowerCase())
      .filter(Boolean),
  )
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  if (!lines.length) return { validRows: [], duplicates: [], errors: ['Customer CSV is empty.'] }
  const first = lines[0].toLowerCase()
  const hasHeader = first.includes('fullname') || first.includes('full_name') || first.includes('phone')
  const rows = hasHeader ? lines.slice(1) : lines
  const validRows = []
  const duplicates = []
  const errors = []
  const seen = new Set()

  rows.forEach((line, idx) => {
    const rowNum = idx + (hasHeader ? 2 : 1)
    const [fullName, phone, bikeModel, consentWhatsAppRaw, consentSmsRaw, consentMktRaw] = line
      .split(',')
      .map(c => c.trim().replace(/^"|"$/g, ''))
    if (!fullName) {
      errors.push(`Row ${rowNum}: fullName is required.`)
      return
    }
    const phoneKey = String(phone || '').toLowerCase()
    if (phoneKey && (existingPhones.has(phoneKey) || seen.has(phoneKey))) {
      duplicates.push({ rowNum, fullName, phone, reason: 'Duplicate customer phone' })
      return
    }
    if (phoneKey) seen.add(phoneKey)
    validRows.push({
      fullName: fullName.slice(0, 200),
      phone: String(phone || '').slice(0, 40),
      bikeModel: String(bikeModel || 'Standard').slice(0, 120),
      consentWhatsApp: String(consentWhatsAppRaw || 'true').toLowerCase() !== 'false',
      consentSms: String(consentSmsRaw || 'true').toLowerCase() !== 'false',
      consentMarketing: String(consentMktRaw || 'false').toLowerCase() === 'true',
    })
  })
  return { validRows, duplicates, errors }
}

export function parseSupplierCsvImport(csvText, existingSuppliers = []) {
  const existingNames = new Set(
    (Array.isArray(existingSuppliers) ? existingSuppliers : [])
      .map(s => String(s?.supplierName || '').trim().toLowerCase())
      .filter(Boolean),
  )
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  if (!lines.length) return { validRows: [], duplicates: [], errors: ['Supplier CSV is empty.'] }
  const first = lines[0].toLowerCase()
  const hasHeader = first.includes('suppliername') || first.includes('supplier_name') || first.includes('leadtime')
  const rows = hasHeader ? lines.slice(1) : lines
  const validRows = []
  const duplicates = []
  const errors = []
  const seen = new Set()

  rows.forEach((line, idx) => {
    const rowNum = idx + (hasHeader ? 2 : 1)
    const [supplierName, category, area, leadTimeRaw, paymentTerms] = line
      .split(',')
      .map(c => c.trim().replace(/^"|"$/g, ''))
    if (!supplierName) {
      errors.push(`Row ${rowNum}: supplierName is required.`)
      return
    }
    const key = supplierName.toLowerCase()
    if (existingNames.has(key) || seen.has(key)) {
      duplicates.push({ rowNum, supplierName, reason: 'Duplicate supplier' })
      return
    }
    seen.add(key)
    validRows.push({
      supplierName: supplierName.slice(0, 200),
      category: String(category || 'General Spares').slice(0, 100),
      area: String(area || 'Nairobi').slice(0, 150),
      leadTimeDays: Math.max(0, Math.trunc(Number(leadTimeRaw || 2))),
      paymentTerms: String(paymentTerms || 'Net 14').slice(0, 80),
    })
  })
  return { validRows, duplicates, errors }
}

export function buildOpeningBalanceCutoverJournal({
  branchId = 'branch-cbd',
  openingCashKes = 0,
  openingInventoryValueKes = 0,
  openingArKes = 0,
  openingApKes = 0,
}) {
  const cash = Math.max(0, Math.round(Number(openingCashKes || 0) * 100) / 100)
  const inv = Math.max(0, Math.round(Number(openingInventoryValueKes || 0) * 100) / 100)
  const ar = Math.max(0, Math.round(Number(openingArKes || 0) * 100) / 100)
  const ap = Math.max(0, Math.round(Number(openingApKes || 0) * 100) / 100)
  const totalAssets = Math.round((cash + inv + ar) * 100) / 100
  const equityBalance = Math.round((totalAssets - ap) * 100) / 100
  const lines = []
  if (cash > 0) lines.push({ account: '1010 Cash & M-Pesa Till', debit: cash, credit: 0 })
  if (inv > 0) lines.push({ account: '1200 Inventory Asset', debit: inv, credit: 0 })
  if (ar > 0) lines.push({ account: '1100 Accounts Receivable', debit: ar, credit: 0 })
  if (ap > 0) lines.push({ account: '2010 Accounts Payable', debit: 0, credit: ap })
  if (equityBalance >= 0 && equityBalance > 0) {
    lines.push({ account: '3000 Opening Balance Equity', debit: 0, credit: equityBalance })
  } else if (equityBalance < 0) {
    lines.push({ account: '3000 Opening Balance Equity', debit: Math.abs(equityBalance), credit: 0 })
  }
  const totalDebit = Math.round(lines.reduce((s, l) => s + Number(l.debit || 0), 0) * 100) / 100
  const totalCredit = Math.round(lines.reduce((s, l) => s + Number(l.credit || 0), 0) * 100) / 100
  if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error('Opening balance cutover amounts must produce a non-zero balanced journal.')
  }
  return {
    branchId,
    entryNumber: `JE-CUT-${Date.now().toString().slice(-6)}`,
    entryType: 'opening_cutover',
    sourceId: `cutover-${Date.now()}`,
    debitAccount: lines.find(l => l.debit > 0)?.account || '1010 Cash & M-Pesa Till',
    creditAccount: lines.find(l => l.credit > 0)?.account || '3000 Opening Balance Equity',
    totalDebit,
    totalCredit,
    description: `Legacy ERP opening cutover (Cash KES ${cash}, Inv KES ${inv}, AR KES ${ar}, AP KES ${ap})`,
    linesJson: JSON.stringify(lines),
  }
}

export function generateEscPosReceipt(receipt = {}, orgName = 'Kenya Motorcycle Spare Parts General') {
  const escInit = '\x1B\x40'
  const escCenter = '\x1B\x61\x01'
  const escLeft = '\x1B\x61\x00'
  const escCut = '\x1D\x56\x41\x00'
  const divider = '------------------------------------------'
  const lines = [
    `${escInit}${escCenter}${orgName}`,
    `Receipt: ${receipt.prefix || 'KMSP'}-${receipt.id || '000'}`,
    `Buyer: ${receipt.customerName || 'Walk-in Rider'}`,
    `Time: ${receipt.timestamp || new Date().toISOString()}`,
    `${escLeft}${divider}`,
    ...(receipt.items || []).map(
      line => `${line.partNumber} x${line.quantity}  KES ${(Number(line.quantity || 1) * Number(line.unitPrice || 0)).toLocaleString()}`,
    ),
    divider,
    `VAT (${receipt.complianceMode === 'etims_vat' ? '16%' : '0%'}): KES ${Number(receipt.totals?.vatAmount || 0).toLocaleString()}`,
    `TOTAL (${receipt.paymentMethod || 'cash'}): KES ${Number(receipt.totals?.totalAmount || 0).toLocaleString()}`,
    receipt.changeDue > 0 ? `CHANGE DUE: KES ${Number(receipt.changeDue).toLocaleString()}` : null,
    divider,
    `${escCenter}Asante! Ride Safe.${escCut}`,
  ].filter(Boolean)
  return lines.join('\n')
}

export function generateZplBarcodeLabel(item = {}) {
  const code = String(item.barcode || item.partNumber || 'KMSP-000').replace(/\^|~/g, '')
  const name = String(item.partName || 'Spare Part').replace(/\^|~/g, '').slice(0, 34)
  const bin = String(item.binLocation || 'A1').replace(/\^|~/g, '').slice(0, 16)
  const price = Number(item.retailPrice || 0).toLocaleString()
  return [
    '^XA',
    '^PW400',
    '^LL240',
    `^FO20,20^A0N,24,24^FD${name}^FS`,
    `^FO20,52^A0N,20,20^FD${item.partNumber || code} | Bin ${bin} | KES ${price}^FS`,
    '^FO20,86^BY2,2,80',
    `^BCN,80,Y,N,N^FD${code}^FS`,
    '^XZ',
  ].join('\n')
}

