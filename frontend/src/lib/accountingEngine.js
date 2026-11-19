export const CHART_OF_ACCOUNTS = [
  { code: '1010', name: 'Cash on Hand', category: 'Asset' },
  { code: '1020', name: 'M-Pesa Till & Bank Clearing', category: 'Asset' },
  { code: '1100', name: 'Accounts Receivable (Wholesale Credit)', category: 'Asset' },
  { code: '1200', name: 'Inventory Asset', category: 'Asset' },
  { code: '2100', name: 'Accounts Payable (Suppliers)', category: 'Liability' },
  { code: '2200', name: 'Output VAT Payable (16% eTIMS)', category: 'Liability' },
  { code: '2300', name: 'Customer Credit Notes Payable', category: 'Liability' },
  { code: '4010', name: 'Spare Parts Sales Revenue', category: 'Revenue' },
  { code: '4020', name: 'Sales Returns & Allowances', category: 'Contra-Revenue' },
  { code: '5010', name: 'Cost of Goods Sold (COGS)', category: 'COGS' },
  { code: '5020', name: 'Inventory Variance & Shrinkage', category: 'Expense' },
  { code: '6010', name: 'Shop Operating Expenses', category: 'Expense' },
]

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

export function nextEntryNumber(prefix = 'JE') {
  const stamp = Date.now().toString().slice(-6)
  const rand = Math.floor(100 + Math.random() * 899)
  return `${prefix}-${stamp}-${rand}`
}

