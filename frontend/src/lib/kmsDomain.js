export const ALLOWED_AI_MODELS = {
  fast: 'gemini-3.1-flash-lite',
  standard: 'gemini-4-hydrogen',
  search: 'gemini-4-hydrogen',
  maps: 'gemini-4-hydrogen',
}

export const AI_ROLE_PRESETS = [
  {
    id: 'parts_specialist',
    label: 'Parts & Fitment Specialist',
    systemInstruction:
      'You are a Kenya motorcycle spare parts specialist covering Bajaj Boxer BM150, TVS HLX 125/150, Honda Ace 125, Skygo SG150, and Hero Hunter. Help verify OEM cross-references, fitment compatibility, and KES pricing clearly and concisely.',
  },
  {
    id: 'margin_guardian',
    label: 'Financial & Margin Guardian',
    systemInstruction:
      'You are the Financial & Margin Guardian for Kenya Motorcycle Spare Parts General. Analyze KES gross margins, daily expenses, landed cost impact, cash variance, KRA eTIMS VAT readiness, and flag payout or discount risks before owner approval.',
  },
  {
    id: 'procurement_copilot',
    label: 'Inventory & Procurement Co-Pilot',
    systemInstruction:
      'You are the Inventory & Procurement Co-Pilot. Prioritize low-stock SKUs, calculate reorder quantities, identify dead stock for markdown or inter-branch transfer, and prepare concise purchase order drafts.',
  },
  {
    id: 'logistics_dispatch',
    label: 'Logistics & Rider Dispatch Coordinator',
    systemInstruction:
      'You are the Nairobi & regional spare-parts dispatch coordinator. Assist with branch transfers, boda-boda rider routing, matatu parcel shuttles, and finding nearby wholesalers and garages.',
  },
]

export function selectAiModelForMode(mode) {
  return ALLOWED_AI_MODELS[mode] || ALLOWED_AI_MODELS.standard
}

export function classifyStockVelocity(item) {
  const qty = Number(item?.stockQuantity ?? 0)
  const reorder = Number(item?.reorderLevel ?? 0)
  const unitCost = Number(item?.unitCost ?? 0)
  const retail = Number(item?.retailPrice ?? 0)
  const marginPct = retail > 0 ? Math.round(((retail - unitCost) / retail) * 100) : 0
  const explicit = item?.velocityClass

  let velocity = explicit || 'normal'
  if (!explicit) {
    if (qty <= reorder) velocity = 'fast'
    else if (qty > Math.max(reorder * 4, 25)) velocity = 'dead'
    else if (qty > Math.max(reorder * 2.5, 16)) velocity = 'slow'
  }

  const needsReorder = qty <= reorder
  const suggestedOrderQty = needsReorder ? Math.max(reorder * 2 - qty, 5) : 0
  const estimatedReorderCost = suggestedOrderQty * unitCost

  return {
    velocity,
    needsReorder,
    suggestedOrderQty,
    estimatedReorderCost,
    marginPct,
  }
}

export function allocateLandedCost(lines, additionalCharges) {
  const extra = Math.max(Number(additionalCharges || 0), 0)
  const validLines = Array.isArray(lines)
    ? lines.filter(l => Number(l?.quantity || 0) > 0 && Number(l?.unitCost || 0) >= 0)
    : []

  const totalBaseValue = validLines.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.unitCost),
    0,
  )

  return validLines.map(line => {
    const qty = Number(line.quantity)
    const unitCost = Number(line.unitCost)
    const lineValue = qty * unitCost
    const share = totalBaseValue > 0 ? lineValue / totalBaseValue : 1 / validLines.length
    const allocatedExtra = Math.round(extra * share * 100) / 100
    const newUnitCost = Math.round((unitCost + allocatedExtra / qty) * 100) / 100
    return {
      ...line,
      allocatedExtra,
      newUnitCost,
    }
  })
}

export function computePosSaleTotals(cart, discountAmount = 0, complianceMode = 'simplified') {
  const subtotal = (Array.isArray(cart) ? cart : []).reduce(
    (sum, row) => sum + Number(row.retailPrice ?? row.retail_price ?? 0) * Number(row.quantity || 0),
    0,
  )
  const discount = Math.min(Math.max(Number(discountAmount || 0), 0), subtotal)
  const net = Math.max(Math.round((subtotal - discount) * 100) / 100, 0)
  const vatRate = complianceMode === 'etims_vat' ? 0.16 : 0
  const vatAmount = Math.round(net * vatRate * 100) / 100
  const totalAmount = Math.round((net + vatAmount) * 100) / 100

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discount * 100) / 100,
    vatAmount,
    totalAmount,
  }
}

