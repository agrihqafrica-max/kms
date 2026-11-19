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
      'You are the Financial & Margin Guardian for KenyaMoto Supply Hub. Analyze KES gross margins, daily expenses, landed cost impact, cash variance, KRA eTIMS VAT readiness, and flag payout or discount risks before owner approval.',
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
  list.push({
    ...salePayload,
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

