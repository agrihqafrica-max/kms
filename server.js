import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json())

const ORG_ID = '10000000-0000-4000-8000-000000000001'
const BRANCH_CBD_ID = '20000000-0000-4000-8000-000000000001'
const BRANCH_IND_ID = '20000000-0000-4000-8000-000000000002'

// MOCKED — in-memory store replacing PostgreSQL / Supabase RPCs when offline
const organizations = new Map([
  [ORG_ID, {
    id: ORG_ID,
    name: 'KenyaMoto Nairobi Hub',
    org_type: 'RETAIL',
    kra_compliance_enabled: true,
    payroll_compliance_enabled: true,
  }],
])

const branches = new Map([
  [BRANCH_CBD_ID, { id: BRANCH_CBD_ID, organization_id: ORG_ID, name: 'Nairobi CBD Branch' }],
  [BRANCH_IND_ID, { id: BRANCH_IND_ID, organization_id: ORG_ID, name: 'Industrial Area Depot' }],
])

const inventoryItems = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    organization_id: ORG_ID,
    branch_id: BRANCH_CBD_ID,
    part_name: 'Bajaj Boxer BM150 Chain & Sprocket Kit',
    part_number: 'BJ-CSK-150',
    category: 'Drivetrain',
    unit_cost: '1450.00',
    retail_price: '2200.00',
    stock_quantity: 18,
    reorder_level: 5,
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    organization_id: ORG_ID,
    branch_id: BRANCH_CBD_ID,
    part_name: 'TVS HLX 125 Rear Brake Shoe Set',
    part_number: 'TVS-BRK-125',
    category: 'Brakes',
    unit_cost: '320.00',
    retail_price: '550.00',
    stock_quantity: 34,
    reorder_level: 10,
  },
  {
    id: '40000000-0000-4000-8000-000000000003',
    organization_id: ORG_ID,
    branch_id: BRANCH_CBD_ID,
    part_name: 'NGK CR8E Spark Plug (Boxer / TVS)',
    part_number: 'NGK-CR8E',
    category: 'Ignition',
    unit_cost: '210.00',
    retail_price: '380.00',
    stock_quantity: 3,
    reorder_level: 12,
  },
  {
    id: '40000000-0000-4000-8000-000000000004',
    organization_id: ORG_ID,
    branch_id: BRANCH_CBD_ID,
    part_name: 'Honda Ace 125 Piston & Ring Kit (STD)',
    part_number: 'HND-PRK-125',
    category: 'Engine',
    unit_cost: '1850.00',
    retail_price: '2950.00',
    stock_quantity: 9,
    reorder_level: 4,
  },
  {
    id: '40000000-0000-4000-8000-000000000005',
    organization_id: ORG_ID,
    branch_id: BRANCH_CBD_ID,
    part_name: 'Bajaj Boxer Clutch Plate Set (5-Piece)',
    part_number: 'BJ-CPS-150',
    category: 'Transmission',
    unit_cost: '680.00',
    retail_price: '1150.00',
    stock_quantity: 2,
    reorder_level: 6,
  },
  {
    id: '40000000-0000-4000-8000-000000000006',
    organization_id: ORG_ID,
    branch_id: BRANCH_CBD_ID,
    part_name: 'Kenda 2.75-17 Heavy Duty Boda Tyre',
    part_number: 'KND-275-17',
    category: 'Tyres & Tubes',
    unit_cost: '2300.00',
    retail_price: '3450.00',
    stock_quantity: 14,
    reorder_level: 5,
  },
  {
    id: '40000000-0000-4000-8000-000000000007',
    organization_id: ORG_ID,
    branch_id: BRANCH_IND_ID,
    part_name: 'Skygo SG150 Stator Coil (8-Pole)',
    part_number: 'SKY-STC-150',
    category: 'Electrical',
    unit_cost: '1100.00',
    retail_price: '1850.00',
    stock_quantity: 11,
    reorder_level: 4,
  },
  {
    id: '40000000-0000-4000-8000-000000000008',
    organization_id: ORG_ID,
    branch_id: BRANCH_IND_ID,
    part_name: 'TVS HLX 150 Front Fork Oil Seal Pair',
    part_number: 'TVS-FOS-150',
    category: 'Suspension',
    unit_cost: '290.00',
    retail_price: '500.00',
    stock_quantity: 4,
    reorder_level: 8,
  },
  {
    id: '40000000-0000-4000-8000-000000000009',
    organization_id: ORG_ID,
    branch_id: BRANCH_IND_ID,
    part_name: 'PZ26 Carburetor Assembly (150cc)',
    part_number: 'CARB-PZ26',
    category: 'Fuel System',
    unit_cost: '1650.00',
    retail_price: '2600.00',
    stock_quantity: 7,
    reorder_level: 3,
  },
]

