import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHART_OF_ACCOUNTS,
  validateBalancedJournal,
  buildSaleJournalEntry,
  buildExpenseJournalEntry,
  buildReturnReversalJournalEntry,
  buildGrnReceiptJournalEntry,
  buildPurchaseReturnJournalEntry,
  buildVarianceJournalEntry,
  buildReversingJournalEntry,
} from '../src/lib/accountingEngine.js'
import {
  DEFAULT_FEATURE_FLAGS,
  evaluateDiscountApproval,
  renderNotificationTemplate,
  evaluateNotificationDelivery,
  computeShiftReconciliation,
  parseCatalogueCsvAndDetectDuplicates,
  buildPackBreakMovements,
} from '../src/lib/platformGovernance.js'
import {
  buildDailyBusinessSummary,
  buildSalesReport,
  buildProfitCogsReport,
  buildCashReconciliationReport,
  buildStockReport,
  buildPurchaseReport,
  buildPlatformHealthReport,
  exportReportToCsv,
} from '../src/lib/reportingEngine.js'

test('CHART_OF_ACCOUNTS provides standard Kenyan retail/spares accounts and validates balanced journals', () => {
  assert.ok(CHART_OF_ACCOUNTS.some(a => a.code === '2200'))
  assert.throws(
    () =>
      validateBalancedJournal({
        entryType: 'sale',
        description: 'Unbalanced check',
        lines: [
          { account: '1010 Cash', debit: 1000, credit: 0 },
          { account: '4010 Revenue', debit: 0, credit: 900 },
        ],
      }),
    /Unbalanced journal entry/,
  )
})

test('double-entry builders produce balanced debit == credit entries and support manual reversals', () => {
  const saleJe = buildSaleJournalEntry({
    branchId: 'branch-cbd',
    saleId: 'sale-101',
    paymentMethod: 'mobile_money_reference',
    totalAmount: 2552,
    vatAmount: 352,
    cogsAmount: 1450,
  })
  assert.equal(saleJe.entryType, 'sale')
  assert.equal(saleJe.totalDebit, saleJe.totalCredit)
  assert.equal(saleJe.totalDebit, 2552 + 1450)
  assert.equal(saleJe.status, 'Posted')

  const revJe = buildReversingJournalEntry({ id: 'je-101', ...saleJe }, 'Customer billing correction')
  assert.equal(revJe.entryType, 'manual_reversal')
  assert.equal(revJe.reversesEntryId, 'je-101')
  assert.equal(revJe.totalDebit, saleJe.totalCredit)

  assert.throws(() => buildReversingJournalEntry({ id: 'je-rev', ...revJe }), /Cannot reverse/)

  const expJe = buildExpenseJournalEntry({ branchId: 'branch-cbd', expenseId: 'exp-1', category: 'Courier', amount: 750 })
  assert.equal(expJe.totalDebit, 750)
  assert.equal(expJe.totalCredit, 750)

  const retJe = buildReturnReversalJournalEntry({
    branchId: 'branch-cbd',
    returnId: 'ret-1',
    partNumber: 'BJ-CSK-150',
    refundAmount: 2200,
    refundMethod: 'cash',
    restockCost: 1450,
  })
  assert.equal(retJe.totalDebit, 3650)
  assert.equal(retJe.totalCredit, 3650)

  const grnJe = buildGrnReceiptJournalEntry({ branchId: 'branch-cbd', poId: 'po-1', orderNumber: 'PO-1', totalLandedCost: 17350 })
  assert.equal(grnJe.totalDebit, 17350)

  const prnJe = buildPurchaseReturnJournalEntry({ branchId: 'branch-cbd', poId: 'po-1', orderNumber: 'PO-1', returnCost: 2300 })
  assert.equal(prnJe.entryType, 'purchase_return')
  assert.equal(prnJe.totalDebit, 2300)

  const varJe = buildVarianceJournalEntry({ branchId: 'branch-cbd', countId: 'cnt-1', partNumber: 'KND-275-17', variance: -2, unitCost: 2300 })
  assert.equal(varJe.totalDebit, 4600)
})

