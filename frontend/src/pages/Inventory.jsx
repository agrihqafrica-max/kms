import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTenant } from '../tenancy/context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney } from '../lib/format.js'
import {
  CONTAINER_STAGE_ORDER,
  buildInventoryValuationCsv,
  buildReorderRecommendations,
  classifyAbcInventory,
  classifyStockVelocity,
  computeAvailableStock,
  computeGrnSettlement,
  computeStockHealthSummary,
  evaluateSupplierScore,
  scoreAndRankRfqs,
} from '../lib/kmsDomain.js'
import {
  generateZplBarcodeLabel,
  parseCatalogueCsvAndDetectDuplicates,
  parseSupplierCsvImport,
} from '../lib/platformGovernance.js'
import {
  compressImageFile,
  listMediaAttachments,
  removeLocalMediaAttachment,
  saveLocalMediaAttachment,
} from '../lib/mediaVault.js'

const VALID_INVENTORY_TABS = ['catalogue', 'locations', 'reorder', 'procurement', 'counts', 'fitment']

const QUALITY_LABELS = {
  OEM: 'OEM',
  Genuine: 'Genuine',
  Aftermarket_A: 'Aftermarket A',
  Aftermarket_B: 'Aftermarket B',
}

const FITMENT_LABELS = {
  verified_fit: 'Verified fit',
  likely_fit: 'Likely fit',
  requires_confirmation: 'Verify fitment',
}

function velocityTagClass(velocity) {
  if (velocity === 'fast') return 'status-tag danger'
  if (velocity === 'normal') return 'status-tag ok'
  if (velocity === 'slow') return 'status-tag warn'
  return 'status-tag muted'
}

function poStatusTagClass(status) {
  if (status === 'Received') return 'status-tag ok'
  if (status === 'PartiallyReceived' || status === 'Approved') return 'status-tag warn'
  if (status === 'Rejected') return 'status-tag danger'
  return 'status-tag muted'
}