export function enqueueOfflineSale(queue, salePayload) {
  const list = Array.isArray(queue) ? [...queue] : []
  const key = salePayload?.idempotencyKey
  if (!key) throw new Error('Offline sale requires an idempotencyKey')
  if (list.some(entry => entry.idempotencyKey === key)) return list
  const maxSeq = list.reduce((max, entry) => Math.max(max, Number(entry?.clientSequence || 0)), 0)
  list.push({
    ...salePayload,
    deviceId: salePayload.deviceId || 'DEV-COUNTER-01',
    clientSequence: salePayload.clientSequence || maxSeq + 1,
    queuedAt: salePayload.queuedAt || new Date().toISOString(),
    syncStatus: 'pending',
  })
  return list
}

export function evaluateChurnRisk(lastOrderDaysAgo, creditLimit, outstandingBalance) {
  const days = Number(lastOrderDaysAgo || 0)
  const limit = Number(creditLimit || 0)
  const balance = Number(outstandingBalance || 0)
  const utilization = limit > 0 ? balance / limit : 0

  if (days >= 21 || utilization >= 0.9) return 'High'
  if (days >= 11 || utilization >= 0.65) return 'Medium'
  return 'Low'
}

export function blindStockProjection(item, areaLabel = 'Nairobi CBD') {
  const qty = Number(item?.stockQuantity ?? 0)
  return {
    id: item?.id,
    partName: item?.partName,
    partNumber: item?.partNumber,
    category: item?.category || 'General',
    compatibleModels: item?.compatibleModels || 'Universal',
    availabilityBadge: qty > 5 ? 'In Stock (Ready)' : qty > 0 ? 'Low Availability' : 'Out of Stock',
    areaLabel,
    retailPrice: Number(item?.retailPrice ?? 0),
    deliveryEta: qty > 5 ? '45–90 mins via Rider' : 'Same-day confirmation',
  }
}

export function computeAvailableStock(item) {
  const onHand = Math.max(0, Math.trunc(Number(item?.stockQuantity ?? 0)))
  const rawReserved = Math.max(0, Math.trunc(Number(item?.reservedQuantity ?? 0)))
  const reserved = Math.min(rawReserved, onHand)
  const available = Math.max(0, onHand - reserved)
  const packSize = Math.max(1, Math.trunc(Number(item?.packSize ?? 1)))
  const uom = item?.uom || 'Piece'
  const packEquivalent = packSize > 1 ? Math.floor(available / packSize) : available
  return { onHand, reserved, available, packSize, uom, packEquivalent }
}

export function buildReorderRecommendations(inventory, purchaseOrders = []) {
  const items = Array.isArray(inventory) ? inventory : []
  const pos = Array.isArray(purchaseOrders) ? purchaseOrders : []
  const openPos = pos.filter(po => ['Pending', 'Approved', 'PartiallyReceived'].includes(po?.status))

  return items
    .map(item => {
      const metrics = classifyStockVelocity(item)
      if (!metrics.needsReorder) return null
      const skuToken = String(item?.partNumber || '').toLowerCase()
      const nameToken = String(item?.partName || '').toLowerCase()
      const isCoveredByOpenPo = openPos.some(po => {
        if (po?.branchId && item?.branchId && po.branchId !== item.branchId) return false
        const summary = String(po?.itemsSummary || '').toLowerCase()
        return (skuToken && summary.includes(skuToken)) || (nameToken && summary.includes(nameToken))
      })
      const onHand = Math.max(0, Math.trunc(Number(item?.stockQuantity ?? 0)))
      const reorderLevel = Math.max(0, Math.trunc(Number(item?.reorderLevel ?? 0)))
      const shortage = Math.max(0, reorderLevel - onHand)
      const priority = onHand === 0 || onHand <= Math.floor(reorderLevel * 0.4) ? 'critical' : 'high'
      return {
        item,
        metrics,
        shortage,
        priority,
        isCoveredByOpenPo,
        suggestedOrderQty: metrics.suggestedOrderQty,
        estimatedCost: Math.round(metrics.estimatedReorderCost * 100) / 100,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.isCoveredByOpenPo !== b.isCoveredByOpenPo) return a.isCoveredByOpenPo ? 1 : -1
      if (a.priority !== b.priority) return a.priority === 'critical' ? -1 : 1
      return b.shortage - a.shortage
    })
}