test('platformGovernance enforces role discount approval limits, notification consent/quiet-hours, CSV duplicate detection, and pack-breaking', () => {
  assert.equal(DEFAULT_FEATURE_FLAGS.etimsVscu, true)

  const cashierOk = evaluateDiscountApproval('cashier', 2000, 100)
  assert.equal(cashierOk.allowed, true)
  const cashierBlocked = evaluateDiscountApproval('cashier', 2000, 400)
  assert.equal(cashierBlocked.allowed, false)
  assert.equal(cashierBlocked.requiresManagerApproval, true)

  const rendered = renderNotificationTemplate('LOW_STOCK_ALERT', {
    partNumber: 'NGK-CR8E',
    partName: 'NGK Spark Plug',
    stockQuantity: 3,
    reorderLevel: 12,
  })
  assert.match(rendered.title, /NGK-CR8E/)

  const optedOut = evaluateNotificationDelivery({
    channel: 'whatsapp',
    category: 'marketing',
    customer: { consentWhatsApp: false, consentSms: true, consentMarketing: false },
    nairobiHour: 14,
  })
  assert.equal(optedOut.status, 'Suppressed')

  const quietHours = evaluateNotificationDelivery({
    channel: 'sms',
    category: 'transactional',
    customer: { consentWhatsApp: true, consentSms: true, consentMarketing: true },
    nairobiHour: 22,
  })
  assert.equal(quietHours.status, 'Queued')
  assert.match(quietHours.reason, /quiet hours/)

  const shift = computeShiftReconciliation({
    openingFloat: 5000,
    cashSales: 12000,
    cashRefunds: 1000,
    cashExpenses: 1500,
    countedCash: 14300,
  })
  assert.equal(shift.expectedCash, 14500)
  assert.equal(shift.variance, -200)
  assert.equal(shift.isShort, true)

  const csvResult = parseCatalogueCsvAndDetectDuplicates(
    [
      'partNumber,partName,category,brand,barcode,unitCost,retailPrice,stockQuantity,reorderLevel,compatibleModels',
      'BJ-CSK-150,Duplicate Kit,Drivetrain,Bajaj,,1400,2200,5,3,Boxer',
      'TVS-LED-01,TVS LED Headlamp,Electrical,TVS,6164009999999,950,1650,14,4,TVS HLX 150',
      'BAD-ROW,Missing Cost,Brakes,Generic,,invalid,500,2,1,Boxer',
    ].join('\n'),
    [{ partNumber: 'BJ-CSK-150', barcode: '6164001500018' }],
  )
  assert.equal(csvResult.validRows.length, 1)
  assert.equal(csvResult.duplicates.length, 1)
  assert.equal(csvResult.errors.length, 1)

  const packBreak = buildPackBreakMovements({
    parentItem: { partNumber: 'NGK-CR8E', partName: 'NGK Plug', packSize: 10, stockQuantity: 5, reservedQuantity: 1, unitCost: 2100, retailPrice: 3800 },
    packsToBreak: 2,
  })
  assert.equal(packBreak.looseUnitsCreated, 20)
  assert.equal(packBreak.nextParentStock, 3)
  assert.equal(packBreak.unitCostPerPiece, 210)
})

test('reportingEngine computes Daily Summary, Sales, Profit/COGS, Cash, Stock, Purchase, Health & CSV cleanly', () => {
  const daily = buildDailyBusinessSummary({
    branchId: 'branch-cbd',
    sales: [{ branchId: 'branch-cbd', totalAmount: 5104, discountAmount: 0, vatAmount: 704, paymentMethod: 'cash' }],
    expenses: [{ branchId: 'branch-cbd', amount: 1450 }],
    salesReturns: [{ branchId: 'branch-cbd', refundAmount: 500, status: 'Approved' }],
    etimsInvoices: [{ status: 'Accepted' }, { status: 'Queued' }],
    journalEntries: [{ branchId: 'branch-cbd', totalDebit: 5104, totalCredit: 5104 }],
  })
  assert.equal(daily.netSales, 4604)
  assert.equal(daily.netOperatingCashFlow, 3154)

  const salesRep = buildSalesReport({
    branchId: 'branch-cbd',
    sales: [{ branchId: 'branch-cbd', totalAmount: 2200, paymentMethod: 'cash' }],
    salesReturns: [],
  })
  assert.equal(salesRep.byPaymentMethod[0].total, 2200)

  const profitRep = buildProfitCogsReport({
    branchId: 'branch-cbd',
    sales: [{ branchId: 'branch-cbd', totalAmount: 5104, vatAmount: 704 }],
    expenses: [{ branchId: 'branch-cbd', amount: 1000 }],
    stockMovements: [{ branchId: 'branch-cbd', movementType: 'sale', itemId: 's1', quantityDelta: -2, unitCostSnapshot: 1450 }],
    inventory: [{ id: 's1', unitCost: 1450 }],
  })
  assert.equal(profitRep.netRevenueExVat, 4400)
  assert.equal(profitRep.cogs, 2900)
  assert.equal(profitRep.grossProfit, 1500)
  assert.equal(profitRep.netProfit, 500)

  const cashRep = buildCashReconciliationReport({
    branchId: 'branch-cbd',
    drawerShifts: [{ branchId: 'branch-cbd', status: 'Closed', variance: -150 }],
  })
  assert.equal(cashRep.totalVariance, -150)

  const stockRep = buildStockReport({
    branchId: 'branch-cbd',
    inventory: [{ branchId: 'branch-cbd', partNumber: 'A1', partName: 'Part', stockQuantity: 10, reservedQuantity: 2, unitCost: 100, retailPrice: 150 }],
  })
  assert.equal(stockRep[0].available, 8)

  const purchaseRep = buildPurchaseReport({
    branchId: 'branch-cbd',
    purchaseOrders: [{ branchId: 'branch-cbd', status: 'Received', totalCost: 10000, landedCost: 11000 }],
    suppliers: [{ id: 'sup1' }],
  })
  assert.equal(purchaseRep.freightOverheadPct, 10)

  const healthRep = buildPlatformHealthReport({
    outbox: [{ id: 1 }],
    etimsInvoices: [{ status: 'Queued' }],
    notifications: [{ status: 'Suppressed' }, { status: 'Unread' }],
    journalEntries: [{ totalDebit: 100, totalCredit: 100 }],
    auditLogs: [{ id: 1 }],
  })
  assert.equal(healthRep.balancedJournalRatio, '1/1')

  const csv = exportReportToCsv(['Col A', 'Col B'], [['Kenya, Moto', '100']])
  assert.match(csv, /"Kenya, Moto",100/)
})