export default function Inventory() {
  const { data: { context } } = useTenant()
  const {
    activeBranchId,
    branches,
    inventory,
    stockMovements,
    purchaseOrders,
    suppliers,
    stockCounts,
    locations = [],
    addLocation,
    bikeModels = [],
    addBikeModel,
    fitmentMappings = [],
    addFitmentMapping,
    approvalRequests = [],
    requestApproval,
    resolveApprovalRequest,
    purchaseRequisitions = [],
    createPurchaseRequisition,
    resolvePurchaseRequisition,
    supplierQuotes = [],
    createSupplierQuote,
    awardSupplierQuote,
    inboundContainers = [],
    createInboundContainer,
    updateInboundContainer,
    addInventoryItem,
    adjustInventoryStock,
    updateInventoryReservation,
    submitStockCount,
    resolveStockCount,
    toggleBlindListing,
    createPurchaseOrder,
    resolvePurchaseOrder,
    receivePurchaseOrderGrn,
    createSupplier,
    createBranchTransfer,
    breakStockPack,
    importCatalogueRows,
    importSupplierRows,
    returnPurchaseOrderStock,
    appendAuditLog,
  } = useWorkspace()

  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab = VALID_INVENTORY_TABS.includes(rawTab) ? rawTab : 'catalogue'
  const setTab = nextTab => {
    setSearchParams(nextTab === 'catalogue' ? {} : { tab: nextTab }, { replace: true })
  }
  const [search, setSearch] = useState('')
  const [velocityFilter, setVelocityFilter] = useState('all')
  const [abcFilter, setAbcFilter] = useState('all')
  const [showBarcodeSheet, setShowBarcodeSheet] = useState(false)
  const [rfqAwardQty, setRfqAwardQty] = useState(15)
  const [showAddSku, setShowAddSku] = useState(false)
  const [showImportCsv, setShowImportCsv] = useState(false)
  const [showMediaVault, setShowMediaVault] = useState(false)
  const [mediaFiles, setMediaFiles] = useState(() => listMediaAttachments('catalogue'))
  const [mediaPartNumber, setMediaPartNumber] = useState('')
  const [showSupplierCsv, setShowSupplierCsv] = useState(false)
  const [supplierCsvText, setSupplierCsvText] = useState(
    'supplierName,category,area,leadTimeDays,paymentTerms\nMombasa Boda Importers Ltd,Engine & Drivetrain,Mombasa Road,3,Net 14',
  )
  const [supplierCsvReport, setSupplierCsvReport] = useState(null)
  const [csvText, setCsvText] = useState(
    'partNumber,partName,category,brand,barcode,unitCost,retailPrice,stockQuantity,reorderLevel,compatibleModels\nTVS-LED-01,TVS HLX LED Headlamp Unit,Electrical,TVS Genuine,6164008812345,950,1650,12,4,TVS HLX 125/150\nBJ-CSK-150,Duplicate Check Sample,Drivetrain,Bajaj,,1450,2200,5,3,Boxer BM150',
  )
  const [csvReport, setCsvReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [grnDraftByPo, setGrnDraftByPo] = useState({})

  // Google Search Grounding for OEM fitment verification
  const [fitQuery, setFitQuery] = useState('')
  const [fitResult, setFitResult] = useState(null)
  const [fitBusy, setFitBusy] = useState(false)

  const branchRawItems = inventory.filter(item => item.branchId === activeBranchId)
  const health = computeStockHealthSummary(branchRawItems)
  const branchPOs = purchaseOrders.filter(po => po.branchId === activeBranchId)
  const branchMovements = stockMovements.filter(m => m.branchId === activeBranchId)
  const branchCounts = stockCounts.filter(c => c.branchId === activeBranchId)
  const pendingCounts = branchCounts.filter(c => c.status === 'PendingApproval')
  const branchLocations = locations.filter(l => !l.branchId || l.branchId === activeBranchId)
  const stockAdjustmentApprovals = approvalRequests.filter(a => a.requestType === 'stock_adjustment')
  const rankedRfqs = scoreAndRankRfqs(supplierQuotes, suppliers)
  const abcMap = classifyAbcInventory(branchRawItems, branchMovements)

  const branchItems = branchRawItems
    .map(item => ({
      ...item,
      metrics: classifyStockVelocity(item),
      stockView: computeAvailableStock(item),
      abcTier: abcMap[item.id]?.abcTier || 'C',
    }))
    .filter(item => velocityFilter === 'all' || item.metrics.velocity === velocityFilter)
    .filter(item => abcFilter === 'all' || item.abcTier === abcFilter)
    .filter(item => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        item.partName.toLowerCase().includes(q) ||
        item.partNumber.toLowerCase().includes(q) ||
        (item.brand || '').toLowerCase().includes(q) ||
        (item.barcode || '').toLowerCase().includes(q) ||
        (item.oemCrossRefs || '').toLowerCase().includes(q) ||
        (item.compatibleModels || '').toLowerCase().includes(q)
      )
    })

  const reorderQueue = buildReorderRecommendations(branchRawItems, branchPOs)
  const deadOrSlowItems = branchRawItems
    .map(item => ({ ...item, metrics: classifyStockVelocity(item) }))
    .filter(item => item.metrics.velocity === 'dead' || item.metrics.velocity === 'slow')
  const siblingBranch = branches.find(b => b.id !== activeBranchId) || branches[0]

  function getGrnDraft(po) {
    const existing = grnDraftByPo[po.id]
    if (existing) return existing
    const remaining = Math.max(1, Number(po.orderedQty || 10) - Number(po.receivedQty || 0))
    return {
      receivedGoodQty: remaining,
      damagedQty: 0,
      lotNumber: po.lotNumber || `LOT-${po.orderNumber}`,
      freightCost: po.freightCost ?? 500,
      customsCost: po.customsCost ?? 0,
      handlingCost: po.handlingCost ?? 0,
      grnNotes: '',
      targetItemId: branchRawItems[0]?.id || '',
    }
  }

  function updateGrnDraft(po, patch) {
    const current = getGrnDraft(po)
    setGrnDraftByPo(prev => ({ ...prev, [po.id]: { ...current, ...patch } }))
  }

  function exportValuationCsv() {
    const csv = buildInventoryValuationCsv(branchItems)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kenyamoto-inventory-${activeBranchId}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setNotice(`Exported ${branchItems.length} SKU valuation rows to CSV.`)
  }

  async function handleCreateItem(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await addInventoryItem({
        partName: form.get('partName'),
        partNumber: form.get('partNumber'),
        brand: form.get('brand'),
        barcode: form.get('barcode'),
        qualityGrade: form.get('qualityGrade'),
        category: form.get('category'),
        compatibleModels: form.get('compatibleModels'),
        oemCrossRefs: form.get('oemCrossRefs'),
        fitmentConfidence: form.get('fitmentConfidence'),
        uom: form.get('uom'),
        packSize: form.get('packSize'),
        binLocation: form.get('binLocation'),
        unitCost: form.get('unitCost'),
        retailPrice: form.get('retailPrice'),
        stockQuantity: form.get('stockQuantity'),
        reorderLevel: form.get('reorderLevel'),
      })
      event.currentTarget.reset()
      setShowAddSku(false)
      setNotice('Spare part SKU added to Parts Master and branch ledger.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreatePo(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createPurchaseOrder({
        supplierName: form.get('supplierName'),
        itemsSummary: form.get('itemsSummary'),
        orderedQty: form.get('orderedQty'),
        totalCost: form.get('totalCost'),
        freightCharges: form.get('freightCharges'),
      })
      event.currentTarget.reset()
      setNotice('Purchase order staged in Pending state awaiting manager approval.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDraftReorderPo(rec) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const preferredSupplier = suppliers[0]?.supplierName || 'Kirinyaga OEM Distributors Ltd'
      await createPurchaseOrder({
        supplierName: preferredSupplier,
        itemsSummary: `${rec.item.partNumber} (${rec.item.partName}) x ${rec.suggestedOrderQty}`,
        orderedQty: rec.suggestedOrderQty,
        totalCost: rec.estimatedCost,
        freightCharges: 450,
      })
      setNotice(`Drafted Purchase Order for ${rec.item.partNumber} (+${rec.suggestedOrderQty} units).`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeadStockTransfer(item) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const qty = Math.max(1, Math.min(10, Math.floor(item.stockQuantity / 2)))
      await createBranchTransfer({
        destinationBranchName: siblingBranch?.name || 'Industrial Area Depot',
        partSummary: `${item.partNumber} ${item.partName}`,
        quantity: qty,
      })
      setNotice(`Proposed inter-branch transfer of ${qty}x ${item.partNumber} to ${siblingBranch?.name || 'sibling branch'}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmitGrn(event, po) {
    event.preventDefault()
    const draft = getGrnDraft(po)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await receivePurchaseOrderGrn(po.id, draft)
      if (result) {
        setNotice(
          `GRN posted for ${po.orderNumber}: +${result.goodNow} good (${result.newStatus}), Landed ${formatMoney(result.totalLandedCost)}.`,
        )
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateSupplier(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createSupplier({
        supplierName: form.get('supplierName'),
        category: form.get('category'),
        area: form.get('area'),
        leadTimeDays: form.get('leadTimeDays'),
        paymentTerms: form.get('paymentTerms'),
      })
      event.currentTarget.reset()
      setNotice('Verified supplier profile added to procurement registry.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmitCycleCount(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await submitStockCount({
        itemId: form.get('itemId'),
        countedQty: form.get('countedQty'),
        reason: form.get('reason'),
      })
      event.currentTarget.reset()
      setNotice('Cycle count variance proposal queued for manager approval.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleValidateCsv() {
    setError('')
    const report = parseCatalogueCsvAndDetectDuplicates(csvText, branchRawItems)
    setCsvReport(report)
  }

  async function handleCommitCsvImport() {
    if (!csvReport?.validRows?.length) return
    setBusy(true)
    setError('')
    try {
      const res = await importCatalogueRows(csvReport.validRows)
      setNotice(`Imported ${res.imported} new SKU(s); skipped ${csvReport.duplicates.length} duplicate(s).`)
      setCsvReport(null)
      setShowImportCsv(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function downloadZplLabels() {
    if (!branchItems.length) return
    const zpl = branchItems.map(item => generateZplBarcodeLabel(item)).join('\n\n')
    const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kenyamoto-labels-${activeBranchId}.zpl`
    a.click()
    URL.revokeObjectURL(url)
    setNotice(`Generated Zebra ZPL thermal labels for ${branchItems.length} SKU(s).`)
  }

  async function handleCatalogMediaChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const compressed = await compressImageFile(file)
      const record = {
        ...compressed,
        partNumber: mediaPartNumber || branchRawItems[0]?.partNumber || 'GENERAL',
      }
      saveLocalMediaAttachment('catalogue', record)
      setMediaFiles(listMediaAttachments('catalogue'))
      setNotice(`Saved compressed local asset "${record.fileName}" (${record.partNumber}) to browser media vault.`)
      event.target.value = ''
    } catch (err) {
      setError(err?.message || 'Failed to process SKU photo/document.')
    } finally {
      setBusy(false)
    }
  }

  function handleRemoveCatalogMedia(mediaId) {
    removeLocalMediaAttachment('catalogue', mediaId)
    setMediaFiles(listMediaAttachments('catalogue'))
    setNotice('Removed attachment from local media vault.')
  }

  function handleValidateSupplierCsv() {
    setError('')
    const report = parseSupplierCsvImport(supplierCsvText, suppliers)
    setSupplierCsvReport(report)
  }

  async function handleCommitSupplierCsv() {
    if (!supplierCsvReport?.validRows?.length) return
    setBusy(true)
    setError('')
    try {
      const res = await importSupplierRows(supplierCsvReport.validRows)
      setNotice(`Imported ${res.imported} verified supplier(s); skipped ${supplierCsvReport.duplicates.length} duplicate(s).`)
      setSupplierCsvReport(null)
      setShowSupplierCsv(false)
    } catch (err) {
      setError(err?.message || 'Supplier CSV import failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePackBreak(row) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await breakStockPack(row.id, 1)
      setNotice(`Unpacked 1x ${row.partNumber} into +${res.looseUnitsCreated} loose unit(s) (${res.loosePartNumber}).`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handlePurchaseReturn(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await returnPurchaseOrderStock({
        poId: form.get('poId'),
        itemId: form.get('itemId'),
        quantity: form.get('quantity'),
        reason: form.get('reason'),
      })
      event.currentTarget.reset()
      setNotice(`Recorded supplier return of ${res.qty} unit(s) (AP Debit Memo ${formatMoney(res.returnCost)}).`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function verifyPartFitment(event) {
    event.preventDefault()
    if (!fitQuery.trim() || fitBusy) return
    setFitBusy(true)
    setFitResult(null)
    try {
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: fitQuery.trim(),
          context: 'Verify OEM motorcycle spare part cross-reference, bike model fitment, and Kenya retail pricing.',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || 'Search lookup failed')
      setFitResult(data)
    } catch (err) {
      setFitResult({ error: err.message })
    } finally {
      setFitBusy(false)
    }
  }

  async function handleStockAdjustmentProposal(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const itemId = form.get('itemId')
    const reasonCode = form.get('reasonCode')
    const delta = Math.trunc(Number(form.get('quantityDelta') || 0))
    const notes = String(form.get('notes') || '').trim()
    const sku = branchRawItems.find(i => i.id === itemId)
    if (!sku || !delta) return
    setBusy(true)
    setError('')
    try {
      await requestApproval({
        requestType: 'stock_adjustment',
        summary: `${reasonCode.toUpperCase()} ${delta > 0 ? `+${delta}` : delta} on ${sku.partNumber} (${notes || 'Branch adjustment'})`,
        requestedRole: context.role,
        payload: { itemId, quantityDelta: delta, reasonCode, notes },
      })
      event.currentTarget.reset()
      setNotice('Stock adjustment request queued for manager approval.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddLocation(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    addLocation({
      name: form.get('name'),
      kind: form.get('kind'),
      code: form.get('code'),
      branchId: activeBranchId,
    })
    event.currentTarget.reset()
    setNotice('Storage location / bin added.')
  }

  async function handleAddBikeModel(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    addBikeModel({
      make: form.get('make'),
      model: form.get('model'),
      variant: form.get('variant'),
      engineCc: form.get('engineCc'),
      yearRange: form.get('yearRange'),
    })
    event.currentTarget.reset()
    setNotice('Motorcycle model registered.')
  }

  async function handleAddFitment(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    addFitmentMapping({
      partNumber: form.get('partNumber'),
      bikeModelId: form.get('bikeModelId'),
      position: form.get('position'),
      confidence: form.get('confidence'),
      oemCode: form.get('oemCode'),
    })
    event.currentTarget.reset()
    setNotice('Part-to-bike fitment mapping saved.')
  }

  async function handleCreateRequisition(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await createPurchaseRequisition({
      itemsSummary: form.get('itemsSummary'),
      estimatedCost: form.get('estimatedCost'),
    })
    event.currentTarget.reset()
    setNotice('Purchase requisition created.')
  }

  async function handleCreateRfqQuote(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await createSupplierQuote({
      rfqRef: form.get('rfqRef'),
      supplierId: form.get('supplierId'),
      partNumber: form.get('partNumber'),
      quotedUnitPrice: form.get('quotedUnitPrice'),
      leadTimeDays: form.get('leadTimeDays'),
      paymentTerms: form.get('paymentTerms'),
    })
    event.currentTarget.reset()
    setNotice('Supplier RFQ quote logged and scored.')
  }

  async function handleCreateContainer(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await createInboundContainer({
      containerNumber: form.get('containerNumber'),
      originPort: form.get('originPort'),
      shippingLine: form.get('shippingLine'),
      etaDate: form.get('etaDate'),
      itemsSummary: form.get('itemsSummary'),
    })
    event.currentTarget.reset()
    setNotice('Inbound container booked.')
  }

  return (
    <div className="stacked-pages">
      <section className="card no-print">
        <div className="card-head wrap-head">
          <div>
            <p className="eyebrow">Parts Master, Bins &amp; Fitment, Procurement &amp; Stock Integrity</p>
            <h2>Branch Inventory &amp; Supply Control</h2>
          </div>
          <div className="tab-strip" role="tablist" aria-label="Inventory sections">
            {[
              ['catalogue', `Parts Master (${branchRawItems.length})`],
              ['locations', `Bins & Fitment (${branchLocations.length})`],
              ['reorder', `Reorder & Dead Stock (${reorderQueue.length})`],
              ['procurement', `Procurement, RFQ & Containers (${branchPOs.length})`],
              ['counts', `Counts & Adjustments (${pendingCounts.length})`],
              ['fitment', 'OEM Search'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <p>Cost Valuation</p>
            <h3>{formatMoney(health.costValuation)}</h3>
            <small className="tabular">
              {health.totalUnits} on hand · {health.reservedUnits} reserved · {health.availableUnits} avail.
            </small>
          </div>
          <div className="stat-card">
            <p>Retail Value &amp; Margin</p>
            <h3>{formatMoney(health.retailValuation)}</h3>
            <small className="tabular">{health.grossMarginPct}% avg gross margin</small>
          </div>
          <div className="stat-card">
            <p>Reorder Alerts</p>
            <h3>{health.reorderAlertCount}</h3>
            <small>{reorderQueue.filter(r => !r.isCoveredByOpenPo).length} uncovered by open PO</small>
          </div>
          <div className="stat-card">
            <p>Dead-Stock Capital</p>
            <h3>{formatMoney(health.deadStockCapital)}</h3>
            <small>
              {health.deadStockCount} dead SKU(s) · {pendingCounts.length} count review(s)
            </small>
          </div>
        </div>

        {notice && <p className="notice mt-md" role="status">{notice}</p>}
        {error && <p className="form-error mt-md" role="alert">{error}</p>}
      </section>

      {tab === 'catalogue' && (
        <section className="card">
          <div className="card-head wrap-head no-print">
            <div>
              <h2>Parts Master, ABC Tiers &amp; Bin Ledger</h2>
              <p className="muted">
                Track OEM cross-references, ABC value tier, bin placement, UoM packs, barcode labels, and net available stock.
              </p>
            </div>
            <div className="inline-controls">
              <button type="button" onClick={exportValuationCsv}>
                Export Valuation CSV
              </button>
              <button type="button" onClick={() => setShowBarcodeSheet(v => !v)}>
                {showBarcodeSheet ? 'Hide Barcode Labels' : 'Print Barcode Labels'}
              </button>
              <button type="button" onClick={() => setShowMediaVault(v => !v)}>
                {showMediaVault ? 'Close Media Vault' : `SKU Photos (${mediaFiles.length})`}
              </button>
              <button type="button" onClick={() => setShowImportCsv(v => !v)}>
                {showImportCsv ? 'Close CSV Import' : 'Import CSV'}
              </button>
              <button type="button" className="primary" onClick={() => setShowAddSku(v => !v)}>
                {showAddSku ? 'Close SKU Form' : '+ Add Spare Part SKU'}
              </button>
            </div>
          </div>

          {showMediaVault && (
            <div className="sub-card mb-md no-print">
              <div className="card-head wrap-head">
                <div>
                  <strong>SKU Photos &amp; Spec Sheet Local Vault (CAT-007 / CAT-008)</strong>
                  <p className="muted">
                    Images are compressed in-browser with SHA-256 digests and cached locally while cloud object storage buckets remain unprovisioned.
                  </p>
                </div>
                <span className="status-tag warn">Local Vault Only (Cloud Bucket Pending)</span>
              </div>
              <div className="form-grid mt-sm">
                <label>
                  Tag Part Number / SKU
                  <select value={mediaPartNumber} onChange={e => setMediaPartNumber(e.target.value)}>
                    <option value="">General Branch Asset</option>
                    {branchRawItems.map(sku => (
                      <option key={sku.id} value={sku.partNumber}>
                        {sku.partNumber} — {sku.partName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Capture or Upload Image / PDF Spec
                  <input type="file" accept="image/*,.pdf" onChange={e => void handleCatalogMediaChange(e)} disabled={busy} />
                </label>
              </div>
              {mediaFiles.length > 0 && (
                <div className="po-list mt-sm">
                  {mediaFiles.map(m => (
                    <div className="sub-card" key={m.mediaId}>
                      <div className="card-head wrap-head">
                        <div>
                          <strong>{m.partNumber || 'GENERAL'} · {m.fileName}</strong>
                          <p className="muted mono">{m.mimeType} · {Math.round((m.sizeBytes || 0) / 1024)} KB · SHA {String(m.sha256 || '').slice(0, 12)}…</p>
                        </div>
                        <button type="button" className="btn-sm" onClick={() => handleRemoveCatalogMedia(m.mediaId)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showBarcodeSheet && (
            <div className="sub-card mb-md">
              <div className="card-head wrap-head no-print">
                <strong>Printable Shelf &amp; Packet Barcode Sheet (INV-021)</strong>
                <div className="inline-controls">
                  <button type="button" className="btn-sm" onClick={downloadZplLabels} disabled={!branchItems.length}>
                    Download ZPL (Thermal)
                  </button>
                  <button type="button" className="primary btn-sm" onClick={() => window.print()}>
                    Print Labels
                  </button>
                </div>
              </div>
              <div className="barcode-sheet">
                {branchItems.map(item => (
                  <div className="barcode-label-card" key={`bc-${item.id}`}>
                    <strong>{item.partName}</strong>
                    <small className="mono">{item.partNumber} · Bin {item.binLocation || 'UNASSIGNED'}</small>
                    <div className="barcode-bars" aria-hidden="true">
                      {(item.barcode || item.partNumber).split('').slice(0, 14).map((ch, idx) => (
                        <span key={idx} className={ch.charCodeAt(0) % 2 === 0 ? 'wide' : ''} />
                      ))}
                    </div>
                    <div className="card-head">
                      <span className="mono">{item.barcode || item.partNumber}</span>
                      <strong>{formatMoney(item.retailPrice)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showImportCsv && (
            <div className="sub-card mb-md no-print">
              <strong>Bulk Catalogue CSV Import &amp; Duplicate Detection (CAT-010 / CAT-012)</strong>
              <p className="muted">Columns: partNumber,partName,category,brand,barcode,unitCost,retailPrice,stockQuantity,reorderLevel,compatibleModels</p>
              <textarea rows={4} value={csvText} onChange={e => setCsvText(e.target.value)} />
              <div className="inline-controls">
                <button type="button" onClick={handleValidateCsv}>Validate &amp; Check Duplicates</button>
                {csvReport?.validRows?.length > 0 && (
                  <button type="button" className="primary" disabled={busy} onClick={() => void handleCommitCsvImport()}>
                    Import {csvReport.validRows.length} Valid Row(s)
                  </button>
                )}
              </div>
              {csvReport && (
                <div className="muted">
                  Valid: <strong>{csvReport.validRows.length}</strong> · Duplicates blocked:{' '}
                  <strong>{csvReport.duplicates.length}</strong> ({csvReport.duplicates.map(d => d.partNumber).join(', ') || 'none'}) · Errors:{' '}
                  <strong>{csvReport.errors.length}</strong>
                </div>
              )}
            </div>
          )}

          <div className="filter-bar no-print">
            <label>
              Search SKU, Barcode, OEM Cross-Ref, or Bike Model
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="e.g. BJ-CSK-150, NGK, 616400, Bajaj Boxer…"
              />
            </label>
            <label>
              Velocity Classification
              <select value={velocityFilter} onChange={e => setVelocityFilter(e.target.value)}>
                <option value="all">All Classes ({branchRawItems.length})</option>
                <option value="fast">Fast / Reorder Alert</option>
                <option value="normal">Normal</option>
                <option value="slow">Slow-Moving</option>
                <option value="dead">Dead Stock</option>
              </select>
            </label>
            <label>
              ABC Tier (INV-017)
              <select value={abcFilter} onChange={e => setAbcFilter(e.target.value)}>
                <option value="all">All ABC Tiers</option>
                <option value="A">Class A (Top 80% Value)</option>
                <option value="B">Class B (Next 15%)</option>
                <option value="C">Class C (Long Tail 5%)</option>
              </select>
            </label>
            <span className="muted tabular">Showing {branchItems.length} SKU(s)</span>
          </div>

          {!branchItems.length ? (
            <div className="state-panel">
              <p className="muted">No spare parts match your filter on this branch.</p>
            </div>
          ) : (
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Part &amp; Fitment</th>
                    <th>Bin &amp; UoM</th>
                    <th>Velocity &amp; ABC</th>
                    <th className="num">On Hand / Avail</th>
                    <th className="num">Cost / Retail</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {branchItems.map(row => (
                    <tr key={row.id}>
                      <td>
                        <span className="cell-title">{row.partName}</span>
                        <span className="cell-sub">
                          <span className="mono">{row.partNumber}</span> · {row.brand || 'Standard'} ·{' '}
                          {QUALITY_LABELS[row.qualityGrade] || row.qualityGrade || 'Aftermarket A'} ·{' '}
                          {FITMENT_LABELS[row.fitmentConfidence] || 'Verified fit'}
                        </span>
                        <span className="cell-sub">
                          {row.compatibleModels || row.category}
                          {row.oemCrossRefs ? ` · OEM: ${row.oemCrossRefs}` : ''}
                        </span>
                      </td>
                      <td>
                        <span className="mono">{row.binLocation || 'UNASSIGNED'}</span>
                        <span className="cell-sub">
                          {row.stockView.uom} (Pack {row.stockView.packSize})
                        </span>
                      </td>
                      <td>
                        <div className="inline-controls">
                          <span className={velocityTagClass(row.metrics.velocity)}>
                            {row.metrics.velocity.toUpperCase()}
                          </span>
                          <span className={`abc-badge abc-badge-${row.abcTier.toLowerCase()}`}>
                            ABC-{row.abcTier}
                          </span>
                        </div>
                      </td>
                      <td className="num">
                        <strong>{row.stockView.onHand}</strong>
                        <span className="cell-sub">
                          {row.stockView.reserved} res · {row.stockView.available} avail · min {row.reorderLevel}
                        </span>
                      </td>
                      <td className="num">
                        <strong>{formatMoney(row.retailPrice)}</strong>
                        <span className="cell-sub">
                          Cost {formatMoney(row.unitCost)} · {row.metrics.marginPct}% margin
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-sm"
                            aria-label={`Add 5 units to ${row.partNumber}`}
                            onClick={() => void adjustInventoryStock(row.id, 5, 'Quick stock receipt +5')}
                          >
                            +5
                          </button>
                          <button
                            type="button"
                            className="btn-sm"
                            aria-label={`Remove 1 unit from ${row.partNumber}`}
                            disabled={row.stockQuantity < 1}
                            onClick={() => void adjustInventoryStock(row.id, -1, 'Shrinkage / sample write-off')}
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            className="btn-sm"
                            disabled={row.stockView.available < 1 && row.stockView.reserved < 1}
                            onClick={() =>
                              void updateInventoryReservation(
                                row.id,
                                row.stockView.available > 0 ? row.stockView.reserved + 1 : 0,
                              )
                            }
                          >
                            {row.stockView.available > 0 ? 'Res +1' : 'Release'}
                          </button>
                          <button
                            type="button"
                            className="btn-sm"
                            onClick={() => void toggleBlindListing(row)}
                          >
                            {row.blindListed ? 'Network On' : 'Private'}
                          </button>
                          {row.stockView.packSize > 1 && row.stockView.available >= 1 && (
                            <button
                              type="button"
                              className="btn-sm"
                              disabled={busy}
                              onClick={() => void handlePackBreak(row)}
                            >
                              Unpack 1 ({row.stockView.packSize}u)
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showAddSku && (
            <form className="inventory-form" onSubmit={handleCreateItem}>
              <h3>Register New Spare Part SKU (Parts Master)</h3>
              <div className="form-grid">
                <label>Part Name<input name="partName" required placeholder="Bajaj Boxer Rear Sprocket 42T" /></label>
                <label>Part Number / SKU<input name="partNumber" required placeholder="BJ-SPR-42T" /></label>
                <label>Brand / Manufacturer<input name="brand" placeholder="Bajaj Genuine, NGK, ASK…" defaultValue="Standard" /></label>
                <label>Barcode / EAN<input name="barcode" placeholder="616400..." /></label>
                <label>
                  Quality Grade
                  <select name="qualityGrade" defaultValue="OEM">
                    <option value="OEM">OEM Original</option>
                    <option value="Genuine">Genuine</option>
                    <option value="Aftermarket_A">Aftermarket Grade A</option>
                    <option value="Aftermarket_B">Aftermarket Grade B</option>
                  </select>
                </label>
                <label>Category<input name="category" placeholder="Engine, Brakes, Drivetrain…" defaultValue="General" /></label>
                <label>Compatible Bike Models<input name="compatibleModels" placeholder="Bajaj Boxer BM150, TVS HLX 125" /></label>
                <label>OEM Cross-Reference Codes<input name="oemCrossRefs" placeholder="36DU1007 / DU101220" /></label>
                <label>
                  Fitment Confidence
                  <select name="fitmentConfidence" defaultValue="verified_fit">
                    <option value="verified_fit">Verified Fit</option>
                    <option value="likely_fit">Likely Fit</option>
                    <option value="requires_confirmation">Requires Confirmation</option>
                  </select>
                </label>
                <label>
                  Base Unit (UoM)
                  <select name="uom" defaultValue="Piece">
                    <option value="Piece">Piece</option>
                    <option value="Set">Set</option>
                    <option value="Pair">Pair</option>
                    <option value="Box">Box</option>
                    <option value="Carton">Carton</option>
                  </select>
                </label>
                <label>Pack Size<input name="packSize" type="number" min="1" defaultValue="1" /></label>
                <label>Bin Location<input name="binLocation" placeholder="A1-R04" /></label>
                <label>Buying Cost (KES)<input name="unitCost" type="number" min="1" step="0.01" required /></label>
                <label>Retail Price (KES)<input name="retailPrice" type="number" min="1" step="0.01" required /></label>
                <label>Opening Stock Qty<input name="stockQuantity" type="number" min="0" defaultValue="10" /></label>
                <label>Reorder Threshold<input name="reorderLevel" type="number" min="0" defaultValue="5" /></label>
              </div>
              <div className="inline-controls">
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Save SKU to Branch'}
                </button>
                <button type="button" onClick={() => setShowAddSku(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {tab === 'locations' && (
        <div className="stacked-pages">
          <div className="dashboard-grid">
            <section className="card">
              <h2>Storage Locations &amp; Bin Registry (PLT-004)</h2>
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Bin Code</th>
                      <th>Zone / Location Name</th>
                      <th>Kind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchLocations.map(loc => (
                      <tr key={loc.id}>
                        <td className="mono">{loc.code}</td>
                        <td className="cell-title">{loc.name}</td>
                        <td><span className="status-tag muted">{loc.kind}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form className="inventory-form" onSubmit={handleAddLocation}>
                <h3>Add Storage Bin / Shelf</h3>
                <div className="form-grid">
                  <label>Bin Code<input name="code" required placeholder="B2-R08" /></label>
                  <label>Location Name<input name="name" required placeholder="Electrical & Coils Shelf B2" /></label>
                  <label>
                    Location Kind
                    <select name="kind" defaultValue="Shop Shelf">
                      <option value="Shop Shelf">Shop Shelf</option>
                      <option value="Backroom">Backroom</option>
                      <option value="Godown Bay">Godown Bay</option>
                      <option value="Counter Display">Counter Display</option>
                    </select>
                  </label>
                </div>
                <button className="primary" type="submit">Add Location</button>
              </form>
            </section>

            <section className="card">
              <h2>Motorcycle Models Registry (CAT-003)</h2>
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Make &amp; Model</th>
                      <th>Variant</th>
                      <th className="num">Engine CC</th>
                      <th>Years</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bikeModels.map(bk => (
                      <tr key={bk.id}>
                        <td className="cell-title">{bk.make} {bk.model}</td>
                        <td>{bk.variant || 'Standard'}</td>
                        <td className="num">{bk.engineCc}cc</td>
                        <td className="mono">{bk.yearRange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form className="inventory-form" onSubmit={handleAddBikeModel}>
                <h3>Register Motorcycle Model</h3>
                <div className="form-grid">
                  <label>Make<input name="make" required placeholder="Bajaj / TVS / Honda" /></label>
                  <label>Model<input name="model" required placeholder="Boxer BM150" /></label>
                  <label>Variant<input name="variant" placeholder="HD / X125" /></label>
                  <label>Engine CC<input name="engineCc" type="number" defaultValue="150" /></label>
                  <label>Year Range<input name="yearRange" defaultValue="2018–2026" /></label>
                </div>
                <button className="primary" type="submit">Save Bike Model</button>
              </form>
            </section>
          </div>

          <section className="card">
            <h2>Part-to-Bike Fitment &amp; OEM Equivalence Matrix (CAT-004 / CAT-005)</h2>
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Part Number</th>
                    <th>Motorcycle Fitment</th>
                    <th>Position</th>
                    <th>OEM Ref</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {fitmentMappings.map(fm => (
                    <tr key={fm.id}>
                      <td className="mono">{fm.partNumber}</td>
                      <td className="cell-title">{fm.bikeLabel}</td>
                      <td>{fm.position}</td>
                      <td className="mono">{fm.oemCode || '—'}</td>
                      <td><span className="status-tag ok">{FITMENT_LABELS[fm.confidence] || fm.confidence}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form className="inventory-form" onSubmit={handleAddFitment}>
              <h3>Map SKU to Motorcycle Fitment</h3>
              <div className="form-grid">
                <label>
                  Part Number
                  <select name="partNumber" required>
                    {branchRawItems.map(sku => (
                      <option key={sku.id} value={sku.partNumber}>{sku.partNumber} — {sku.partName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Motorcycle Model
                  <select name="bikeModelId" required>
                    {bikeModels.map(bk => (
                      <option key={bk.id} value={bk.id}>{bk.make} {bk.model}</option>
                    ))}
                  </select>
                </label>
                <label>Assembly Position<input name="position" defaultValue="Direct Replacement" /></label>
                <label>OEM Cross-Ref Code<input name="oemCode" placeholder="36DU1007" /></label>
                <label>
                  Fitment Confidence
                  <select name="confidence" defaultValue="verified_fit">
                    <option value="verified_fit">Verified Fit</option>
                    <option value="likely_fit">Likely Fit</option>
                    <option value="requires_confirmation">Requires Confirmation</option>
                  </select>
                </label>
              </div>
              <button className="primary" type="submit" disabled={!branchRawItems.length || !bikeModels.length}>Save Fitment Link</button>
            </form>
          </section>
        </div>
      )}

      {tab === 'reorder' && (
        <div className="stacked-pages">
          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Automated Reorder Recommendations</h2>
                <p className="muted">
                  SKUs at or below reorder threshold, ranked by priority and open Purchase Order coverage.
                </p>
              </div>
              <span className="status-tag warn">{reorderQueue.length} SKU(s) below threshold</span>
            </div>

            {!reorderQueue.length ? (
              <p className="muted">All SKUs on this branch are stocked above minimum reorder levels.</p>
            ) : (
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>SKU &amp; Part</th>
                      <th>Priority</th>
                      <th className="num">On Hand / Min</th>
                      <th className="num">Suggested Order</th>
                      <th className="num">Est. Cost</th>
                      <th className="num">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reorderQueue.map(rec => (
                      <tr key={rec.item.id}>
                        <td>
                          <span className="cell-title">{rec.item.partName}</span>
                          <span className="cell-sub">
                            <span className="mono">{rec.item.partNumber}</span> · {rec.isCoveredByOpenPo ? 'Open PO in pipeline' : 'Uncovered'}
                          </span>
                        </td>
                        <td>
                          <span className={rec.priority === 'critical' ? 'status-tag danger' : 'status-tag warn'}>
                            {rec.priority === 'critical' ? 'Critical' : 'High'}
                          </span>
                        </td>
                        <td className="num">
                          <strong>{rec.item.stockQuantity}</strong> / {rec.item.reorderLevel}
                        </td>
                        <td className="num">+{rec.suggestedOrderQty} units</td>
                        <td className="num">{formatMoney(rec.estimatedCost)}</td>
                        <td className="num">
                          <button
                            type="button"
                            className="primary btn-sm"
                            disabled={busy}
                            onClick={() => void handleDraftReorderPo(rec)}
                          >
                            {rec.isCoveredByOpenPo ? 'Draft Extra PO' : 'Draft PO'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Dead-Stock &amp; Slow-Mover Capital Recovery</h2>
                <p className="muted">
                  Identify excess inventory tying up working capital and trigger branch rebalancing or markdown reviews.
                </p>
              </div>
              <span className="status-tag muted">Capital at risk: {formatMoney(health.deadStockCapital)}</span>
            </div>

            {!deadOrSlowItems.length ? (
              <p className="muted">No dead or slow-moving SKUs detected on this branch.</p>
            ) : (
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Part &amp; Bin</th>
                      <th>Class</th>
                      <th className="num">On Hand</th>
                      <th className="num">Capital Tied Up</th>
                      <th className="num">Recovery Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deadOrSlowItems.map(item => (
                      <tr key={item.id}>
                        <td>
                          <span className="cell-title">{item.partName}</span>
                          <span className="cell-sub">
                            <span className="mono">{item.partNumber}</span> · Bin {item.binLocation || 'UNASSIGNED'}
                          </span>
                        </td>
                        <td>
                          <span className={velocityTagClass(item.metrics.velocity)}>
                            {item.metrics.velocity.toUpperCase()}
                          </span>
                        </td>
                        <td className="num">{item.stockQuantity}</td>
                        <td className="num">{formatMoney(Number(item.unitCost) * Number(item.stockQuantity))}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn-sm"
                              disabled={busy}
                              onClick={() => void handleDeadStockTransfer(item)}
                            >
                              Propose Branch Transfer
                            </button>
                            <button
                              type="button"
                              className="btn-sm"
                              onClick={() => {
                                void appendAuditLog(
                                  'DEAD_STOCK_MARKDOWN_FLAGGED',
                                  'Inventory',
                                  `Flagged ${item.partNumber} for 15% promotional markdown (KES ${Math.round(item.retailPrice * 0.85)})`,
                                )
                                setNotice(`Logged 15% markdown clearance proposal for ${item.partNumber} to Audit Trail.`)
                              }}
                            >
                              Flag 15% Clearance
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'procurement' && (
        <div className="stacked-pages">
          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Purchase Orders &amp; Partial / Full GRN Receiving</h2>
                <p className="muted">
                  Approve POs, capture partial or damaged deliveries by lot number, and allocate freight, customs, and handling into landed unit cost.
                </p>
              </div>
            </div>

            <div className="po-list">
              {branchPOs.map(po => {
                const draft = getGrnDraft(po)
                const preview = computeGrnSettlement({
                  orderedQty: po.orderedQty || 10,
                  previouslyReceivedQty: po.receivedQty || 0,
                  receivedGoodQty: draft.receivedGoodQty,
                  damagedQty: draft.damagedQty,
                  baseCost: po.totalCost,
                  freightCost: draft.freightCost,
                  customsCost: draft.customsCost,
                  handlingCost: draft.handlingCost,
                })
                const canReceive = po.status === 'Approved' || po.status === 'PartiallyReceived'

                return (
                  <article className="sub-card" key={po.id}>
                    <div className="card-head wrap-head">
                      <div>
                        <div className="inline-controls">
                          <strong className="mono">{po.orderNumber}</strong>
                          <span>— {po.supplierName}</span>
                          <span className={poStatusTagClass(po.status)}>{po.status}</span>
                        </div>
                        <p className="muted mt-xs">
                          {po.itemsSummary}
                        </p>
                        <small className="muted tabular">
                          Ordered: {po.orderedQty || 10} · Received: {po.receivedQty || 0} · Damaged: {po.damagedQty || 0} · Base:{' '}
                          {formatMoney(po.totalCost)} · Landed: <strong>{formatMoney(po.landedCost)}</strong>
                          {po.lotNumber ? ` · Lot: ${po.lotNumber}` : ''}
                        </small>
                      </div>

                      {po.status === 'Pending' && (
                        <div className="inline-controls">
                          <button
                            className="primary btn-sm"
                            type="button"
                            onClick={() => void resolvePurchaseOrder(po.id, 'Approved')}
                          >
                            Approve PO
                          </button>
                          <button
                            type="button"
                            className="btn-sm"
                            onClick={() => void resolvePurchaseOrder(po.id, 'Rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>

                    {canReceive && (
                      <form className="grn-panel" onSubmit={e => void handleSubmitGrn(e, po)}>
                        <div className="form-grid">
                          <label>
                            Received Good Qty
                            <input
                              type="number"
                              min="0"
                              value={draft.receivedGoodQty}
                              onChange={e => updateGrnDraft(po, { receivedGoodQty: e.target.value })}
                            />
                          </label>
                          <label>
                            Damaged / Short Qty
                            <input
                              type="number"
                              min="0"
                              value={draft.damagedQty}
                              onChange={e => updateGrnDraft(po, { damagedQty: e.target.value })}
                            />
                          </label>
                          <label>
                            Lot / Batch Ref
                            <input
                              value={draft.lotNumber}
                              onChange={e => updateGrnDraft(po, { lotNumber: e.target.value })}
                            />
                          </label>
                          <label>
                            Credit Stock to SKU
                            <select
                              value={draft.targetItemId}
                              onChange={e => updateGrnDraft(po, { targetItemId: e.target.value })}
                            >
                              <option value="">PO Ledger Only</option>
                              {branchRawItems.map(sku => (
                                <option key={sku.id} value={sku.id}>
                                  {sku.partNumber} — {sku.partName}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Freight (KES)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.freightCost}
                              onChange={e => updateGrnDraft(po, { freightCost: e.target.value })}
                            />
                          </label>
                          <label>
                            Customs / Duty (KES)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.customsCost}
                              onChange={e => updateGrnDraft(po, { customsCost: e.target.value })}
                            />
                          </label>
                          <label>
                            Handling (KES)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.handlingCost}
                              onChange={e => updateGrnDraft(po, { handlingCost: e.target.value })}
                            />
                          </label>
                          <label>
                            GRN Discrepancy / Note
                            <input
                              placeholder="Optional note on seals or carton damage"
                              value={draft.grnNotes}
                              onChange={e => updateGrnDraft(po, { grnNotes: e.target.value })}
                            />
                          </label>
                        </div>
                        <div className="grn-preview">
                          <span>
                            Next PO Status: <strong>{preview.newStatus}</strong>
                          </span>
                          <span>Total Landed: <strong>{formatMoney(preview.totalLandedCost)}</strong></span>
                          <span>Est. Unit Landed Cost: <strong>{formatMoney(preview.unitLandedCost)}</strong></span>
                          {preview.remainingBackorder > 0 && (
                            <span>Remaining Backorder: <strong>{preview.remainingBackorder} unit(s)</strong></span>
                          )}
                        </div>
                        <div className="inline-controls">
                          <button className="primary" type="submit" disabled={busy}>
                            {busy ? 'Posting GRN…' : 'Post GRN & Update Stock'}
                          </button>
                        </div>
                      </form>
                    )}
                  </article>
                )
              })}
            </div>

            <form className="inventory-form" onSubmit={handleCreatePo}>
              <h3>Create Purchase Order</h3>
              <div className="form-grid">
                <label>
                  Supplier Name
                  <input
                    name="supplierName"
                    list="kms-suppliers-list"
                    required
                    placeholder="Kirinyaga OEM Distributors Ltd"
                  />
                  <datalist id="kms-suppliers-list">
                    {suppliers.map(s => (
                      <option key={s.id} value={s.supplierName} />
                    ))}
                  </datalist>
                </label>
                <label>Items Summary<input name="itemsSummary" required placeholder="BJ-CSK-150 x 15, NGK-CR8E x 40" /></label>
                <label>Total Ordered Units<input name="orderedQty" type="number" min="1" defaultValue="20" required /></label>
                <label>Base Cost (KES)<input name="totalCost" type="number" min="1" step="0.01" required /></label>
                <label>Est. Freight / Clearing (KES)<input name="freightCharges" type="number" min="0" step="0.01" defaultValue="500" /></label>
              </div>
              <button className="primary" type="submit" disabled={busy}>
                Create Purchase Order
              </button>
            </form>

            {branchPOs.length > 0 && branchRawItems.length > 0 && (
              <form className="inventory-form" onSubmit={handlePurchaseReturn}>
                <h3>Return Defective Goods to Supplier (PRC-013)</h3>
                <div className="form-grid">
                  <label>
                    Purchase Order
                    <select name="poId" required>
                      {branchPOs.map(p => (
                        <option key={p.id} value={p.id}>{p.orderNumber} — {p.supplierName}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    SKU to Return
                    <select name="itemId" required>
                      {branchRawItems.map(sku => (
                        <option key={sku.id} value={sku.id}>{sku.partNumber} ({sku.stockQuantity} on hand)</option>
                      ))}
                    </select>
                  </label>
                  <label>Return Qty<input name="quantity" type="number" min="1" defaultValue="1" required /></label>
                  <label>Defect Reason<input name="reason" required placeholder="Cracked seal on arrival" /></label>
                </div>
                <button type="submit" disabled={busy}>Post Purchase Return &amp; Debit Memo</button>
              </form>
            )}
          </section>

          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Supplier Registry &amp; Reliability Scorecard</h2>
                <p className="muted">Track lead times, payment terms, fill rates, and defect ratios across wholesalers.</p>
              </div>
              <div className="inline-controls">
                <button type="button" className="btn-sm" onClick={() => setShowSupplierCsv(v => !v)}>
                  {showSupplierCsv ? 'Close Supplier CSV' : 'Bulk Import Suppliers'}
                </button>
                <span className="status-tag ok">{suppliers.length} Active Suppliers</span>
              </div>
            </div>

            {showSupplierCsv && (
              <div className="sub-card mb-md">
                <strong>Bulk Supplier CSV Import (PLT-010)</strong>
                <p className="muted">Columns: supplierName,category,area,leadTimeDays,paymentTerms</p>
                <textarea rows={3} value={supplierCsvText} onChange={e => setSupplierCsvText(e.target.value)} />
                <div className="inline-controls mt-sm">
                  <button type="button" onClick={handleValidateSupplierCsv}>Validate Supplier CSV</button>
                  {supplierCsvReport?.validRows?.length > 0 && (
                    <button type="button" className="primary" disabled={busy} onClick={() => void handleCommitSupplierCsv()}>
                      Import {supplierCsvReport.validRows.length} Supplier(s)
                    </button>
                  )}
                </div>
                {supplierCsvReport && (
                  <p className="muted mt-xs">
                    Valid: <strong>{supplierCsvReport.validRows.length}</strong> · Duplicates skipped:{' '}
                    <strong>{supplierCsvReport.duplicates.length}</strong> · Errors: <strong>{supplierCsvReport.errors.length}</strong>
                  </p>
                )}
              </div>
            )}

            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Supplier &amp; Location</th>
                    <th>Category &amp; Terms</th>
                    <th className="num">Lead Time</th>
                    <th className="num">Fill Rate</th>
                    <th className="num">Defect Rate</th>
                    <th className="num">Scorecard</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(sup => {
                    const evalScore = evaluateSupplierScore(sup)
                    return (
                      <tr key={sup.id}>
                        <td>
                          <span className="cell-title">{sup.supplierName}</span>
                          <span className="cell-sub">{sup.area || 'Nairobi'}</span>
                        </td>
                        <td>
                          <span>{sup.category || 'Spare Parts'}</span>
                          <span className="cell-sub">{sup.paymentTerms || 'Net 14'}</span>
                        </td>
                        <td className="num">{sup.leadTimeDays}d</td>
                        <td className="num">{sup.fillRatePct}%</td>
                        <td className="num">{sup.defectRatePct}%</td>
                        <td className="num">
                          <span
                            className={
                              evalScore.tier === 'Preferred'
                                ? 'status-tag ok'
                                : evalScore.tier === 'Standard'
                                  ? 'status-tag warn'
                                  : 'status-tag danger'
                            }
                          >
                            {evalScore.score}/100 · {evalScore.tier}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <form className="inventory-form" onSubmit={handleCreateSupplier}>
              <h3>Add Verified Supplier</h3>
              <div className="form-grid">
                <label>Supplier Name<input name="supplierName" required placeholder="Eastlands Moto Wholesalers" /></label>
                <label>Primary Category<input name="category" defaultValue="Engine & Transmission" /></label>
                <label>Area / Hub<input name="area" defaultValue="Kirinyaga Road, Nairobi" /></label>
                <label>Lead Time (Days)<input name="leadTimeDays" type="number" min="0" defaultValue="2" required /></label>
                <label>Payment Terms<input name="paymentTerms" defaultValue="Net 14" /></label>
              </div>
              <button className="primary" type="submit" disabled={busy}>
                Save Supplier Profile
              </button>
            </form>
          </section>

          <div className="dashboard-grid">
            <section className="card">
              <h2>Purchase Requisitions (PRC-002)</h2>
              <p className="muted">Stage internal branch restock requests and convert approved requisitions directly into Purchase Orders.</p>
              <div className="po-list mt-md">
                {purchaseRequisitions.map(pr => (
                  <article className="sub-card" key={pr.id}>
                    <div className="card-head wrap-head">
                      <div>
                        <strong className="mono">{pr.reqNumber}</strong>
                        <p className="muted">{pr.itemsSummary} · Est. {formatMoney(pr.estimatedCost)} · By {pr.requestedBy}</p>
                      </div>
                      <div className="inline-controls">
                        <span className={pr.status === 'ConvertedToPO' ? 'status-tag ok' : pr.status === 'Rejected' ? 'status-tag danger' : 'status-tag warn'}>
                          {pr.status}
                        </span>
                        {pr.status === 'PendingApproval' && (
                          <>
                            <button type="button" className="primary btn-sm" onClick={() => void resolvePurchaseRequisition(pr.id, 'ConvertedToPO')}>
                              Convert to PO
                            </button>
                            <button type="button" className="btn-sm" onClick={() => void resolvePurchaseRequisition(pr.id, 'Rejected')}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <form className="inventory-form" onSubmit={e => void handleCreateRequisition(e)}>
                <h3>Raise Purchase Requisition</h3>
                <div className="form-grid">
                  <label>Items Requested<input name="itemsSummary" required placeholder="HLX-CHN-KIT x 20, NGK-CR8E x 50" /></label>
                  <label>Estimated Cost (KES)<input name="estimatedCost" type="number" min="1" defaultValue="18000" required /></label>
                </div>
                <button className="primary" type="submit">Submit Requisition</button>
              </form>
            </section>

            <section className="card">
              <h2>Supplier RFQs &amp; Ranked Award (PRC-003)</h2>
              <p className="muted">Compare supplier quotes ranked by reliability score, lead time, and quoted unit price.</p>
              <div className="filter-bar mt-sm">
                <label>
                  Award PO Quantity
                  <input type="number" min="1" value={rfqAwardQty} onChange={e => setRfqAwardQty(Math.max(1, Number(e.target.value) || 1))} />
                </label>
              </div>
              <div className="po-list">
                {rankedRfqs.map(q => (
                  <article className="sub-card" key={q.id}>
                    <div className="card-head wrap-head">
                      <div>
                        <strong className="mono">{q.rfqRef} · {q.partNumber}</strong>
                        <p className="muted">
                          {q.supplierName} · <strong>{formatMoney(q.quotedUnitPrice)}</strong>/unit · {q.leadTimeDays}d · Score {q.combinedScore}
                        </p>
                      </div>
                      {q.status === 'Submitted' ? (
                        <button type="button" className="primary btn-sm" onClick={() => void awardSupplierQuote(q.id, rfqAwardQty)}>
                          Award &amp; Draft PO
                        </button>
                      ) : (
                        <span className="status-tag ok">{q.status}</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <form className="inventory-form" onSubmit={e => void handleCreateRfqQuote(e)}>
                <h3>Log Supplier Quote</h3>
                <div className="form-grid">
                  <label>RFQ Ref<input name="rfqRef" required placeholder="RFQ-2026-09" /></label>
                  <label>
                    Supplier
                    <select name="supplierId">
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.supplierName}</option>
                      ))}
                    </select>
                  </label>
                  <label>SKU / Part<input name="partNumber" required placeholder="BJ-CSK-150" /></label>
                  <label>Unit Quote (KES)<input name="quotedUnitPrice" type="number" min="1" required /></label>
                  <label>Lead Time (Days)<input name="leadTimeDays" type="number" min="0" defaultValue="2" /></label>
                  <label>Payment Terms<input name="paymentTerms" defaultValue="Net 14" /></label>
                </div>
                <button className="primary" type="submit">Log Quote</button>
              </form>
            </section>
          </div>

          <section className="card">
            <h2>Inbound Import Container Tracking (PRC-011)</h2>
            <p className="muted">Track sea &amp; Mombasa corridor container milestones from Booking through Godown Receipt.</p>
            <div className="po-list mt-md">
              {inboundContainers.map(cnt => {
                const currentIdx = CONTAINER_STAGE_ORDER.indexOf(cnt.status)
                const nextStage = currentIdx >= 0 && currentIdx < CONTAINER_STAGE_ORDER.length - 1 ? CONTAINER_STAGE_ORDER[currentIdx + 1] : null
                return (
                  <article className="sub-card" key={cnt.id}>
                    <div className="card-head wrap-head">
                      <div>
                        <strong className="mono">{cnt.containerNumber}</strong> — {cnt.originPort} ({cnt.shippingLine || 'Freight'}) · ETA {cnt.etaDate || 'TBD'}
                        <p className="muted">{cnt.itemsSummary}</p>
                        <div className="container-stages">
                          {CONTAINER_STAGE_ORDER.map(st => (
                            <span key={st} className={st === cnt.status ? 'status-tag ok' : 'status-tag muted'}>{st}</span>
                          ))}
                        </div>
                      </div>
                      {nextStage && (
                        <button type="button" className="primary btn-sm" onClick={() => void updateInboundContainer(cnt.id, nextStage)}>
                          Advance to {nextStage}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
            <form className="inventory-form" onSubmit={e => void handleCreateContainer(e)}>
              <h3>Book Inbound Container</h3>
              <div className="form-grid">
                <label>Container #<input name="containerNumber" required placeholder="MSKU4412980" /></label>
                <label>Origin Port<input name="originPort" required placeholder="Mumbai (Nhava Sheva)" /></label>
                <label>Shipping Line<input name="shippingLine" placeholder="Maersk Kenya" /></label>
                <label>ETA Date<input name="etaDate" type="date" /></label>
                <label>Cargo Summary<input name="itemsSummary" required placeholder="Boxer Sprockets x400, Stators x250" /></label>
              </div>
              <button className="primary" type="submit">Track Inbound Container</button>
            </form>
          </section>
        </div>
      )}

      {tab === 'counts' && (
        <div className="stacked-pages">
          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Cycle Count Variance Proposals (Manager Approval)</h2>
                <p className="muted">
                  Physical shelf counts remain isolated until approved; approval atomically updates stock and logs a signed count_variance movement.
                </p>
              </div>
              <span className="status-tag warn">{pendingCounts.length} Pending Approval</span>
            </div>

            {!branchCounts.length ? (
              <p className="muted">No cycle count variance proposals submitted on this branch yet.</p>
            ) : (
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>SKU &amp; Reason</th>
                      <th className="num">System Qty</th>
                      <th className="num">Counted Qty</th>
                      <th className="num">Variance (KES Impact)</th>
                      <th>Status</th>
                      <th className="num">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchCounts.map(cnt => {
                      const impact = Number(cnt.variance) * Number(cnt.unitCost || 0)
                      return (
                        <tr key={cnt.id}>
                          <td>
                            <span className="cell-title">
                              <span className="mono">{cnt.partNumber}</span> — {cnt.partName}
                            </span>
                            <span className="cell-sub">{cnt.reason || 'Physical shelf audit'}</span>
                          </td>
                          <td className="num">{cnt.systemQty}</td>
                          <td className="num">{cnt.countedQty}</td>
                          <td className="num">
                            <strong>{cnt.variance > 0 ? `+${cnt.variance}` : cnt.variance}</strong>
                            <span className="cell-sub">{formatMoney(impact)}</span>
                          </td>
                          <td>
                            <span
                              className={
                                cnt.status === 'Approved'
                                  ? 'status-tag ok'
                                  : cnt.status === 'Rejected'
                                    ? 'status-tag danger'
                                    : 'status-tag warn'
                              }
                            >
                              {cnt.status}
                            </span>
                          </td>
                          <td className="num">
                            {cnt.status === 'PendingApproval' ? (
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="primary btn-sm"
                                  onClick={() => void resolveStockCount(cnt.id, true)}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn-sm"
                                  onClick={() => void resolveStockCount(cnt.id, false)}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="muted">Locked</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <form className="inventory-form" onSubmit={handleSubmitCycleCount}>
              <h3>Submit Physical Cycle Count Proposal</h3>
              <div className="form-grid">
                <label>
                  Select Branch SKU
                  <select name="itemId" required>
                    {branchRawItems.map(sku => (
                      <option key={sku.id} value={sku.id}>
                        {sku.partNumber} — {sku.partName} (System: {sku.stockQuantity})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Physical Counted Quantity
                  <input name="countedQty" type="number" min="0" required placeholder="Enter counted units" />
                </label>
                <label>
                  Audit / Variance Reason
                  <input name="reason" required placeholder="Bin shelf recount — damaged seal or missing pack" />
                </label>
              </div>
              <button className="primary" type="submit" disabled={busy || !branchRawItems.length}>
                Submit Variance Proposal
              </button>
            </form>
          </section>

          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Approval-Gated Stock Adjustments (INV-007)</h2>
                <p className="muted">Record damage, loss, theft, or manual stock corrections via dual-control manager approval.</p>
              </div>
              <span className="status-tag warn">
                {stockAdjustmentApprovals.filter(a => a.status === 'PendingApproval').length} Pending Approval
              </span>
            </div>
            {stockAdjustmentApprovals.length > 0 && (
              <div className="po-list mt-sm">
                {stockAdjustmentApprovals.map(req => (
                  <article className="sub-card" key={req.id}>
                    <div className="card-head wrap-head">
                      <div>
                        <strong>{req.summary}</strong>
                        <p className="muted">Requested by {req.requestedBy} ({req.requestedRole})</p>
                      </div>
                      <div className="inline-controls">
                        <span className={req.status === 'Approved' ? 'status-tag ok' : req.status === 'Rejected' ? 'status-tag danger' : 'status-tag warn'}>
                          {req.status}
                        </span>
                        {req.status === 'PendingApproval' && (
                          <>
                            <button type="button" className="primary btn-sm" onClick={() => void resolveApprovalRequest(req.id, true, { approverRole: context.role })}>
                              Approve &amp; Adjust
                            </button>
                            <button type="button" className="btn-sm" onClick={() => void resolveApprovalRequest(req.id, false, { approverRole: context.role })}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <form className="inventory-form" onSubmit={e => void handleStockAdjustmentProposal(e)}>
              <h3>Request Stock Adjustment</h3>
              <div className="form-grid">
                <label>
                  SKU
                  <select name="itemId" required>
                    {branchRawItems.map(sku => (
                      <option key={sku.id} value={sku.id}>{sku.partNumber} — {sku.partName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Reason Code
                  <select name="reasonCode" defaultValue="damage">
                    <option value="damage">Damaged in Handling</option>
                    <option value="loss">Unexplained Loss / Shrinkage</option>
                    <option value="theft">Suspected Theft</option>
                    <option value="correction">Opening Balance Correction</option>
                  </select>
                </label>
                <label>Quantity Delta (-/+ units)<input name="quantityDelta" type="number" defaultValue="-1" required /></label>
                <label>Reason Note<input name="notes" required placeholder="Cracked glass lens during shelf reorganization" /></label>
              </div>
              <button className="primary" type="submit" disabled={busy || !branchRawItems.length}>
                Submit Adjustment Request
              </button>
            </form>
          </section>

          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Immutable Stock Movement Ledger</h2>
                <p className="muted">Signed audit trail across POS sales, GRN receipts, damages, transfers, and approved count variances.</p>
              </div>
              <span className="status-tag muted">{branchMovements.length} Movements</span>
            </div>

            {!branchMovements.length ? (
              <p className="muted">No stock movements logged on this branch yet.</p>
            ) : (
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Movement Type</th>
                      <th className="num">Qty Delta</th>
                      <th>Lot / Cost Snapshot</th>
                      <th>Source Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchMovements.slice(0, 25).map(m => (
                      <tr key={m.id}>
                        <td className="mono">{m.partNumber}</td>
                        <td>
                          <span
                            className={
                              m.movementType === 'damage'
                                ? 'status-tag danger'
                                : m.movementType === 'receipt' || m.movementType === 'transfer_in'
                                  ? 'status-tag ok'
                                  : 'status-tag muted'
                            }
                          >
                            {m.movementType}
                          </span>
                        </td>
                        <td className="num">
                          <strong>{m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}</strong>
                        </td>
                        <td>
                          <span>{m.lotNumber || '—'}</span>
                          {m.unitCostSnapshot > 0 && (
                            <span className="cell-sub">{formatMoney(m.unitCostSnapshot)}</span>
                          )}
                        </td>
                        <td>{m.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'fitment' && (
        <section className="card">
          <h2>Verify OEM Part Cross-Reference &amp; Market Pricing (Google Search)</h2>
          <p className="muted mt-xs">
            Verify cross-bike fitment codes and Kenya street pricing using live Google Search grounding.
          </p>
          <form onSubmit={verifyPartFitment} className="inline-search-form">
            <input
              aria-label="Part compatibility search query"
              placeholder="e.g. Bajaj Boxer BM150 vs TVS HLX 150 stator coil OEM compatibility & price in Kenya"
              value={fitQuery}
              onChange={e => setFitQuery(e.target.value)}
            />
            <button className="primary" type="submit" disabled={fitBusy || !fitQuery.trim()}>
              {fitBusy ? 'Searching…' : 'Search Web'}
            </button>
          </form>
          {fitResult?.error && (
            <p className="form-error" role="alert">
              {fitResult.error}
            </p>
          )}
          {fitResult?.text && (
            <div className="sub-card">
              <p className="bubble-text">{fitResult.text}</p>
              {fitResult.webSources?.length > 0 && (
                <div className="grounding-box">
                  <strong>Verified Web Sources</strong>
                  <ul>
                    {fitResult.webSources.map(src => (
                      <li key={src.uri}>
                        <a href={src.uri} target="_blank" rel="noreferrer">
                          {src.title || src.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