const radarRequests = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    organization_id: ORG_ID,
    requesting_branch_id: BRANCH_CBD_ID,
    part_description: 'PZ26 Carburetor Assembly — OEM Spec',
    motorcycle_model: 'Bajaj Boxer BM150',
    urgency_status: 'Urgent',
    status: 'Open',
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    organization_id: ORG_ID,
    requesting_branch_id: BRANCH_CBD_ID,
    part_description: 'Heavy Duty Rear Shock Absorber Pair',
    motorcycle_model: 'TVS HLX 125',
    urgency_status: 'Normal',
    status: 'Open',
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: '50000000-0000-4000-8000-000000000003',
    organization_id: ORG_ID,
    requesting_branch_id: BRANCH_IND_ID,
    part_description: '8-Pole Stator Coil & Regulator Unit',
    motorcycle_model: 'Skygo SG150',
    urgency_status: 'Urgent',
    status: 'Pending',
    created_at: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
  },
]

const radarQuotes = []
const expenses = [
  {
    id: '60000000-0000-4000-8000-000000000001',
    organization_id: ORG_ID,
    branch_id: BRANCH_CBD_ID,
    category: 'Boda Courier Dispatch',
    amount: '1450.00',
    description: 'Same-day parts delivery to Kawangware',
    expense_date: new Date().toISOString().slice(0, 10),
  },
  {
    id: '60000000-0000-4000-8000-000000000002',
    organization_id: ORG_ID,
    branch_id: BRANCH_IND_ID,
    category: 'Warehouse Handling',
    amount: '2100.00',
    description: 'Pallet offloading and bin labelling',
    expense_date: new Date().toISOString().slice(0, 10),
  },
]

const salesByBranch = new Map([
  [BRANCH_CBD_ID, { netSales: 48650.00, salesCount: 19 }],
  [BRANCH_IND_ID, { netSales: 31200.00, salesCount: 11 }],
])
const eodRecords = []

function decodeBearer(req) {
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      return {
        userId: payload.sub || '30000000-0000-4000-8000-000000000001',
        email: payload.email || 'owner@kenyamoto.co.ke',
        claims: payload,
      }
    }
  } catch {
    // Fallback identity for opaque dev tokens
  }
  return {
    userId: '30000000-0000-4000-8000-000000000001',
    email: 'owner@kenyamoto.co.ke',
    claims: {},
  }
}

function getMemberships() {
  const rows = []
  for (const org of organizations.values()) {
    const orgBranches = [...branches.values()].filter(b => b.organization_id === org.id)
    if (orgBranches.length) {
      for (const branch of orgBranches) {
        rows.push({
          organization_id: org.id,
          organization_name: org.name,
          branch_id: branch.id,
          role: 'owner',
        })
      }
    } else {
      rows.push({
        organization_id: org.id,
        organization_name: org.name,
        branch_id: null,
        role: 'owner',
      })
    }
  }
  return rows
}

