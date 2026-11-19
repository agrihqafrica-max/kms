import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_ROLE_PRESETS,
  allocateLandedCost,
  blindStockProjection,
  buildInventoryValuationCsv,
  buildReorderRecommendations,
  classifyStockVelocity,
  computeAvailableStock,
  computeGrnSettlement,
  computePosSaleTotals,
  computeStockHealthSummary,
  enqueueOfflineSale,
  evaluateChurnRisk,
  evaluateSupplierScore,
  selectAiModelForMode,
} from '../src/lib/kmsDomain.js'

test('selectAiModelForMode permits only free-tier Gemini models', () => {
  assert.equal(selectAiModelForMode('fast'), 'gemini-3.1-flash-lite')
  assert.equal(selectAiModelForMode('standard'), 'gemini-4-hydrogen')
  assert.equal(selectAiModelForMode('search'), 'gemini-4-hydrogen')
  assert.equal(selectAiModelForMode('maps'), 'gemini-4-hydrogen')
  assert.equal(selectAiModelForMode('gemini-4-carbon'), 'gemini-4-hydrogen')
  assert.ok(AI_ROLE_PRESETS.length >= 4)
})

test('classifyStockVelocity identifies fast reorder SKUs and dead stock', () => {
  const fastItem = classifyStockVelocity({ unitCost: 210, retailPrice: 380, stockQuantity: 3, reorderLevel: 12 })
  assert.equal(fastItem.velocity, 'fast')
  assert.equal(fastItem.needsReorder, true)
  assert.equal(fastItem.suggestedOrderQty, 21)

  const deadItem = classifyStockVelocity({ unitCost: 400, retailPrice: 700, stockQuantity: 40, reorderLevel: 5 })
  assert.equal(deadItem.velocity, 'dead')
  assert.equal(deadItem.needsReorder, false)
})

test('allocateLandedCost distributes freight proportionally across GRN lines', () => {
  const allocated = allocateLandedCost(
    [
      { partNumber: 'A', quantity: 10, unitCost: 100 },
      { partNumber: 'B', quantity: 10, unitCost: 300 },
    ],
    400,
  )
  assert.equal(allocated[0].allocatedExtra, 100)
  assert.equal(allocated[0].newUnitCost, 110)
  assert.equal(allocated[1].allocatedExtra, 300)
  assert.equal(allocated[1].newUnitCost, 330)
})

test('computePosSaleTotals applies 16% VAT only when complianceMode is etims_vat', () => {
  const cart = [{ retailPrice: 1000, quantity: 2 }]
  const simple = computePosSaleTotals(cart, 200, 'simplified')
  assert.deepEqual(simple, { subtotal: 2000, discountAmount: 200, vatAmount: 0, totalAmount: 1800 })

  const etims = computePosSaleTotals(cart, 200, 'etims_vat')
  assert.deepEqual(etims, { subtotal: 2000, discountAmount: 200, vatAmount: 288, totalAmount: 2088 })
})

test('enqueueOfflineSale prevents duplicate transactions by idempotencyKey', () => {
  const q1 = enqueueOfflineSale([], { idempotencyKey: 'tx-100', totalAmount: 550 })
  const q2 = enqueueOfflineSale(q1, { idempotencyKey: 'tx-100', totalAmount: 550 })
  assert.equal(q2.length, 1)
  assert.equal(q2[0].syncStatus, 'pending')
})

test('evaluateChurnRisk flags high overdue/dormant wholesale accounts', () => {
  assert.equal(evaluateChurnRisk(25, 50000, 10000), 'High')
  assert.equal(evaluateChurnRisk(5, 50000, 46000), 'High')
  assert.equal(evaluateChurnRisk(14, 50000, 10000), 'Medium')
  assert.equal(evaluateChurnRisk(4, 50000, 12000), 'Low')
})

test('blindStockProjection strips exact stockQuantity and unitCost', () => {
  const projected = blindStockProjection({
    id: 'sku-1',
    partName: 'Chain Kit',
    partNumber: 'BJ-150',
    unitCost: 1450,
    retailPrice: 2200,
    stockQuantity: 18,
  })
  assert.equal('unitCost' in projected, false)
  assert.equal('stockQuantity' in projected, false)
  assert.equal(projected.availabilityBadge, 'In Stock (Ready)')
})

