import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import nodemailer from 'nodemailer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json())

// Observability (OPS-001/002/003) & API Rate Limiting (INT-014/SEC-010)
const RATE_WINDOW_MS = 60_000
const RATE_MAX_REQUESTS = 120
const rateBuckets = new Map()
const apiMetrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  apiRequests: 0,
  errors4xx: 0,
  errors5xx: 0,
  rateLimitedCount: 0,
  latenciesMs: [],
  recentLogs: [],
}

function recordMetricSample(entry) {
  apiMetrics.totalRequests += 1
  if (entry.path.startsWith('/api')) apiMetrics.apiRequests += 1
  if (entry.status >= 500) apiMetrics.errors5xx += 1
  else if (entry.status >= 400) apiMetrics.errors4xx += 1
  apiMetrics.latenciesMs.push(entry.durationMs)
  if (apiMetrics.latenciesMs.length > 200) apiMetrics.latenciesMs.shift()
  if (entry.path.startsWith('/api') || entry.path.startsWith('/health')) {
    apiMetrics.recentLogs.unshift(entry)
    if (apiMetrics.recentLogs.length > 40) apiMetrics.recentLogs.pop()
  }
}

app.use((req, res, next) => {
  const incomingId = String(req.get('x-request-id') || '').trim().slice(0, 64)
  const requestId = incomingId || randomUUID()
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  const start = Date.now()
  res.on('finish', () => {
    const durationMs = Date.now() - start
    const entry = {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      timestamp: new Date().toISOString(),
    }
    recordMetricSample(entry)
    if (req.path.startsWith('/api')) {
      console.log(JSON.stringify({ level: res.statusCode >= 500 ? 'error' : 'info', ...entry }))
    }
  })
  next()
})

app.use('/api', (req, res, next) => {
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const hits = (rateBuckets.get(clientIp) || []).filter(ts => ts > cutoff)
  if (hits.length >= RATE_MAX_REQUESTS) {
    apiMetrics.rateLimitedCount += 1
    res.setHeader('Retry-After', '60')
    return res.status(429).json({
      error: 'Too many API requests',
      detail: 'API rate limit exceeded (120 requests/minute). Please retry shortly.',
      requestId: req.requestId,
    })
  }
  hits.push(now)
  rateBuckets.set(clientIp, hits)
  next()
})

const ORG_ID = 'org-kenyamotor'
const ORG_KIRINYAGA_ID = 'org-kirinyaga'
const ORG_RIFTVALLEY_ID = 'org-riftvalley'
const BRANCH_CBD_ID = 'branch-cbd'
const BRANCH_IND_ID = 'branch-ind'
const BRANCH_KIR_ID = 'branch-kir-main'
const BRANCH_NGARA_ID = 'branch-ngara'
const BRANCH_NAKURU_ID = 'branch-nakuru'
const BRANCH_ELDORET_ID = 'branch-eldoret'

// MOCKED — in-memory store replacing PostgreSQL / Supabase RPCs when offline
const organizations = new Map([
  [ORG_ID, {
    id: ORG_ID,
    name: 'Kenya Motor',
    org_type: 'RETAIL',
    kra_compliance_enabled: true,
    payroll_compliance_enabled: true,
  }],
  [ORG_KIRINYAGA_ID, {
    id: ORG_KIRINYAGA_ID,
    name: 'Kirinyaga Spares & Workshop',
    org_type: 'RETAIL',
    kra_compliance_enabled: true,
    payroll_compliance_enabled: false,
  }],
  [ORG_RIFTVALLEY_ID, {
    id: ORG_RIFTVALLEY_ID,
    name: 'Rift Valley Boda Parts',
    org_type: 'WHOLESALER',
    kra_compliance_enabled: true,
    payroll_compliance_enabled: true,
  }],
])