function resolveTenant(req, res) {
  const identity = decodeBearer(req)
  if (!identity) {
    res.status(401).json({ detail: 'Missing or invalid authorization token' })
    return null
  }
  const memberships = getMemberships()
  const orgHeader = req.headers['x-organization-id']
  const branchHeader = req.headers['x-branch-id']
  const distinctOrgs = [...new Set(memberships.map(m => m.organization_id))]

  let chosenOrg = orgHeader
  if (!chosenOrg) {
    if (distinctOrgs.length === 1) chosenOrg = distinctOrgs[0]
    else {
      res.status(409).json({
        detail: {
          code: 'organization_selection_required',
          organizations: memberships,
        },
      })
      return null
    }
  }

  const orgRows = memberships.filter(m => m.organization_id === chosenOrg)
  if (!orgRows.length) {
    res.status(403).json({ detail: 'Not a member of this organization' })
    return null
  }

  let chosenBranch = branchHeader || null
  if (chosenBranch && !orgRows.some(m => m.branch_id === chosenBranch)) {
    res.status(404).json({ detail: 'Branch not found in this organization' })
    return null
  }
  if (!chosenBranch) {
    chosenBranch = orgRows[0].branch_id || null
  }

  const org = organizations.get(chosenOrg)
  return {
    identity,
    memberships,
    context: {
      organization_id: chosenOrg,
      organization_name: org.name,
      branch_id: chosenBranch,
      role: orgRows[0].role,
      org_wide: chosenBranch === null,
      staff_user_id: identity.userId,
    },
  }
}

app.get('/health/db', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'connected',
    server_time: new Date().toISOString(),
  })
})

app.get('/auth/me', (req, res) => {
  const identity = decodeBearer(req)
  if (!identity) {
    return res.status(401).json({ detail: 'Missing or invalid authorization token' })
  }
  const memberships = getMemberships()
  const orgHeader = req.headers['x-organization-id']
  const branchHeader = req.headers['x-branch-id']
  const distinctOrgs = new Set(memberships.map(m => m.organization_id))

  let context = null
  if (orgHeader || distinctOrgs.size === 1) {
    const targetOrg = orgHeader || memberships[0].organization_id
    const match = memberships.find(m => m.organization_id === targetOrg && (!branchHeader || m.branch_id === branchHeader))
    if (match) {
      context = {
        organization_id: match.organization_id,
        organization_name: match.organization_name,
        branch_id: branchHeader || match.branch_id,
        role: match.role,
        org_wide: !(branchHeader || match.branch_id),
        staff_user_id: identity.userId,
      }
    }
  }

  res.json({
    user_id: identity.userId,
    email: identity.email,
    memberships,
    context,
  })
})

app.post('/organizations/register', (req, res) => {
  const identity = decodeBearer(req)
  if (!identity) return res.status(401).json({ detail: 'Unauthorized' })
  const { name, kra_pin, org_type = 'RETAIL', kra_compliance_enabled = false, payroll_compliance_enabled = false } = req.body || {}
  if (!name || String(name).trim().length < 2) {
    return res.status(422).json({ detail: 'Organization name is required' })
  }
  const id = randomUUID()
  const branchId = randomUUID()
  organizations.set(id, { id, name: String(name).trim(), kra_pin: kra_pin || null, org_type, kra_compliance_enabled, payroll_compliance_enabled })
  branches.set(branchId, { id: branchId, organization_id: id, name: `${String(name).trim()} Main Branch` })
  res.status(201).json({
    organization_id: id,
    name: String(name).trim(),
    org_type,
    kra_compliance_enabled,
    payroll_compliance_enabled,
  })
})

app.get('/finance/dashboard', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const branchId = req.query.branch_id || tenant.context.branch_id
  if (!branchId) {
    return res.status(400).json({ detail: 'X-Branch-Id header is required' })
  }
  const branchItems = inventoryItems.filter(i => i.organization_id === tenant.context.organization_id && i.branch_id === branchId)
  const lowStockCount = branchItems.filter(i => i.stock_quantity <= i.reorder_level).length
  const branchExpenses = expenses
    .filter(e => e.organization_id === tenant.context.organization_id && e.branch_id === branchId)
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const sales = salesByBranch.get(branchId) || { netSales: 0, salesCount: 0 }

  res.json({
    net_sales: sales.netSales.toFixed(2),
    sales_count: sales.salesCount,
    expense_total: branchExpenses.toFixed(2),
    low_stock_count: lowStockCount,
    inventory_items_count: branchItems.length,
  })
})

app.get('/finance/expenses', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const branchId = req.query.branch_id || tenant.context.branch_id
  const rows = expenses.filter(e => e.organization_id === tenant.context.organization_id && (!branchId || e.branch_id === branchId))
  res.json(rows)
})

