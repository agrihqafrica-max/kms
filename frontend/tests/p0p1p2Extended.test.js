import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyAbcInventory,
  validateSplitPayments,
  detectOutboxConflict,
  scoreAndRankRfqs,
  CONTAINER_STAGE_ORDER,
} from '../src/lib/kmsDomain.js'
import { buildSaleJournalEntry, parseJournalLines } from '../src/lib/accountingEngine.js'
import {
  DEFAULT_TENANT_SETTINGS,
  validateReturnActorSeparation,
  evaluateOpsAlertRules,
  buildApiKeyMetadata,
  buildWorkspaceBackupPayload,
  verifyWorkspaceBackupPayload,
} from '../src/lib/platformGovernance.js'
import {
  buildDailyBusinessSummary,
  buildSalesReport,
  buildStockReport,
} from '../src/lib/reportingEngine.js'

test('classifyAbcInventory classifies SKUs into Pareto A/B/C tiers using sales movement and stock value', () => {
  const inventory = [
    { id: 'sku-a', partNumber: 'A-1', unitCost: 2000, retailPrice: 3500, stockQuantity: 10 },
    { id: 'sku-b', partNumber: 'B-1', unitCost: 500, retailPrice: 1000, stockQuantity: 8 },
    { id: 'sku-c', partNumber: 'C-1', unitCost: 80, retailPrice: 200, stockQuantity: 5 },
  ]
  const movements = [
    { itemId: 'sku-a', movementType: 'sale', quantityDelta: -20 },
    { itemId: 'sku-b', movementType: 'sale', quantityDelta: -25 },
    { itemId: 'sku-c', movementType: 'sale', quantityDelta: -25 },
  ]
  const abc = classifyAbcInventory(inventory, movements)
  assert.equal(abc['sku-a'].abcTier, 'A')
  assert.equal(abc['sku-a'].soldUnits, 20)
  assert.equal(abc['sku-b'].abcTier, 'B')
  assert.equal(abc['sku-c'].abcTier, 'C')
})

test('validateSplitPayments supports cash + M-Pesa split tender with cash change and rejects non-cash over-tender', () => {
  const ok = validateSplitPayments(
    [
      { method: 'mobile_money_reference', amount: 1500, reference: 'UC12MPESA' },
      { method: 'cash', amount: 1000 },
    ],
    2200,
  )
  assert.equal(ok.valid, true)
  assert.equal(ok.primaryMethod, 'split')
  assert.equal(ok.changeDue, 300)
  const cashSettled = ok.normalizedPayments.find(p => p.method === 'cash')
  assert.equal(cashSettled.amount, 700)

  const invalidNonCashOver = validateSplitPayments(
    [{ method: 'mobile_money_reference', amount: 2500, reference: 'REF' }],
    2000,
  )
  assert.equal(invalidNonCashOver.valid, false)
  assert.match(invalidNonCashOver.error, /cash tender portion/)

  const invalidShort = validateSplitPayments([{ method: 'cash', amount: 500 }], 1000)
  assert.equal(invalidShort.valid, false)
})

test('buildSaleJournalEntry balances split-tender debit lines against revenue, VAT, COGS, and inventory', () => {
  const je = buildSaleJournalEntry({
    branchId: 'branch-cbd',
    saleId: 'sale-split-1',
    payments: [
      { method: 'cash', amount: 1000 },
      { method: 'mobile_money_reference', amount: 1320 },
    ],
    totalAmount: 2320,
    vatAmount: 320,
    cogsAmount: 1400,
  })
  assert.equal(je.totalDebit, je.totalCredit)
  assert.equal(je.totalDebit, 2320 + 1400)
  const lines = parseJournalLines(je)
  assert.ok(lines.some(l => l.account.startsWith('1010') && l.debit === 1000))
  assert.ok(lines.some(l => l.account.startsWith('1020') && l.debit === 1320))
})

test('detectOutboxConflict flags revoked device, insufficient stock, and price drift', () => {
  const conflict = detectOutboxConflict({
    queuedSale: {
      idempotencyKey: 'sale-off-1',
      deviceId: 'DEV-LOST-9',
      cart: [{ id: 's1', partNumber: 'BJ-CSK-150', quantity: 5, unitPriceSnapshot: 2200 }],
    },
    inventory: [{ id: 's1', partNumber: 'BJ-CSK-150', stockQuantity: 2, reservedQuantity: 0, retailPrice: 2400 }],
    revokedDeviceIds: ['DEV-LOST-9'],
  })
  assert.equal(conflict.hasConflict, true)
  assert.equal(conflict.reasons.length, 3)
  assert.match(conflict.reasons[0], /revoked/)
  assert.match(conflict.reasons[1], /Insufficient stock/)
  assert.match(conflict.reasons[2], /Price drift/)
})