test('computeAvailableStock clamps reserved stock and computes pack equivalents', () => {
  const stock = computeAvailableStock({ stockQuantity: 25, reservedQuantity: 5, packSize: 10, uom: 'Box' })
  assert.deepEqual(stock, {
    onHand: 25,
    reserved: 5,
    available: 20,
    packSize: 10,
    uom: 'Box',
    packEquivalent: 2,
  })
  const clamped = computeAvailableStock({ stockQuantity: 3, reservedQuantity: 9 })
  assert.equal(clamped.reserved, 3)
  assert.equal(clamped.available, 0)
})

test('buildReorderRecommendations flags open PO coverage and sorts critical uncovered items first', () => {
  const inv = [
    { id: '1', branchId: 'b1', partNumber: 'SKU-LOW', partName: 'Spark Plug', stockQuantity: 2, reorderLevel: 10, unitCost: 200, retailPrice: 350 },
    { id: '2', branchId: 'b1', partNumber: 'SKU-ZERO', partName: 'Clutch Plate', stockQuantity: 0, reorderLevel: 6, unitCost: 500, retailPrice: 900 },
    { id: '3', branchId: 'b1', partNumber: 'SKU-OK', partName: 'Brake Shoe', stockQuantity: 18, reorderLevel: 5, unitCost: 300, retailPrice: 550 },
  ]
  const pos = [
    { id: 'po-1', branchId: 'b1', status: 'Approved', itemsSummary: 'SKU-LOW x 20' },
  ]
  const queue = buildReorderRecommendations(inv, pos)
  assert.equal(queue.length, 2)
  assert.equal(queue[0].item.partNumber, 'SKU-ZERO')
  assert.equal(queue[0].priority, 'critical')
  assert.equal(queue[0].isCoveredByOpenPo, false)
  assert.equal(queue[1].item.partNumber, 'SKU-LOW')
  assert.equal(queue[1].isCoveredByOpenPo, true)
})

test('computeGrnSettlement distinguishes PartiallyReceived vs Received and sums landed costs', () => {
  const partial = computeGrnSettlement({
    orderedQty: 20,
    previouslyReceivedQty: 0,
    receivedGoodQty: 12,
    damagedQty: 2,
    baseCost: 10000,
    freightCost: 600,
    customsCost: 300,
    handlingCost: 100,
  })
  assert.equal(partial.newStatus, 'PartiallyReceived')
  assert.equal(partial.remainingBackorder, 8)
  assert.equal(partial.hasDiscrepancy, true)
  assert.equal(partial.totalLandedCost, 11000)

  const complete = computeGrnSettlement({
    orderedQty: 20,
    previouslyReceivedQty: 12,
    receivedGoodQty: 8,
    damagedQty: 0,
    baseCost: 10000,
    freightCost: 600,
    customsCost: 300,
    handlingCost: 100,
  })
  assert.equal(complete.newStatus, 'Received')
  assert.equal(complete.totalGoodReceived, 20)
  assert.equal(complete.unitLandedCost, 550)
  assert.equal(complete.hasDiscrepancy, false)
})

test('computeStockHealthSummary and buildInventoryValuationCsv produce accurate totals and RFC-4180 CSV', () => {
  const inv = [
    { partNumber: 'A-1', partName: 'Piston, "STD"', brand: 'Honda', qualityGrade: 'OEM', binLocation: 'A-01', stockQuantity: 10, reservedQuantity: 2, reorderLevel: 4, unitCost: 1000, retailPrice: 1500, velocityClass: 'normal', blindListed: true },
    { partNumber: 'B-2', partName: 'Tyre 2.75-17', brand: 'Kenda', qualityGrade: 'Genuine', binLocation: 'D-04', stockQuantity: 40, reservedQuantity: 0, reorderLevel: 5, unitCost: 2000, retailPrice: 3000, velocityClass: 'dead', blindListed: false },
  ]
  const summary = computeStockHealthSummary(inv)
  assert.equal(summary.totalUnits, 50)
  assert.equal(summary.reservedUnits, 2)
  assert.equal(summary.availableUnits, 48)
  assert.equal(summary.costValuation, 90000)
  assert.equal(summary.deadStockCount, 1)
  assert.equal(summary.deadStockCapital, 80000)

  const csv = buildInventoryValuationCsv(inv)
  const lines = csv.split('\n')
  assert.equal(lines.length, 3)
  assert.match(lines[1], /"Piston, ""STD"""/)
  assert.ok(evaluateSupplierScore({ fillRatePct: 97, defectRatePct: 0.5, leadTimeDays: 1 }).tier === 'Preferred')
})