app.post('/finance/expenses', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const branchId = req.body?.branch_id || tenant.context.branch_id
  if (!branchId) return res.status(400).json({ detail: 'X-Branch-Id header is required' })
  const record = {
    id: randomUUID(),
    organization_id: tenant.context.organization_id,
    branch_id: branchId,
    category: req.body?.category || 'General',
    amount: Number(req.body?.amount || 0).toFixed(2),
    description: req.body?.description || null,
    expense_date: req.body?.expense_date || new Date().toISOString().slice(0, 10),
  }
  expenses.unshift(record)
  res.status(201).json(record)
})

app.post('/finance/eod', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const branchId = req.body?.branch_id || tenant.context.branch_id
  if (!branchId) return res.status(400).json({ detail: 'X-Branch-Id header is required' })
  const sales = salesByBranch.get(branchId) || { netSales: 0 }
  const gross = req.body?.total_gross_sales ?? sales.netSales
  const expenseTotal = req.body?.total_expenses ?? 0
  const cogs = req.body?.total_cogs ?? 0
  const netProfit = Number(gross) - Number(cogs) - Number(expenseTotal)
  const variance = req.body?.cash_counted != null ? Number(req.body.cash_counted) - Number(req.body.cash_expected || 0) : 0
  const record = {
    id: randomUUID(),
    gross_sales: Number(gross).toFixed(2),
    expenses: Number(expenseTotal).toFixed(2),
    net_profit: netProfit.toFixed(2),
    variance: variance.toFixed(2),
  }
  eodRecords.push(record)
  res.status(201).json(record)
})

app.get('/inventory/branches/:branchId', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const { branchId } = req.params
  if (!branches.has(branchId)) {
    return res.status(404).json({ detail: 'Branch not found in this organization' })
  }
  const search = String(req.query.search || '').trim().toLowerCase()
  const items = inventoryItems
    .filter(i => i.organization_id === tenant.context.organization_id && i.branch_id === branchId)
    .filter(i => !search || i.part_name.toLowerCase().includes(search) || i.part_number.toLowerCase().includes(search) || (i.category || '').toLowerCase().includes(search))
    .map(({ id, part_name, part_number, category, retail_price, stock_quantity, reorder_level }) => ({
      id, part_name, part_number, category, retail_price, stock_quantity, reorder_level,
    }))
  res.json(items)
})

app.get('/inventory/branches/:branchId/costs', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const { branchId } = req.params
  const items = inventoryItems
    .filter(i => i.organization_id === tenant.context.organization_id && i.branch_id === branchId)
    .map(({ id, part_name, part_number, unit_cost }) => ({ id, part_name, part_number, unit_cost }))
  res.json(items)
})

app.post('/inventory/items', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const branchId = req.body?.branch_id || tenant.context.branch_id
  if (!branchId) return res.status(400).json({ detail: 'X-Branch-Id header is required' })
  const item = {
    id: randomUUID(),
    organization_id: tenant.context.organization_id,
    branch_id: branchId,
    part_name: req.body?.part_name,
    part_number: req.body?.part_number,
    category: req.body?.category || 'General',
    unit_cost: Number(req.body?.unit_cost || 0).toFixed(2),
    retail_price: Number(req.body?.retail_price || 0).toFixed(2),
    stock_quantity: Number(req.body?.stock_quantity || 0),
    reorder_level: Number(req.body?.reorder_level || 0),
  }
  inventoryItems.push(item)
  res.status(201).json(item)
})

app.post('/pos/checkout', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const branchId = req.body?.branch_id || tenant.context.branch_id
  if (!branchId) return res.status(400).json({ detail: 'X-Branch-Id header is required' })
  const cart = Array.isArray(req.body?.cart) ? req.body.cart : []
  if (!cart.length) return res.status(422).json({ detail: 'Cart cannot be empty' })

  let subtotal = 0
  for (const line of cart) {
    const item = inventoryItems.find(i => i.id === line.item_id && i.branch_id === branchId)
    if (!item) return res.status(404).json({ detail: `Inventory item not found: ${line.item_id}` })
    if (item.stock_quantity < line.quantity) {
      return res.status(409).json({ detail: `Insufficient stock for ${item.part_name}` })
    }
    item.stock_quantity -= line.quantity
    subtotal += Number(item.retail_price) * line.quantity
  }
  const discount = Number(req.body?.discount_amount || 0)
  const discounted = Math.max(subtotal - discount, 0)
  const vat = Math.round(discounted * 0.16 * 100) / 100
  const total = Math.round((discounted + vat) * 100) / 100

  const currentSales = salesByBranch.get(branchId) || { netSales: 0, salesCount: 0 }
  salesByBranch.set(branchId, {
    netSales: currentSales.netSales + total,
    salesCount: currentSales.salesCount + 1,
  })

  res.status(201).json({
    id: randomUUID(),
    total_amount: total.toFixed(2),
    vat_amount: vat.toFixed(2),
    status: 'completed',
  })
})