const branches = new Map([
  [BRANCH_CBD_ID, { id: BRANCH_CBD_ID, organization_id: ORG_ID, name: 'Kenya Motor — Nairobi CBD Shop' }],
  [BRANCH_IND_ID, { id: BRANCH_IND_ID, organization_id: ORG_ID, name: 'Kenya Motor — Industrial Area Depot' }],
  [BRANCH_KIR_ID, { id: BRANCH_KIR_ID, organization_id: ORG_KIRINYAGA_ID, name: 'Kirinyaga Rd Counter & Workshop' }],
  [BRANCH_NGARA_ID, { id: BRANCH_NGARA_ID, organization_id: ORG_KIRINYAGA_ID, name: 'Ngara Boda Service Bay' }],
  [BRANCH_NAKURU_ID, { id: BRANCH_NAKURU_ID, organization_id: ORG_RIFTVALLEY_ID, name: 'Nakuru Main Shop' }],
  [BRANCH_ELDORET_ID, { id: BRANCH_ELDORET_ID, organization_id: ORG_RIFTVALLEY_ID, name: 'Eldoret Spares Depot' }],
])

const usernameDirectory = new Map([
  ['owner', 'owner@kenyamoto.co.ke'],
  ['kenyamotor', 'owner@kenyamoto.co.ke'],
  ['agrihq', 'agrihq.africa@gmail.com'],
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

function getAppBaseUrl(req) {
  const configured = (process.env.APP_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http'
  return `${proto}://${req.get('host')}`
}

const CREDENTIALS_STORE_PATH = path.join(os.tmpdir(), 'kms-auth-credentials.json')

function readCredentialStore() {
  try {
    if (!fs.existsSync(CREDENTIALS_STORE_PATH)) return {}
    const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_STORE_PATH, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCredentialStore(store) {
  try {
    fs.writeFileSync(CREDENTIALS_STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 })
  } catch {
    // ignore disk write errors in read-only environments
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${derived}`
}

function verifyPassword(password, storedHash) {
  const [salt, keyHex] = String(storedHash || '').split(':')
  if (!salt || !keyHex) return false
  const derived = scryptSync(String(password), salt, 64)
  const expected = Buffer.from(keyHex, 'hex')
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

const credentialUsers = new Map(Object.entries(readCredentialStore()))
for (const record of credentialUsers.values()) {
  if (record?.username && record?.email) {
    usernameDirectory.set(record.username.toLowerCase(), record.email.toLowerCase())
  }
}

const ALLOWED_STAFF_ROLES = new Set(['owner', 'manager', 'cashier', 'accountant', 'storekeeper'])

function buildSafeAccountView(record) {
  return {
    id: record.id,
    name: record.name || record.displayName || record.username,
    email: record.email,
    username: record.username,
    displayName: record.name || record.displayName || record.username,
    role: record.role || 'owner',
    organizationId: record.organizationId || null,
    branchId: record.branchId || null,
    status: record.status || 'Active',
    memberships: Array.isArray(record.memberships) ? record.memberships : null,
    createdAt: record.createdAt || null,
  }
}

app.post('/api/auth/credentials/register', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!email.includes('@')) {
    return res.status(422).json({ detail: 'Enter a valid email address.' })
  }
  if (password.length < 6) {
    return res.status(422).json({ detail: 'Use at least 6 characters for your password.' })
  }
  if (credentialUsers.has(email)) {
    return res.status(409).json({
      code: 'auth/email-already-in-use',
      detail: 'An account with this email already exists. Sign in or reset your password.',
    })
  }
  const cleanUser = username.length >= 2 ? username : email.split('@')[0]
  const record = {
    id: `cred-${randomUUID()}`,
    name: cleanUser,
    email,
    username: cleanUser,
    displayName: cleanUser,
    role: 'owner',
    organizationId: null,
    branchId: null,
    status: 'Active',
    memberships: null,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  }
  credentialUsers.set(email, record)
  usernameDirectory.set(cleanUser, email)
  writeCredentialStore(Object.fromEntries(credentialUsers.entries()))
  return res.status(201).json({
    ok: true,
    user: {
      ...buildSafeAccountView(record),
      emailVerified: true,
    },
  })
})

app.post('/api/auth/credentials/login', (req, res) => {
  const rawIdentifier = String(req.body?.identifier || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!rawIdentifier || !password) {
    return res.status(422).json({ detail: 'Email and password are required.' })
  }
  const resolvedEmail = rawIdentifier.includes('@')
    ? rawIdentifier
    : (usernameDirectory.get(rawIdentifier) || '')
  const record = resolvedEmail ? credentialUsers.get(resolvedEmail) : null
  if (!record) {
    return res.status(404).json({
      code: 'CREDENTIAL_USER_NOT_FOUND',
      detail: 'No account found for this email.',
    })
  }
  if (record.status === 'Deactivated') {
    return res.status(403).json({
      code: 'auth/user-disabled',
      detail: 'This staff account has been deactivated by the company owner.',
    })
  }
  if (!verifyPassword(password, record.passwordHash)) {
    return res.status(401).json({
      code: 'auth/invalid-credential',
      detail: 'Invalid email or password. Please try again.',
    })
  }
  return res.json({
    ok: true,
    user: {
      ...buildSafeAccountView(record),
      emailVerified: true,
    },
  })
})

app.get('/api/staff/accounts', (req, res) => {
  const orgId = String(req.query?.organizationId || '').trim()
  const rows = [...credentialUsers.values()]
    .filter(r => r.organizationId && (!orgId || r.organizationId === orgId))
    .map(buildSafeAccountView)
  res.json({ staff: rows })
})

app.post('/api/staff/accounts', (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const rawUsername = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const role = String(req.body?.role || 'cashier').trim().toLowerCase()
  const organizationId = String(req.body?.organizationId || '').trim()
  const organizationName = String(req.body?.organizationName || 'Company Workspace').trim()
  const orgType = String(req.body?.orgType || 'RETAIL').trim()
  const branchId = String(req.body?.branchId || '').trim()
  const branchName = String(req.body?.branchName || 'Main Branch').trim()
  const area = String(req.body?.area || 'Kenya').trim()

  if (!name || name.length < 2) {
    return res.status(422).json({ detail: 'Staff full name is required.' })
  }
  if (!email.includes('@')) {
    return res.status(422).json({ detail: 'Valid staff email address is required.' })
  }
  if (!ALLOWED_STAFF_ROLES.has(role)) {
    return res.status(422).json({ detail: 'Select a valid team role.' })
  }
  if (!organizationId || !branchId) {
    return res.status(422).json({ detail: 'Company and assigned branch are required.' })
  }
  if (password.length < 6) {
    return res.status(422).json({ detail: 'Staff password must be at least 6 characters.' })
  }

  const existing = credentialUsers.get(email)
  const cleanUser =
    rawUsername.length >= 2
      ? rawUsername
      : existing?.username || email.split('@')[0].replace(/[^a-z0-9_.-]/g, '')

  const memberships = [
    {
      organization_id: organizationId,
      organization_name: organizationName,
      org_type: orgType,
      branch_id: branchId,
      branch_name: branchName,
      area,
      role,
    },
  ]

  const record = {
    id: existing?.id || `staff-${randomUUID()}`,
    name,
    email,
    username: cleanUser,
    displayName: name,
    role,
    organizationId,
    branchId,
    status: 'Active',
    memberships,
    passwordHash: hashPassword(password),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  credentialUsers.set(email, record)
  usernameDirectory.set(cleanUser, email)
  writeCredentialStore(Object.fromEntries(credentialUsers.entries()))

  return res.status(existing ? 200 : 201).json({
    ok: true,
    staff: buildSafeAccountView(record),
  })
})

app.patch('/api/staff/accounts/:email/status', (req, res) => {
  const email = decodeURIComponent(String(req.params.email || '')).trim().toLowerCase()
  const record = credentialUsers.get(email)
  if (!record) {
    return res.status(404).json({ detail: 'Staff credential account not found.' })
  }
  if (req.body?.status && ['Active', 'Deactivated'].includes(req.body.status)) {
    record.status = req.body.status
  }
  if (req.body?.role && ALLOWED_STAFF_ROLES.has(req.body.role)) {
    record.role = req.body.role
    if (Array.isArray(record.memberships) && record.memberships[0]) {
      record.memberships[0].role = req.body.role
    }
  }
  if (req.body?.branchId) {
    record.branchId = String(req.body.branchId)
    if (Array.isArray(record.memberships) && record.memberships[0]) {
      record.memberships[0].branch_id = String(req.body.branchId)
      if (req.body?.branchName) record.memberships[0].branch_name = String(req.body.branchName)
      if (req.body?.area) record.memberships[0].area = String(req.body.area)
    }
  }
  record.updatedAt = new Date().toISOString()
  credentialUsers.set(email, record)
  writeCredentialStore(Object.fromEntries(credentialUsers.entries()))
  return res.json({ ok: true, staff: buildSafeAccountView(record) })
})

app.post('/api/auth/register-username', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!username || username.length < 2 || !email.includes('@')) {
    return res.status(422).json({ detail: 'Valid username and email are required.' })
  }
  usernameDirectory.set(username, email)
  res.status(201).json({ username, email })
})

app.post('/api/auth/resolve-username', (req, res) => {
  const identifier = String(req.body?.identifier || '').trim().toLowerCase()
  if (!identifier) return res.status(422).json({ detail: 'Username or email is required.' })
  if (identifier.includes('@')) {
    return res.json({ email: identifier })
  }
  const email = usernameDirectory.get(identifier) || null
  if (!email) {
    return res.status(404).json({ detail: `No account email linked to username "${identifier}". Sign in with your email address or create an account first.` })
  }
  res.json({ email, username: identifier })
})

app.get('/api/auth/github/url', (req, res) => {
  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim()
  const baseUrl = getAppBaseUrl(req)
  const redirectUri = `${baseUrl}/auth/github/callback`
  if (!clientId) {
    return res.json({ configured: false, callbackUrl: redirectUri, url: '' })
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
  })
  res.json({
    configured: true,
    callbackUrl: redirectUri,
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
  })
})

async function handleGithubCallback(req, res) {
  const code = String(req.query.code || '').trim()
  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GITHUB_CLIENT_SECRET || '').trim()
  const baseUrl = getAppBaseUrl(req)
  const redirectUri = `${baseUrl}/auth/github/callback`

  if (!code || !clientId || !clientSecret) {
    return res.status(400).send(`
      <html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', provider: 'github', error: 'GitHub OAuth is not configured on the server.' }, '*');
          window.close();
        }
      </script><p>GitHub OAuth is not configured on the server.</p></body></html>
    `)
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Failed to obtain GitHub access token.')
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'kenya-motorcycle-spare-parts-general' },
    })
    const ghUser = await userRes.json()

    let primaryEmail = ghUser.email || ''
    if (!primaryEmail) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'kenya-motorcycle-spare-parts-general' },
      })
      const emails = await emailsRes.json().catch(() => [])
      const verified = Array.isArray(emails) ? emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0] : null
      primaryEmail = verified?.email || `${ghUser.login || 'github'}@users.noreply.github.com`
    }

    const payload = {
      type: 'OAUTH_AUTH_SUCCESS',
      provider: 'github',
      user: {
        id: `github-${ghUser.id}`,
        email: primaryEmail,
        username: ghUser.login || '',
        displayName: ghUser.name || ghUser.login || 'GitHub User',
        photoURL: ghUser.avatar_url || '',
      },
    }
    const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c')
    return res.send(`
      <html><body><script>
        if (window.opener) {
          window.opener.postMessage(${safeJson}, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script><p>GitHub sign-in successful. Closing window…</p></body></html>
    `)
  } catch (err) {
    const safeErr = JSON.stringify({ type: 'OAUTH_AUTH_ERROR', provider: 'github', error: err.message || 'GitHub OAuth failed' }).replace(/</g, '\\u003c')
    return res.status(500).send(`
      <html><body><script>
        if (window.opener) {
          window.opener.postMessage(${safeErr}, '*');
          window.close();
        }
      </script><p>GitHub authentication error.</p></body></html>
    `)
  }
}

app.get(['/auth/github/callback', '/auth/github/callback/'], handleGithubCallback)

app.get('/api/email/status', (_req, res) => {
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  const hasResend = Boolean(process.env.RESEND_API_KEY)
  res.json({
    configured: hasSmtp || hasResend,
    provider: hasSmtp ? 'smtp' : hasResend ? 'resend' : null,
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@kenyamotospares.co.ke',
  })
})

app.get('/api/observability/metrics', (req, res) => {
  const sorted = [...apiMetrics.latenciesMs].sort((a, b) => a - b)
  const p95Index = sorted.length ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : 0
  const p95LatencyMs = sorted.length ? sorted[p95Index] : 0
  const error5xxRatePct = apiMetrics.totalRequests
    ? Number(((apiMetrics.errors5xx / apiMetrics.totalRequests) * 100).toFixed(2))
    : 0
  res.json({
    requestId: req.requestId,
    startedAt: apiMetrics.startedAt,
    totalRequests: apiMetrics.totalRequests,
    apiRequests: apiMetrics.apiRequests,
    errors4xx: apiMetrics.errors4xx,
    errors5xx: apiMetrics.errors5xx,
    error5xxRatePct,
    p95LatencyMs,
    rateLimitedCount: apiMetrics.rateLimitedCount,
    rateLimitPolicy: { maxRequests: RATE_MAX_REQUESTS, windowSeconds: RATE_WINDOW_MS / 1000 },
    integrations: {
      geminiAi: Boolean((process.env.GEMINI_API_KEY || '').trim()),
      email: Boolean((process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.RESEND_API_KEY),
      githubOAuth: Boolean((process.env.GITHUB_CLIENT_ID || '').trim() && (process.env.GITHUB_CLIENT_SECRET || '').trim()),
      supabase: Boolean((process.env.VITE_SUPABASE_URL || '').trim() && (process.env.VITE_SUPABASE_ANON_KEY || '').trim()),
    },
    recentLogs: apiMetrics.recentLogs.slice(0, 15),
  })
})

app.post('/api/email/send', async (req, res) => {
  const to = String(req.body?.to || '').trim()
  const subject = String(req.body?.subject || '').trim()
  const text = String(req.body?.text || '').trim()
  if (!to || !to.includes('@') || !subject || !text) {
    return res.status(422).json({ detail: 'Valid recipient email, subject, and message body are required.' })
  }

  const smtpHost = (process.env.SMTP_HOST || '').trim()
  const smtpUser = (process.env.SMTP_USER || '').trim()
  const smtpPass = (process.env.SMTP_PASS || '').trim()
  const smtpPort = Number(process.env.SMTP_PORT || 587)
  const from = (process.env.SMTP_FROM || smtpUser || 'Kenya Motorcycle Spare Parts General <onboarding@resend.dev>').trim()

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      })
      const info = await transporter.sendMail({
        from,
        to,
        subject: subject.slice(0, 200),
        text: text.slice(0, 10000),
      })
      return res.json({ ok: true, to, provider: 'smtp', messageId: info.messageId })
    } catch (err) {
      return res.status(502).json({ error: 'SMTP delivery failed', detail: err.message || 'Check SMTP credentials.' })
    }
  }

  const resendKey = (process.env.RESEND_API_KEY || '').trim()
  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.SMTP_FROM || 'Kenya Motorcycle Spare Parts General <onboarding@resend.dev>',
          to: [to],
          subject: subject.slice(0, 200),
          text: text.slice(0, 10000),
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        return res.status(502).json({ error: 'Resend delivery failed', detail: data.message || 'Unable to send email.' })
      }
      return res.json({ ok: true, to, provider: 'resend', messageId: data.id || 'sent' })
    } catch (err) {
      return res.status(502).json({ error: 'Resend delivery failed', detail: err.message || 'Unable to send email.' })
    }
  }

  return res.status(503).json({
    error: 'Email delivery is not configured on the server.',
    detail: 'Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS (for Gmail/SMTP) or RESEND_API_KEY in AI Studio Secrets to deliver mail to your inbox.',
  })
})

const otpChallenges = new Map()
const revokedSessionsBefore = new Map()

function buildIntegrationRegistry() {
  const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  const resendReady = Boolean(process.env.RESEND_API_KEY)
  const whatsappReady = Boolean(process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
  const smsReady = Boolean(process.env.SMS_API_KEY && (process.env.SMS_SENDER_ID || process.env.TWILIO_ACCOUNT_SID))
  const bucketReady = Boolean(process.env.STORAGE_BUCKET_NAME || process.env.FIREBASE_STORAGE_BUCKET)
  const pgReady = Boolean(process.env.DATABASE_URL)

  return [
    {
      id: 'int-gemini',
      name: 'Gemini AI Co-Pilot & Grounding',
      category: 'AI',
      configured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
      requiredSecrets: ['GEMINI_API_KEY'],
      endpoint: '/api/ai/chat',
    },
    {
      id: 'int-email',
      name: 'Transactional Email (SMTP / Resend)',
      category: 'Notifications',
      configured: smtpReady || resendReady,
      requiredSecrets: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'RESEND_API_KEY'],
      endpoint: '/api/email/send',
    },
    {
      id: 'int-whatsapp',
      name: 'Meta WhatsApp Business Cloud API',
      category: 'Notifications',
      configured: whatsappReady,
      requiredSecrets: ['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN'],
      endpoint: '/api/notifications/whatsapp',
    },
    {
      id: 'int-sms',
      name: 'Kenyan SMS Gateway (Africa\'s Talking / Twilio)',
      category: 'Notifications & OTP',
      configured: smsReady,
      requiredSecrets: ['SMS_API_KEY', 'SMS_USERNAME', 'SMS_SENDER_ID'],
      endpoint: '/api/notifications/sms',
    },
    {
      id: 'int-github-oauth',
      name: 'GitHub OAuth Sign-In',
      category: 'Identity',
      configured: Boolean((process.env.GITHUB_CLIENT_ID || '').trim() && (process.env.GITHUB_CLIENT_SECRET || '').trim()),
      requiredSecrets: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
      endpoint: '/api/auth/github/url',
    },
    {
      id: 'int-storage',
      name: 'Cloud Object Storage Bucket (Part Images & PDFs)',
      category: 'Media Storage',
      configured: bucketReady,
      requiredSecrets: ['STORAGE_BUCKET_NAME'],
      endpoint: 'Client mediaVault compressed locally; bucket upload awaits STORAGE_BUCKET_NAME',
    },
    {
      id: 'int-postgres',
      name: 'PostgreSQL / Supabase Ledger & Migration Pack',
      category: 'Database',
      configured: pgReady,
      requiredSecrets: ['DATABASE_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      endpoint: 'migrations/004_phase0_1_2_ledger_sync_governance.sql',
    },
  ]
}

app.get('/api/integrations/registry', (req, res) => {
  res.json({
    requestId: req.requestId,
    generatedAt: new Date().toISOString(),
    integrations: buildIntegrationRegistry(),
  })
})

app.post('/api/notifications/whatsapp', async (req, res) => {
  const { to, message, customerConsentWhatsApp = true } = req.body || {}
  if (customerConsentWhatsApp === false) {
    return res.status(422).json({ detail: 'Suppressed: customer opted out of WhatsApp messaging (consentWhatsApp=false).' })
  }
  const phone = String(to || '').replace(/\s+/g, '')
  const text = String(message || '').trim()
  if (!phone || !text) {
    return res.status(422).json({ detail: 'Recipient phone (+254...) and message body are required.' })
  }
  const token = (process.env.WHATSAPP_CLOUD_TOKEN || '').trim()
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()
  if (!token || !phoneId) {
    return res.status(503).json({
      error: 'WhatsApp Cloud API credentials are not configured.',
      detail: 'Set WHATSAPP_CLOUD_TOKEN and WHATSAPP_PHONE_NUMBER_ID in AI Studio Secrets to dispatch live WhatsApp messages.',
    })
  }
  try {
    const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/^\+/, ''),
        type: 'text',
        text: { body: text.slice(0, 1000) },
      }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      return res.status(502).json({ error: 'WhatsApp Cloud dispatch failed', detail: data?.error?.message || 'Gateway error' })
    }
    return res.json({ ok: true, provider: 'whatsapp_cloud', messageId: data?.messages?.[0]?.id || 'sent' })
  } catch (err) {
    return res.status(502).json({ error: 'WhatsApp Cloud dispatch failed', detail: err.message })
  }
})

app.post('/api/notifications/sms', async (req, res) => {
  const { to, message, customerConsentSms = true } = req.body || {}
  if (customerConsentSms === false) {
    return res.status(422).json({ detail: 'Suppressed: customer opted out of SMS messaging (consentSms=false).' })
  }
  const phone = String(to || '').trim()
  const text = String(message || '').trim()
  if (!phone || !text) {
    return res.status(422).json({ detail: 'Recipient phone (+254...) and message body are required.' })
  }
  const apiKey = (process.env.SMS_API_KEY || '').trim()
  const username = (process.env.SMS_USERNAME || '').trim()
  if (!apiKey || !username) {
    return res.status(503).json({
      error: 'SMS Gateway credentials are not configured.',
      detail: 'Set SMS_API_KEY, SMS_USERNAME, and SMS_SENDER_ID in AI Studio Secrets to dispatch live SMS alerts.',
    })
  }
  try {
    const formBody = new URLSearchParams({
      username,
      to: phone,
      message: text.slice(0, 480),
      ...(process.env.SMS_SENDER_ID ? { from: process.env.SMS_SENDER_ID } : {}),
    })
    const resp = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      return res.status(502).json({ error: 'SMS dispatch failed', detail: data?.SMSMessageData?.Message || 'Gateway error' })
    }
    return res.json({ ok: true, provider: 'africastalking', response: data?.SMSMessageData || {} })
  } catch (err) {
    return res.status(502).json({ error: 'SMS dispatch failed', detail: err.message })
  }
})

app.post('/api/auth/otp/request', async (req, res) => {
  const phone = String(req.body?.phone || '').replace(/\s+/g, '')
  if (!/^\+?\d{9,15}$/.test(phone)) {
    return res.status(422).json({ detail: 'Enter a valid mobile phone number (e.g. +254712345678).' })
  }
  const smsKey = (process.env.SMS_API_KEY || '').trim()
  const smsUser = (process.env.SMS_USERNAME || '').trim()
  const code = String(randomInt(100000, 999999))
  const digest = createHash('sha256').update(`${phone}:${code}`).digest('hex')
  otpChallenges.set(phone, { digest, expiresAt: Date.now() + 5 * 60_000, attempts: 0 })

  if (!smsKey || !smsUser) {
    return res.status(503).json({
      error: 'SMS OTP gateway not configured.',
      detail: 'Phone OTP challenge prepared, but SMS_API_KEY and SMS_USERNAME secrets are required to send live SMS verification codes. Sign in using Username/Email + Password, Gmail, or GitHub.',
    })
  }
  try {
    const formBody = new URLSearchParams({
      username: smsUser,
      to: phone,
      message: `Your Kenya Motorcycle Spare Parts General verification code is ${code}. Valid for 5 minutes.`,
    })
    const resp = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: { apiKey: smsKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    })
    if (!resp.ok) {
      return res.status(502).json({ detail: 'Failed to dispatch SMS OTP via gateway.' })
    }
    return res.json({ ok: true, phone, expiresInSeconds: 300 })
  } catch (err) {
    return res.status(502).json({ detail: err.message || 'SMS OTP gateway unreachable.' })
  }
})

app.post('/api/auth/otp/verify', (req, res) => {
  const phone = String(req.body?.phone || '').replace(/\s+/g, '')
  const code = String(req.body?.code || '').trim()
  const entry = otpChallenges.get(phone)
  if (!entry || Date.now() > entry.expiresAt) {
    otpChallenges.delete(phone)
    return res.status(401).json({ detail: 'OTP challenge expired or not found. Request a new code.' })
  }
  entry.attempts += 1
  if (entry.attempts > 5) {
    otpChallenges.delete(phone)
    return res.status(429).json({ detail: 'Too many invalid OTP attempts. Request a new code.' })
  }
  const candidate = createHash('sha256').update(`${phone}:${code}`).digest('hex')
  if (candidate !== entry.digest) {
    return res.status(401).json({ detail: 'Incorrect verification code.' })
  }
  otpChallenges.delete(phone)
  return res.json({
    ok: true,
    user: {
      id: `phone-${phone.replace(/^\+/, '')}`,
      email: `${phone.replace(/^\+/, '')}@phone.kenyamoto.local`,
      phone,
      displayName: `Rider/Staff (${phone})`,
    },
  })
})

app.post('/api/auth/sessions/revoke', (req, res) => {
  const userId = String(req.body?.userId || '').trim()
  if (!userId) return res.status(422).json({ detail: 'userId is required.' })
  const revokedAt = Date.now()
  revokedSessionsBefore.set(userId, revokedAt)
  res.json({ ok: true, userId, revokedAt })
})

app.get('/api/auth/sessions/status', (req, res) => {
  const userId = String(req.query?.userId || '').trim()
  const sessionStartedAt = Number(req.query?.sessionStartedAt || 0)
  const revokedBefore = revokedSessionsBefore.get(userId) || 0
  const revoked = Boolean(userId && revokedBefore > 0 && (!sessionStartedAt || sessionStartedAt < revokedBefore))
  res.json({ userId, revoked, revokedBefore: revokedBefore || null })
})

const distDir = path.join(__dirname, 'frontend', 'dist')
app.use(express.static(distDir))

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = Number(process.env.PORT) || 3000
app.listen(port, '0.0.0.0', () => {
  console.log(`Kenya Motorcycle Spare Parts General listening on http://0.0.0.0:${port}`)
})