export function computeGrnSettlement({
  orderedQty = 10,
  previouslyReceivedQty = 0,
  receivedGoodQty = 0,
  damagedQty = 0,
  baseCost = 0,
  freightCost = 0,
  customsCost = 0,
  handlingCost = 0,
}) {
  const ordered = Math.max(1, Math.trunc(Number(orderedQty || 1)))
  const prevGood = Math.max(0, Math.trunc(Number(previouslyReceivedQty || 0)))
  const goodNow = Math.max(0, Math.trunc(Number(receivedGoodQty || 0)))
  const damagedNow = Math.max(0, Math.trunc(Number(damagedQty || 0)))

  const totalGoodReceived = prevGood + goodNow
  const newStatus = totalGoodReceived >= ordered ? 'Received' : 'PartiallyReceived'
  const extraCharges =
    Math.round(
      (Math.max(0, Number(freightCost || 0)) +
        Math.max(0, Number(customsCost || 0)) +
        Math.max(0, Number(handlingCost || 0))) *
        100,
    ) / 100
  const totalLandedCost = Math.round((Math.max(0, Number(baseCost || 0)) + extraCharges) * 100) / 100
  const effectiveDenom = totalGoodReceived > 0 ? totalGoodReceived : ordered
  const unitLandedCost = Math.round((totalLandedCost / effectiveDenom) * 100) / 100
  const remainingBackorder = Math.max(0, ordered - totalGoodReceived)
  const hasDiscrepancy = damagedNow > 0 || remainingBackorder > 0

  return {
    orderedQty: ordered,
    goodNow,
    damagedNow,
    totalGoodReceived,
    remainingBackorder,
    newStatus,
    extraCharges,
    totalLandedCost,
    unitLandedCost,
    hasDiscrepancy,
  }
}

export function computeStockHealthSummary(inventory) {
  const items = Array.isArray(inventory) ? inventory : []
  let totalUnits = 0
  let reservedUnits = 0
  let availableUnits = 0
  let costValuation = 0
  let retailValuation = 0
  let reorderAlertCount = 0
  let slowStockCount = 0
  let deadStockCount = 0
  let deadStockCapital = 0

  for (const item of items) {
    const stock = computeAvailableStock(item)
    const unitCost = Math.max(0, Number(item?.unitCost ?? 0))
    const retailPrice = Math.max(0, Number(item?.retailPrice ?? 0))
    const metrics = classifyStockVelocity(item)

    totalUnits += stock.onHand
    reservedUnits += stock.reserved
    availableUnits += stock.available
    const itemCostVal = stock.onHand * unitCost
    costValuation += itemCostVal
    retailValuation += stock.onHand * retailPrice

    if (metrics.needsReorder) reorderAlertCount += 1
    if (metrics.velocity === 'slow') slowStockCount += 1
    if (metrics.velocity === 'dead') {
      deadStockCount += 1
      deadStockCapital += itemCostVal
    }
  }

  const potentialProfit = Math.max(0, retailValuation - costValuation)
  const grossMarginPct = retailValuation > 0 ? Math.round((potentialProfit / retailValuation) * 100) : 0

  return {
    skuCount: items.length,
    totalUnits,
    reservedUnits,
    availableUnits,
    costValuation: Math.round(costValuation * 100) / 100,
    retailValuation: Math.round(retailValuation * 100) / 100,
    potentialProfit: Math.round(potentialProfit * 100) / 100,
    grossMarginPct,
    reorderAlertCount,
    slowStockCount,
    deadStockCount,
    deadStockCapital: Math.round(deadStockCapital * 100) / 100,
  }
}

export function evaluateSupplierScore(supplier) {
  const fill = Math.min(100, Math.max(0, Number(supplier?.fillRatePct ?? 95)))
  const defect = Math.min(100, Math.max(0, Number(supplier?.defectRatePct ?? 1)))
  const lead = Math.max(0, Number(supplier?.leadTimeDays ?? 2))
  const raw = Math.round(Math.max(0, Math.min(100, fill - defect * 3 - Math.max(0, lead - 2) * 1.5)))
  const tier = raw >= 90 ? 'Preferred' : raw >= 75 ? 'Standard' : 'Watchlist'
  return { score: raw, tier }
}