test('scoreAndRankRfqs ranks supplier quotes using reliability score, lead time, and price', () => {
  const ranked = scoreAndRankRfqs(
    [
      { id: 'q1', supplierId: 'sup-slow', quotedUnitPrice: 1500, leadTimeDays: 10 },
      { id: 'q2', supplierId: 'sup-fast', quotedUnitPrice: 1450, leadTimeDays: 1 },
    ],
    [
      { id: 'sup-slow', fillRatePct: 80, defectRatePct: 4, leadTimeDays: 10 },
      { id: 'sup-fast', fillRatePct: 98, defectRatePct: 0.5, leadTimeDays: 1 },
    ],
  )
  assert.equal(ranked[0].id, 'q2')
  assert.equal(CONTAINER_STAGE_ORDER.at(-1), 'Godown Received')
})

test('platformGovernance enforces return separation of duties, ops alerts, API key masking, and backup integrity', () => {
  assert.equal(DEFAULT_TENANT_SETTINGS.currency, 'KES')
  const blockedSelfReturn = validateReturnActorSeparation({
    requestedBy: 'Grace Cashier',
    approverName: 'Grace Cashier',
    role: 'manager',
  })
  assert.equal(blockedSelfReturn.allowed, false)

  const ownerOverride = validateReturnActorSeparation({
    requestedBy: 'Grace Cashier',
    approverName: 'Grace Cashier',
    role: 'owner',
  })
  assert.equal(ownerOverride.allowed, true)

  const alerts = evaluateOpsAlertRules({
    outbox: [1, 2, 3, 4, 5],
    outboxConflicts: [{ id: 'c1' }],
    etimsInvoices: [{ status: 'Failed' }],
    serverMetrics: { error5xxRatePct: 2.5, errors5xx: 3, p95LatencyMs: 2400 },
  })
  assert.equal(alerts.length, 5)

  const keyMeta = buildApiKeyMetadata('ERP Feed', 'inventory:read')
  assert.match(keyMeta.maskedPrefix, /^kmsp_live_/)
  assert.equal(keyMeta.status, 'Active')

  const { snapshot, counts } = buildWorkspaceBackupPayload({
    inventory: [{ id: 'i1' }],
    journalEntries: [{ id: 'j1', totalDebit: 500, totalCredit: 500 }],
    stockMovements: [{ id: 'm1' }],
  })
  assert.equal(counts.journalEntries, 1)
  const verified = verifyWorkspaceBackupPayload(snapshot)
  assert.equal(verified.valid, true)
  assert.equal(verified.balancedJournals, 1)

  const corrupted = verifyWorkspaceBackupPayload({
    ...snapshot,
    journalEntries: [{ id: 'j-bad', totalDebit: 500, totalCredit: 400 }],
  })
  assert.equal(corrupted.valid, false)
})

test('reportingEngine supports Nairobi EAT date range filters, payment method filters, and ABC tiers', () => {
  const sales = [
    { branchId: 'b1', totalAmount: 1000, vatAmount: 0, paymentMethod: 'cash', createdAt: '2026-11-18T10:00:00+03:00' },
    {
      branchId: 'b1',
      totalAmount: 2500,
      vatAmount: 0,
      paymentMethod: 'split',
      payments: [
        { method: 'cash', amount: 1000 },
        { method: 'mobile_money_reference', amount: 1500 },
      ],
      createdAt: '2026-11-19T12:00:00+03:00',
    },
  ]

  const dayOnly = buildDailyBusinessSummary({
    sales,
    branchId: 'b1',
    startDate: '2026-11-19',
    endDate: '2026-11-19',
  })
  assert.equal(dayOnly.transactionCount, 1)
  assert.equal(dayOnly.grossSales, 2500)

  const salesSplit = buildSalesReport({
    sales,
    branchId: 'b1',
    paymentMethod: 'split',
  })
  assert.equal(salesSplit.rows.length, 1)
  assert.equal(salesSplit.byPaymentMethod.length, 2)

  const stock = buildStockReport({
    branchId: 'b1',
    inventory: [{ id: 's1', branchId: 'b1', partNumber: 'P1', partName: 'Pad', stockQuantity: 5, unitCost: 200, retailPrice: 400 }],
    stockMovements: [{ itemId: 's1', movementType: 'sale', quantityDelta: -4 }],
  })
  assert.equal(stock[0].abcTier, 'A')
  assert.equal(stock[0].soldUnits, 4)
})