app.get('/radar/requests', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const statusFilter = req.query.status_filter
  const rows = radarRequests
    .filter(r => r.organization_id === tenant.context.organization_id && (!statusFilter || r.status === statusFilter))
    .map(({ id, part_description, motorcycle_model, urgency_status, status, created_at }) => ({
      id, part_description, motorcycle_model, urgency_status, status, created_at,
    }))
  res.json(rows)
})

app.post('/radar/requests', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const row = {
    id: randomUUID(),
    organization_id: tenant.context.organization_id,
    requesting_branch_id: req.body?.requesting_branch_id || tenant.context.branch_id,
    part_description: req.body?.part_description,
    motorcycle_model: req.body?.motorcycle_model || null,
    urgency_status: req.body?.urgency_status || 'Normal',
    status: 'Open',
    created_at: new Date().toISOString(),
  }
  radarRequests.unshift(row)
  res.status(201).json({ id: row.id, status: row.status })
})

app.post('/radar/quotes', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const quote = { id: randomUUID(), status: 'Pending', ...req.body }
  radarQuotes.push(quote)
  res.status(201).json({ id: quote.id, status: quote.status })
})

const purchaseOrders = new Map()
const goodsReceipts = []
const branchTransfers = new Map()
const salesReturns = new Map()

app.post('/procurement/purchase-orders', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const branchId = req.body?.branch_id || tenant.context.branch_id
  if (!branchId) return res.status(400).json({ detail: 'X-Branch-Id header is required' })
  const id = randomUUID()
  const po = {
    id,
    organization_id: tenant.context.organization_id,
    branch_id: branchId,
    supplier_id: req.body?.supplier_id,
    order_number: req.body?.order_number,
    items: req.body?.items || [],
    notes: req.body?.notes || null,
    status: 'Pending',
  }
  purchaseOrders.set(id, po)
  res.status(201).json(po)
})

app.post('/procurement/purchase-orders/:purchaseOrderId/resolve', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const po = purchaseOrders.get(req.params.purchaseOrderId)
  if (!po) return res.status(404).json({ detail: 'Purchase order not found' })
  po.status = req.body?.approve ? 'Approved' : 'Rejected'
  res.json(po)
})

app.post('/procurement/goods-receipts', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const receipt = {
    id: randomUUID(),
    organization_id: tenant.context.organization_id,
    purchase_order_id: req.body?.purchase_order_id,
    receipt_reference: req.body?.receipt_reference,
    items: req.body?.items || [],
    status: 'Received',
  }
  goodsReceipts.push(receipt)
  res.status(201).json(receipt)
})

app.post('/transfers/branch', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const sourceBranch = req.body?.source_branch_id || tenant.context.branch_id
  if (!sourceBranch) return res.status(400).json({ detail: 'X-Branch-Id header is required' })
  const id = randomUUID()
  const transfer = {
    id,
    organization_id: tenant.context.organization_id,
    source_branch_id: sourceBranch,
    destination_branch_id: req.body?.destination_branch_id,
    items: req.body?.items || [],
    status: 'Pending',
  }
  branchTransfers.set(id, transfer)
  res.status(201).json(transfer)
})

app.post('/transfers/:transferId/resolve', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const transfer = branchTransfers.get(req.params.transferId)
  if (!transfer) return res.status(404).json({ detail: 'Branch transfer not found' })
  transfer.status = req.body?.approve ? 'Approved' : 'Rejected'
  res.json(transfer)
})