function escapeCsvCell(value) {
  const str = String(value ?? '')
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildInventoryValuationCsv(inventory) {
  const headers = [
    'PartNumber',
    'PartName',
    'Brand',
    'QualityGrade',
    'Category',
    'BinLocation',
    'UoM',
    'PackSize',
    'OnHand',
    'Reserved',
    'Available',
    'ReorderLevel',
    'Velocity',
    'UnitCostKES',
    'RetailPriceKES',
    'CostValuationKES',
    'FitmentConfidence',
    'BlindListed',
  ]
  const rows = (Array.isArray(inventory) ? inventory : []).map(item => {
    const stock = computeAvailableStock(item)
    const velocity = classifyStockVelocity(item).velocity
    const costValuation = Math.round(stock.onHand * Number(item?.unitCost ?? 0) * 100) / 100
    return [
      item?.partNumber || '',
      item?.partName || '',
      item?.brand || 'Standard',
      item?.qualityGrade || 'Aftermarket_A',
      item?.category || 'General',
      item?.binLocation || 'UNASSIGNED',
      stock.uom,
      stock.packSize,
      stock.onHand,
      stock.reserved,
      stock.available,
      Number(item?.reorderLevel ?? 0),
      velocity,
      Number(item?.unitCost ?? 0),
      Number(item?.retailPrice ?? 0),
      costValuation,
      item?.fitmentConfidence || 'verified_fit',
      Boolean(item?.blindListed),
    ]
      .map(escapeCsvCell)
      .join(',')
  })
  return [headers.join(','), ...rows].join('\n')
}

export function classifyAbcInventory(inventory = [], stockMovements = []) {
  const items = Array.isArray(inventory) ? inventory : []
  const movements = Array.isArray(stockMovements) ? stockMovements : []
  if (!items.length) return {}

  const soldQtyByItem = new Map()
  for (const m of movements) {
    if (m?.movementType === 'sale' && m?.itemId) {
      soldQtyByItem.set(m.itemId, (soldQtyByItem.get(m.itemId) || 0) + Math.abs(Number(m.quantityDelta || 0)))
    }
  }

  const scored = items.map(item => {
    const soldUnits = soldQtyByItem.get(item.id) || 0
    const retail = Math.max(0, Number(item?.retailPrice || 0))
    const stockCostVal = Math.max(0, Number(item?.stockQuantity || 0)) * Math.max(0, Number(item?.unitCost || 0))
    const movementValue = soldUnits * retail
    const basisValue = movementValue > 0 ? movementValue : stockCostVal
    return { item, basisValue, soldUnits }
  })

  scored.sort((a, b) => b.basisValue - a.basisValue)
  const totalBasis = scored.reduce((s, r) => s + r.basisValue, 0)
  const result = {}
  let cumulative = 0

  for (let idx = 0; idx < scored.length; idx += 1) {
    const entry = scored[idx]
    cumulative += entry.basisValue
    const sharePct = totalBasis > 0 ? (cumulative / totalBasis) * 100 : ((idx + 1) / scored.length) * 100
    let abcTier = 'C'
    if (idx === 0 || sharePct <= 80) abcTier = 'A'
    else if (sharePct <= 95) abcTier = 'B'
    result[entry.item.id] = {
      abcTier,
      basisValue: Math.round(entry.basisValue * 100) / 100,
      cumulativeSharePct: Math.round(sharePct * 10) / 10,
      soldUnits: entry.soldUnits,
    }
  }
  return result
}

export function validateSplitPayments(payments = [], totalAmount = 0) {
  const due = Math.round(Math.max(0, Number(totalAmount || 0)) * 100) / 100
  if (due <= 0) {
    return { valid: false, error: 'Sale total must be greater than zero.', normalizedPayments: [], totalTendered: 0, changeDue: 0, primaryMethod: 'cash' }
  }
  const allowed = ['cash', 'mobile_money_reference', 'bank_reference', 'card_reference', 'credit']
  const list = Array.isArray(payments) ? payments.filter(p => Number(p?.amount || 0) > 0) : []
  if (!list.length) {
    return { valid: false, error: 'At least one positive payment tender line is required.', normalizedPayments: [], totalTendered: 0, changeDue: 0, primaryMethod: 'cash' }
  }

  let totalTendered = 0
  let cashTendered = 0
  const normalizedPayments = []
  for (const row of list) {
    const method = allowed.includes(row.method) ? row.method : 'cash'
    const amount = Math.round(Number(row.amount || 0) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) {
      return { valid: false, error: 'Each split tender line must be positive.', normalizedPayments: [], totalTendered: 0, changeDue: 0, primaryMethod: 'cash' }
    }
    if (method === 'cash') cashTendered += amount
    totalTendered = Math.round((totalTendered + amount) * 100) / 100
    normalizedPayments.push({
      method,
      amount,
      reference: String(row.reference || '').trim().slice(0, 80),
    })
  }

  if (totalTendered + 0.005 < due) {
    return {
      valid: false,
      error: `Split tenders (KES ${totalTendered}) are short of total KES ${due}.`,
      normalizedPayments,
      totalTendered,
      changeDue: 0,
      primaryMethod: normalizedPayments[0].method,
    }
  }

  const changeDue = Math.round(Math.max(0, totalTendered - due) * 100) / 100
  if (changeDue > cashTendered + 0.005) {
    return {
      valid: false,
      error: 'Over-tender / change cannot exceed the cash tender portion.',
      normalizedPayments,
      totalTendered,
      changeDue,
      primaryMethod: normalizedPayments[0].method,
    }
  }

  // Allocate net revenue settlement per tender after cash change return
  const settledPayments = normalizedPayments.map(p => ({ ...p }))
  if (changeDue > 0) {
    const cashIdx = settledPayments.findIndex(p => p.method === 'cash')
    if (cashIdx >= 0) {
      settledPayments[cashIdx].amount = Math.round(Math.max(0, settledPayments[cashIdx].amount - changeDue) * 100) / 100
    }
  }

  return {
    valid: true,
    error: null,
    normalizedPayments: settledPayments.filter(p => p.amount > 0),
    totalTendered,
    changeDue,
    primaryMethod: normalizedPayments.length > 1 ? 'split' : normalizedPayments[0].method,
  }
}

export function detectOutboxConflict({ queuedSale, inventory = [], revokedDeviceIds = [] }) {
  const reasons = []
  if (!queuedSale) return { hasConflict: false, reasons }

  if (queuedSale.deviceId && Array.isArray(revokedDeviceIds) && revokedDeviceIds.includes(queuedSale.deviceId)) {
    reasons.push(`Device ${queuedSale.deviceId} was revoked before sync — remote wipe required.`)
  }

  const lines = Array.isArray(queuedSale.cart) ? queuedSale.cart : []
  for (const line of lines) {
    const item = inventory.find(i => i.id === line.id || (line.partNumber && i.partNumber === line.partNumber))
    if (!item) {
      reasons.push(`SKU ${line.partNumber || line.id} no longer exists in branch stock.`)
      continue
    }
    const { available } = computeAvailableStock(item)
    const requested = Math.max(1, Math.trunc(Number(line.quantity || 1)))
    if (available < requested) {
      reasons.push(`Insufficient stock for ${item.partNumber}: requested ${requested}, available ${available}.`)
    }
    const snapshotPrice = Number(line.unitPriceSnapshot ?? line.retailPrice ?? 0)
    const livePrice = Number(item.retailPrice ?? 0)
    if (snapshotPrice > 0 && Math.abs(snapshotPrice - livePrice) > 0.01) {
      reasons.push(`Price drift on ${item.partNumber}: queued at KES ${snapshotPrice}, current KES ${livePrice}.`)
    }
  }

  return {
    hasConflict: reasons.length > 0,
    reasons,
  }
}

export function scoreAndRankRfqs(quotes = [], suppliers = []) {
  const supMap = new Map((Array.isArray(suppliers) ? suppliers : []).map(s => [s.id, s]))
  return (Array.isArray(quotes) ? quotes : [])
    .map(q => {
      const sup = supMap.get(q.supplierId)
      const supScore = sup ? evaluateSupplierScore(sup).score : 80
      const unitPrice = Math.max(1, Number(q.quotedUnitPrice || 1))
      const leadDays = Math.max(0, Number(q.leadTimeDays ?? sup?.leadTimeDays ?? 3))
      const combinedScore = Math.round((supScore * 0.55 + Math.max(0, 100 - leadDays * 5) * 0.25 + (10000 / unitPrice) * 0.2) * 10) / 10
      return { ...q, supplierScore: supScore, combinedScore }
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
}

export const CONTAINER_STAGE_ORDER = ['Booked', 'Cleared', 'In Transit', 'Arrived', 'Godown Received']