export function validateBalancedJournal({ lines, entryType, description }) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('Double-entry journal requires at least 2 balanced lines.')
  }
  if (!String(description || '').trim()) {
    throw new Error('Journal entry description is required.')
  }
  const allowed = [
    'sale',
    'expense',
    'return_reversal',
    'grn_receipt',
    'count_variance',
    'manual_reversal',
    'purchase_return',
  ]
  if (!allowed.includes(entryType)) {
    throw new Error(`Unsupported journal entryType: ${entryType}`)
  }

  let totalDebit = 0
  let totalCredit = 0
  const normalized = lines.map(line => {
    const debit = round2(Math.max(0, Number(line?.debit || 0)))
    const credit = round2(Math.max(0, Number(line?.credit || 0)))
    if (debit === 0 && credit === 0) {
      throw new Error(`Journal line for ${line?.account || 'unknown'} must have positive debit or credit.`)
    }
    if (debit > 0 && credit > 0) {
      throw new Error(`Journal line for ${line?.account || 'unknown'} cannot have both debit and credit.`)
    }
    totalDebit = round2(totalDebit + debit)
    totalCredit = round2(totalCredit + credit)
    return {
      account: String(line.account || '').trim(),
      debit,
      credit,
    }
  })

  if (totalDebit <= 0) {
    throw new Error('Journal entry totalDebit must be greater than zero.')
  }
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Unbalanced journal entry: debits (${totalDebit}) != credits (${totalCredit}).`)
  }

  const primaryDebit = normalized.find(l => l.debit > 0)?.account || '1010 Cash on Hand'
  const primaryCredit = normalized.find(l => l.credit > 0)?.account || '4010 Spare Parts Sales Revenue'

  return {
    lines: normalized,
    totalDebit,
    totalCredit: totalDebit,
    debitAccount: primaryDebit.slice(0, 80),
    creditAccount: primaryCredit.slice(0, 80),
  }
}

function finalizeEntry({ branchId, entryType, sourceId, description, lines, reversesEntryId }) {
  const checked = validateBalancedJournal({ lines, entryType, description })
  return {
    branchId: String(branchId || 'branch-cbd').slice(0, 128),
    entryNumber: nextEntryNumber('JE'),
    entryType,
    ...(sourceId ? { sourceId: String(sourceId).slice(0, 128) } : {}),
    description: String(description).trim().slice(0, 400),
    debitAccount: checked.debitAccount,
    creditAccount: checked.creditAccount,
    totalDebit: checked.totalDebit,
    totalCredit: checked.totalCredit,
    linesJson: JSON.stringify(checked.lines).slice(0, 8000),
    ...(reversesEntryId ? { reversesEntryId: String(reversesEntryId).slice(0, 128) } : {}),
    status: 'Posted',
  }
}

export function buildSaleJournalEntry({
  branchId,
  saleId,
  paymentMethod = 'cash',
  totalAmount = 0,
  vatAmount = 0,
  cogsAmount = 0,
}) {
  const gross = round2(Math.max(0, Number(totalAmount || 0)))
  if (gross <= 0) {
    throw new Error('Sale journal requires positive totalAmount.')
  }
  const vat = round2(Math.min(Math.max(0, Number(vatAmount || 0)), gross))
  const netRevenue = round2(gross - vat)
  const assetAccount =
    paymentMethod === 'credit'
      ? '1100 Accounts Receivable (Wholesale Credit)'
      : paymentMethod === 'cash'
        ? '1010 Cash on Hand'
        : '1020 M-Pesa Till & Bank Clearing'

  const lines = [
    { account: assetAccount, debit: gross, credit: 0 },
    { account: '4010 Spare Parts Sales Revenue', debit: 0, credit: netRevenue },
  ]
  if (vat > 0) {
    lines.push({ account: '2200 Output VAT Payable (16% eTIMS)', debit: 0, credit: vat })
  }
  const safeCogs = round2(Math.max(0, Number(cogsAmount || 0)))
  if (safeCogs > 0) {
    lines.push({ account: '5010 Cost of Goods Sold (COGS)', debit: safeCogs, credit: 0 })
    lines.push({ account: '1200 Inventory Asset', debit: 0, credit: safeCogs })
  }

  return finalizeEntry({
    branchId,
    entryType: 'sale',
    sourceId: saleId,
    description: `POS sale ${saleId} (${paymentMethod}) — Revenue KES ${netRevenue}, VAT KES ${vat}${safeCogs > 0 ? `, COGS KES ${safeCogs}` : ''}`,
    lines,
  })
}

export function buildExpenseJournalEntry({ branchId, expenseId, category, amount }) {
  const safeAmount = round2(Math.max(0, Number(amount || 0)))
  if (safeAmount <= 0) {
    throw new Error('Expense journal requires positive amount.')
  }
  return finalizeEntry({
    branchId,
    entryType: 'expense',
    sourceId: expenseId,
    description: `Operating expense (${category || 'General'}) — KES ${safeAmount}`,
    lines: [
      { account: '6010 Operating Expenses', debit: safeAmount, credit: 0 },
      { account: '1010 Cash on Hand', debit: 0, credit: safeAmount },
    ],
  })
}

export function buildReturnReversalJournalEntry({
  branchId,
  returnId,
  partNumber,
  refundAmount = 0,
  refundMethod = 'cash',
  restockCost = 0,
}) {
  const safeRefund = round2(Math.max(0, Number(refundAmount || 0)))
  const safeRestock = round2(Math.max(0, Number(restockCost || 0)))
  if (safeRefund <= 0 && safeRestock <= 0) {
    throw new Error('Return journal requires positive refundAmount or restockCost.')
  }
  const creditAccount =
    refundMethod === 'credit_note'
      ? '2300 Customer Credit Notes Payable'
      : refundMethod === 'mobile_money_reference'
        ? '1020 M-Pesa Till & Bank Clearing'
        : '1010 Cash on Hand'

  const lines = []
  if (safeRefund > 0) {
    lines.push({ account: '4020 Sales Returns & Allowances', debit: safeRefund, credit: 0 })
    lines.push({ account: creditAccount, debit: 0, credit: safeRefund })
  }
  if (safeRestock > 0) {
    lines.push({ account: '1200 Inventory Asset', debit: safeRestock, credit: 0 })
    lines.push({ account: '5010 Cost of Goods Sold (COGS)', debit: 0, credit: safeRestock })
  }

  return finalizeEntry({
    branchId,
    entryType: 'return_reversal',
    sourceId: returnId,
    description: `Approved customer return ${partNumber} (${refundMethod}) — Refund KES ${safeRefund}`,
    lines,
  })
}

export function buildGrnReceiptJournalEntry({ branchId, poId, orderNumber, totalLandedCost = 0 }) {
  const safeCost = round2(Math.max(0, Number(totalLandedCost || 0)))
  if (safeCost <= 0) {
    throw new Error('GRN receipt journal requires positive landed cost.')
  }
  return finalizeEntry({
    branchId,
    entryType: 'grn_receipt',
    sourceId: poId,
    description: `GRN stock receipt for ${orderNumber} — Landed Asset KES ${safeCost}`,
    lines: [
      { account: '1200 Inventory Asset', debit: safeCost, credit: 0 },
      { account: '2100 Accounts Payable (Suppliers)', debit: 0, credit: safeCost },
    ],
  })
}

export function buildPurchaseReturnJournalEntry({ branchId, poId, orderNumber, returnCost = 0 }) {
  const safeCost = round2(Math.max(0, Number(returnCost || 0)))
  if (safeCost <= 0) {
    throw new Error('Purchase return journal requires positive returnCost.')
  }
  return finalizeEntry({
    branchId,
    entryType: 'purchase_return',
    sourceId: poId,
    description: `Supplier purchase return debit memo for ${orderNumber} — KES ${safeCost}`,
    lines: [
      { account: '2100 Accounts Payable (Suppliers)', debit: safeCost, credit: 0 },
      { account: '1200 Inventory Asset', debit: 0, credit: safeCost },
    ],
  })
}

export function buildVarianceJournalEntry({ branchId, countId, partNumber, variance = 0, unitCost = 0 }) {
  const deltaQty = Math.trunc(Number(variance || 0))
  const valueImpact = round2(Math.abs(deltaQty) * Math.max(0, Number(unitCost || 0)))
  if (deltaQty === 0 || valueImpact <= 0) return null

  const lines =
    deltaQty < 0
      ? [
          { account: '5020 Inventory Variance & Shrinkage', debit: valueImpact, credit: 0 },
          { account: '1200 Inventory Asset', debit: 0, credit: valueImpact },
        ]
      : [
          { account: '1200 Inventory Asset', debit: valueImpact, credit: 0 },
          { account: '5020 Inventory Variance & Shrinkage', debit: 0, credit: valueImpact },
        ]

  return finalizeEntry({
    branchId,
    entryType: 'count_variance',
    sourceId: countId,
    description: `Approved cycle count variance on ${partNumber} (${deltaQty > 0 ? `+${deltaQty}` : deltaQty} units) — KES ${valueImpact}`,
    lines,
  })
}

export function buildReversingJournalEntry(originalEntry, reason = 'Manual ledger correction reversal') {
  if (!originalEntry || !originalEntry.id) {
    throw new Error('Original journal entry is required to post a reversal.')
  }
  if (originalEntry.entryType === 'manual_reversal') {
    throw new Error('Cannot reverse an existing manual_reversal entry.')
  }
  let parsedLines = []
  try {
    parsedLines = JSON.parse(originalEntry.linesJson || '[]')
  } catch {
    parsedLines = []
  }
  if (!Array.isArray(parsedLines) || parsedLines.length < 2) {
    parsedLines = [
      { account: originalEntry.debitAccount, debit: Number(originalEntry.totalDebit || 0), credit: 0 },
      { account: originalEntry.creditAccount, debit: 0, credit: Number(originalEntry.totalCredit || 0) },
    ]
  }
  const flippedLines = parsedLines.map(line => ({
    account: line.account,
    debit: round2(Number(line.credit || 0)),
    credit: round2(Number(line.debit || 0)),
  }))

  return finalizeEntry({
    branchId: originalEntry.branchId,
    entryType: 'manual_reversal',
    sourceId: originalEntry.sourceId || originalEntry.id,
    reversesEntryId: originalEntry.id,
    description: `Reversal of ${originalEntry.entryNumber}: ${String(reason).trim()}`.slice(0, 400),
    lines: flippedLines,
  })
}

export function parseJournalLines(entry) {
  try {
    const arr = JSON.parse(entry?.linesJson || '[]')
    if (Array.isArray(arr) && arr.length) return arr
  } catch {
    // ignore malformed JSON
  }
  return [
    { account: entry?.debitAccount || 'Debit', debit: Number(entry?.totalDebit || 0), credit: 0 },
    { account: entry?.creditAccount || 'Credit', debit: 0, credit: Number(entry?.totalCredit || 0) },
  ]
}