app.post('/transfers/:transferId/dispatch', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const transfer = branchTransfers.get(req.params.transferId)
  if (!transfer) return res.status(404).json({ detail: 'Branch transfer not found' })
  transfer.status = 'Dispatched'
  transfer.rider_name = req.body?.rider_name
  transfer.rider_phone = req.body?.rider_phone
  transfer.motorbike_number_plate = req.body?.motorbike_number_plate
  res.json(transfer)
})

app.post('/transfers/:transferId/receive', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const transfer = branchTransfers.get(req.params.transferId)
  if (!transfer) return res.status(404).json({ detail: 'Branch transfer not found' })
  transfer.status = 'Received'
  res.json(transfer)
})

app.post('/returns/sales', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const id = randomUUID()
  const ret = {
    id,
    organization_id: tenant.context.organization_id,
    order_id: req.body?.order_id,
    reason: req.body?.reason,
    items: req.body?.items || [],
    status: 'Pending',
  }
  salesReturns.set(id, ret)
  res.status(201).json(ret)
})

app.post('/returns/sales/:returnId/resolve', (req, res) => {
  const tenant = resolveTenant(req, res)
  if (!tenant) return
  const ret = salesReturns.get(req.params.returnId)
  if (!ret) return res.status(404).json({ detail: 'Sales return not found' })
  ret.status = req.body?.approve ? 'Approved' : 'Rejected'
  ret.refund_method = req.body?.refund_method || 'cash'
  res.json(ret)
})

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  })
}

function extractGroundingMetadata(response) {
  const candidate = response?.candidates?.[0]
  const meta = candidate?.groundingMetadata
  const chunks = Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : []
  const webSources = []
  const mapPlaces = []
  const seenWeb = new Set()
  const seenMaps = new Set()

  for (const chunk of chunks) {
    if (chunk?.web?.uri && !seenWeb.has(chunk.web.uri)) {
      seenWeb.add(chunk.web.uri)
      webSources.push({
        type: 'web',
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      })
    }
    if (chunk?.maps?.uri && !seenMaps.has(chunk.maps.uri)) {
      seenMaps.add(chunk.maps.uri)
      const snippets = Array.isArray(chunk.maps.placeAnswerSources?.reviewSnippets)
        ? chunk.maps.placeAnswerSources.reviewSnippets
            .map(s => ({ title: s?.title || 'Review', uri: s?.googleMapsUri || chunk.maps.uri, snippet: s?.snippet || '' }))
            .slice(0, 3)
        : []
      mapPlaces.push({
        type: 'maps',
        title: chunk.maps.title || 'Place on Google Maps',
        uri: chunk.maps.uri,
        placeId: chunk.maps.placeId || '',
        snippets,
      })
    }
  }
  return {
    webSources,
    mapPlaces,
    webSearchQueries: Array.isArray(meta?.webSearchQueries) ? meta.webSearchQueries : [],
  }
}

function normalizeLatLng(raw) {
  if (!raw || typeof raw !== 'object') return null
  const latitude = Number(raw.latitude)
  const longitude = Number(raw.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

function resolveFreeTierModel(mode) {
  if (mode === 'fast') return 'gemini-3.1-flash-lite'
  return 'gemini-4-hydrogen'
}

function formatGeminiError(err) {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500
  const raw = err?.message || 'Unable to generate response right now.'
  if (status === 429 || raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      detail: 'Gemini free-tier quota exceeded or rate-limited. Wait briefly or check your API key in Settings > Secrets.',
    }
  }
  return { status, detail: raw }
}

async function withGeminiRetry(fn) {
  try {
    return await fn()
  } catch (err) {
    const code = err?.status || 0
    if (code === 503 || String(err?.message || '').includes('503')) {
      await new Promise(resolve => setTimeout(resolve, 600))
      return fn()
    }
    throw err
  }
}

app.post('/api/ai/chat', async (req, res) => {
  const ai = getGeminiClient()
  if (!ai) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server.',
      detail: 'Server-side Gemini API key is unavailable.',
    })
  }
  const { message, history = [], systemInstruction, mode = 'standard', latLng } = req.body || {}
  const trimmed = String(message || '').trim()
  if (!trimmed) {
    return res.status(422).json({ detail: 'Message text is required.' })
  }

  const safeMode = ['fast', 'standard', 'search', 'maps'].includes(mode) ? mode : 'standard'
  const model = resolveFreeTierModel(safeMode)
  const safeHistory = Array.isArray(history)
    ? history
        .filter(item => item && (item.role === 'user' || item.role === 'model') && String(item.text || '').trim())
        .slice(-24)
        .map(item => ({ role: item.role, parts: [{ text: String(item.text).slice(0, 8000) }] }))
    : []

  const config = {}
  if (systemInstruction && String(systemInstruction).trim()) {
    config.systemInstruction = String(systemInstruction).trim().slice(0, 4000)
  }
  if (safeMode === 'search') {
    config.tools = [{ googleSearch: {} }]
  } else if (safeMode === 'maps') {
    config.tools = [{ googleMaps: {} }]
    const coords = normalizeLatLng(latLng)
    if (coords) {
      config.toolConfig = { retrievalConfig: { latLng: coords } }
    }
  }

  try {
    const response = await withGeminiRetry(() => {
      const chat = ai.chats.create({ model, history: safeHistory, config })
      return chat.sendMessage({ message: trimmed })
    })
    const grounding = extractGroundingMetadata(response)
    res.json({
      text: response.text || '',
      model,
      mode: safeMode,
      ...grounding,
    })
  } catch (err) {
    const formatted = formatGeminiError(err)
    res.status(formatted.status).json({ error: 'Gemini chat request failed', detail: formatted.detail })
  }
})

app.post('/api/ai/search', async (req, res) => {
  const ai = getGeminiClient()
  if (!ai) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server.',
      detail: 'Server-side Gemini API key is unavailable.',
    })
  }
  const { query, context = '' } = req.body || {}
  const trimmed = String(query || '').trim()
  if (!trimmed) {
    return res.status(422).json({ detail: 'Search query is required.' })
  }
  const prompt = context
    ? `Context: ${String(context).slice(0, 1200)}\n\nQuestion: ${trimmed}`
    : trimmed

  try {
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: 'You are a Kenya motorcycle spare parts and supply-chain verification specialist. Use Google Search to confirm OEM part numbers, bike model fitment (Bajaj Boxer, TVS HLX, Honda Ace, Skygo, Hero), and market price ranges in KES.',
          tools: [{ googleSearch: {} }],
        },
      }),
    )
    const grounding = extractGroundingMetadata(response)
    res.json({
      text: response.text || '',
      model: 'gemini-4-hydrogen',
      webSources: grounding.webSources,
      webSearchQueries: grounding.webSearchQueries,
    })
  } catch (err) {
    const formatted = formatGeminiError(err)
    res.status(formatted.status).json({ error: 'Gemini search grounding request failed', detail: formatted.detail })
  }
})

app.post('/api/ai/maps', async (req, res) => {
  const ai = getGeminiClient()
  if (!ai) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server.',
      detail: 'Server-side Gemini API key is unavailable.',
    })
  }
  const { query, latLng } = req.body || {}
  const trimmed = String(query || '').trim()
  if (!trimmed) {
    return res.status(422).json({ detail: 'Maps location query is required.' })
  }
  const coords = normalizeLatLng(latLng)
  const config = {
    systemInstruction: 'You are a Kenya motorcycle parts logistics and supplier locator assistant. Use Google Maps to identify nearby spare-parts wholesalers, boda-boda garages, courier hubs, and industrial depots.',
    tools: [{ googleMaps: {} }],
  }
  if (coords) {
    config.toolConfig = { retrievalConfig: { latLng: coords } }
  }

  try {
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: trimmed,
        config,
      }),
    )
    const grounding = extractGroundingMetadata(response)
    res.json({
      text: response.text || '',
      model: 'gemini-4-hydrogen',
      mapPlaces: grounding.mapPlaces,
    })
  } catch (err) {
    const formatted = formatGeminiError(err)
    res.status(formatted.status).json({ error: 'Gemini Maps grounding request failed', detail: formatted.detail })
  }
})

const distDir = path.join(__dirname, 'frontend', 'dist')
app.use(express.static(distDir))

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = Number(process.env.PORT) || 3000
app.listen(port, '0.0.0.0', () => {
  console.log(`KenyaMoto Supply Hub listening on http://0.0.0.0:${port}`)
})
