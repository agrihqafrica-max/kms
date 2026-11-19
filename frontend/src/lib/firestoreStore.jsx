import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { auth, db, handleFirestoreError, OperationType } from './firebase.js'
import { useAuth } from '../auth/context.js'
import { nairobiDay } from './format.js'
import {
  allocateLandedCost,
  classifyStockVelocity,
  computeGrnSettlement,
  computePosSaleTotals,
  detectOutboxConflict,
  enqueueOfflineSale,
  evaluateChurnRisk,
  validateSplitPayments,
} from './kmsDomain.js'
import {
  buildExpenseJournalEntry,
  buildGrnReceiptJournalEntry,
  buildPurchaseReturnJournalEntry,
  buildReturnReversalJournalEntry,
  buildReversingJournalEntry,
  buildSaleJournalEntry,
  buildVarianceJournalEntry,
} from './accountingEngine.js'
import {
  buildApiKeyMetadata,
  buildPackBreakMovements,
  buildWorkspaceBackupPayload,
  computeShiftReconciliation,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_TENANT_SETTINGS,
  evaluateNotificationDelivery,
  renderNotificationTemplate,
  validateReturnActorSeparation,
  verifyWorkspaceBackupPayload,
} from './platformGovernance.js'
import { BRANCHES, WorkspaceContext } from './workspaceContext.js'
import { readSelection } from '../tenancy/selection.js'

const SEED_BIKE_MODELS = [
  { id: 'bike-boxer-bm150', make: 'Bajaj', model: 'Boxer BM150', variant: 'X / HD', engineCc: 150, yearRange: '2016–2026' },
  { id: 'bike-tvs-hlx125', make: 'TVS', model: 'HLX 125', variant: '5-Gear / Gold', engineCc: 125, yearRange: '2018–2026' },
  { id: 'bike-honda-ace125', make: 'Honda', model: 'Ace CB125', variant: 'D / Tuff', engineCc: 125, yearRange: '2017–2026' },
  { id: 'bike-skygo-sg150', make: 'Skygo', model: 'SG150-8', variant: 'Boda Workhorse', engineCc: 150, yearRange: '2019–2026' },
  { id: 'bike-hero-hunter150', make: 'Hero', model: 'Hunter 150', variant: 'TR', engineCc: 150, yearRange: '2020–2026' },
]

const SEED_LOCATIONS = [
  { id: 'loc-cbd-counter', branchId: 'branch-cbd', name: 'CBD Front Counter & Rack A1', kind: 'Shop Shelf', code: 'A1-FRONT' },
  { id: 'loc-cbd-godown', branchId: 'branch-cbd', name: 'Kirinyaga Upper Godown', kind: 'Godown', code: 'GODOWN-01' },
  { id: 'loc-ind-bay', branchId: 'branch-ind', name: 'Industrial Area Bulk Pallet Bay', kind: 'Warehouse', code: 'IND-BAY-C' },
  { id: 'loc-rider-van', branchId: 'branch-cbd', name: 'Nairobi West Rider Box (KMEB 412J)', kind: 'Transit Vehicle', code: 'VAN-01' },
]

const SEED_STAFF = [
  { id: 'staff-owner-1', name: 'Grace Wambui', email: 'owner@kenyamoto.co.ke', role: 'owner', branchId: 'branch-cbd', status: 'Active', permissions: ['pos', 'inventory', 'procurement', 'finance', 'admin'] },
  { id: 'staff-mgr-1', name: 'Daniel Otieno', email: 'manager.cbd@kenyamoto.co.ke', role: 'manager', branchId: 'branch-cbd', status: 'Active', permissions: ['pos', 'inventory', 'procurement', 'finance'] },
  { id: 'staff-cash-1', name: 'Faith Muthoni', email: 'cashier1@kenyamoto.co.ke', role: 'cashier', branchId: 'branch-cbd', status: 'Active', permissions: ['pos'] },
  { id: 'staff-store-1', name: 'Peter Njoroge', email: 'storekeeper@kenyamoto.co.ke', role: 'storekeeper', branchId: 'branch-ind', status: 'Active', permissions: ['inventory', 'procurement'] },
]

const SEED_DEVICES = [
  { id: 'DEV-COUNTER-01', branchId: 'branch-cbd', deviceName: 'Kirinyaga Counter Terminal #1', capabilities: 'USB Barcode Scanner, 80mm Thermal Printer, Offline POS', status: 'Active', wipePending: false },
  { id: 'DEV-GODOWN-02', branchId: 'branch-ind', deviceName: 'Industrial Area Receiving Tablet', capabilities: 'Barcode Scanner, Stock Count', status: 'Active', wipePending: false },
]

function toSortableValue(val) {
  if (val == null) return Date.now()
  if (typeof val === 'number') return val
  if (typeof val === 'string') return val
  if (typeof val?.toMillis === 'function') return val.toMillis()
  if (typeof val?.seconds === 'number') return val.seconds * 1000
  return 0
}

function sortRecords(rows, field, direction = 'desc') {
  const factor = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = toSortableValue(a?.[field])
    const vb = toSortableValue(b?.[field])
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb) * factor
    }
    return (Number(va) - Number(vb)) * factor
  })
}

function makeSeedInventory(uid) {
  return [
    {
      id: 'sku-bj-csk-150',
      ownerId: uid,
      branchId: 'branch-cbd',
      partName: 'Bajaj Boxer BM150 Chain & Sprocket Kit',
      partNumber: 'BJ-CSK-150',
      category: 'Drivetrain',
      compatibleModels: 'Bajaj Boxer BM150, BM100',
      brand: 'Bajaj Genuine',
      barcode: '6164001500018',
      qualityGrade: 'OEM',
      uom: 'Set',
      packSize: 1,
      binLocation: 'A1-R02',
      reservedQuantity: 2,
      oemCrossRefs: '36DU1007 / DU101220',
      fitmentConfidence: 'verified_fit',
      unitCost: 1450,
      retailPrice: 2200,
      stockQuantity: 18,
      reorderLevel: 5,
      velocityClass: 'normal',
      blindListed: true,
    },
    {
      id: 'sku-tvs-brk-125',
      ownerId: uid,
      branchId: 'branch-cbd',
      partName: 'TVS HLX 125 Rear Brake Shoe Set',
      partNumber: 'TVS-BRK-125',
      category: 'Brakes',
      compatibleModels: 'TVS HLX 125, HLX 150',
      brand: 'TVS Genuine',
      barcode: '6164001250023',
      qualityGrade: 'Genuine',
      uom: 'Pair',
      packSize: 1,
      binLocation: 'B2-R01',
      reservedQuantity: 0,
      oemCrossRefs: 'N9111160',
      fitmentConfidence: 'verified_fit',
      unitCost: 320,
      retailPrice: 550,
      stockQuantity: 34,
      reorderLevel: 10,
      velocityClass: 'slow',
      blindListed: true,
    },
    {
      id: 'sku-ngk-cr8e',
      ownerId: uid,
      branchId: 'branch-cbd',
      partName: 'NGK CR8E Spark Plug (Boxer / TVS)',
      partNumber: 'NGK-CR8E',
      category: 'Ignition',
      compatibleModels: 'Bajaj Boxer, TVS HLX, Honda Ace',
      brand: 'NGK Japan',
      barcode: '0087295112755',
      qualityGrade: 'OEM',
      uom: 'Box',
      packSize: 10,
      binLocation: 'A1-R05',
      reservedQuantity: 0,
      oemCrossRefs: 'NGK-1275 / DENSO-U24ESR',
      fitmentConfidence: 'verified_fit',
      unitCost: 210,
      retailPrice: 380,
      stockQuantity: 3,
      reorderLevel: 12,
      velocityClass: 'fast',
      blindListed: false,
    },
    {
      id: 'sku-hnd-prk-125',
      ownerId: uid,
      branchId: 'branch-cbd',
      partName: 'Honda Ace 125 Piston & Ring Kit (STD)',
      partNumber: 'HND-PRK-125',
      category: 'Engine',
      compatibleModels: 'Honda Ace CB125',
      brand: 'Honda OEM',
      barcode: '6164001250047',
      qualityGrade: 'OEM',
      uom: 'Set',
      packSize: 1,
      binLocation: 'C1-R03',
      reservedQuantity: 1,
      oemCrossRefs: '13101-KYY-900',
      fitmentConfidence: 'verified_fit',
      unitCost: 1850,
      retailPrice: 2950,
      stockQuantity: 9,
      reorderLevel: 4,
      velocityClass: 'normal',
      blindListed: true,
    },
    {
      id: 'sku-bj-cps-150',
      ownerId: uid,
      branchId: 'branch-cbd',
      partName: 'Bajaj Boxer Clutch Plate Set (5-Piece)',
      partNumber: 'BJ-CPS-150',
      category: 'Transmission',
      compatibleModels: 'Bajaj Boxer BM150',
      brand: 'ASK Friction',
      barcode: '6164001500056',
      qualityGrade: 'Aftermarket_A',
      uom: 'Set',
      packSize: 5,
      binLocation: 'A2-R01',
      reservedQuantity: 0,
      oemCrossRefs: '36DU1015',
      fitmentConfidence: 'likely_fit',
      unitCost: 680,
      retailPrice: 1150,
      stockQuantity: 2,
      reorderLevel: 6,
      velocityClass: 'fast',
      blindListed: false,
    },
    {
      id: 'sku-knd-275-17',
      ownerId: uid,
      branchId: 'branch-cbd',
      partName: 'Kenda 2.75-17 Heavy Duty Boda Tyre',
      partNumber: 'KND-275-17',
      category: 'Tyres & Tubes',
      compatibleModels: 'Bajaj Boxer, TVS HLX, Skygo SG150',
      brand: 'Kenda',
      barcode: '4717294002756',
      qualityGrade: 'Genuine',
      uom: 'Piece',
      packSize: 1,
      binLocation: 'D4-BULK',
      reservedQuantity: 4,
      oemCrossRefs: 'K761-275-17-6PR',
      fitmentConfidence: 'verified_fit',
      unitCost: 2300,
      retailPrice: 3450,
      stockQuantity: 42,
      reorderLevel: 6,
      velocityClass: 'dead',
      blindListed: true,
    },
    {
      id: 'sku-sky-stc-150',
      ownerId: uid,
      branchId: 'branch-ind',
      partName: 'Skygo SG150 Stator Coil (8-Pole)',
      partNumber: 'SKY-STC-150',
      category: 'Electrical',
      compatibleModels: 'Skygo SG150, Lifan 150',
      brand: 'Skygo OEM',
      barcode: '6164001500070',
      qualityGrade: 'Genuine',
      uom: 'Piece',
      packSize: 1,
      binLocation: 'E1-R04',
      reservedQuantity: 0,
      oemCrossRefs: 'CG150-8P-DC',
      fitmentConfidence: 'likely_fit',
      unitCost: 1100,
      retailPrice: 1850,
      stockQuantity: 11,
      reorderLevel: 4,
      velocityClass: 'normal',
      blindListed: true,
    },
    {
      id: 'sku-carb-pz26',
      ownerId: uid,
      branchId: 'branch-ind',
      partName: 'PZ26 Carburetor Assembly (150cc)',
      partNumber: 'CARB-PZ26',
      category: 'Fuel System',
      compatibleModels: 'Bajaj Boxer BM150, Skygo SG150',
      brand: 'Keihin Spec',
      barcode: '6164001500087',
      qualityGrade: 'Aftermarket_A',
      uom: 'Piece',
      packSize: 1,
      binLocation: 'E2-R02',
      reservedQuantity: 1,
      oemCrossRefs: 'PZ26-150-MAN',
      fitmentConfidence: 'requires_confirmation',
      unitCost: 1650,
      retailPrice: 2600,
      stockQuantity: 7,
      reorderLevel: 3,
      velocityClass: 'normal',
      blindListed: true,
    },
  ]
}

function makeSeedDocs(uid) {
  const today = nairobiDay()
  return {
    purchaseOrders: [
      {
        id: 'po-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        supplierName: 'Kirinyaga OEM Distributors Ltd',
        orderNumber: 'PO-2026-041',
        itemsSummary: 'NGK-CR8E x 30, BJ-CPS-150 x 15',
        orderedQty: 45,
        receivedQty: 0,
        damagedQty: 0,
        freightCost: 850,
        customsCost: 0,
        handlingCost: 0,
        totalCost: 16500,
        landedCost: 17350,
        status: 'Pending',
      },
      {
        id: 'po-seed-002',
        ownerId: uid,
        branchId: 'branch-ind',
        supplierName: 'Mombasa Road Imports Co.',
        orderNumber: 'PO-2026-039',
        itemsSummary: 'CARB-PZ26 x 12, SKY-STC-150 x 10',
        orderedQty: 22,
        receivedQty: 0,
        damagedQty: 0,
        freightCost: 900,
        customsCost: 350,
        handlingCost: 150,
        totalCost: 30800,
        landedCost: 32200,
        status: 'Pending',
      },
    ],
    suppliers: [
      {
        id: 'sup-seed-001',
        ownerId: uid,
        supplierName: 'Kirinyaga OEM Distributors Ltd',
        category: 'OEM Drivetrain & Ignition',
        area: 'Kirinyaga Road, Nairobi CBD',
        leadTimeDays: 1,
        paymentTerms: 'Net 14',
        fillRatePct: 97.5,
        defectRatePct: 0.6,
        status: 'Verified',
      },
      {
        id: 'sup-seed-002',
        ownerId: uid,
        supplierName: 'Mombasa Road Imports Co.',
        category: 'Container Imports & Engine Kits',
        area: 'Industrial Area, Enterprise Rd',
        leadTimeDays: 3,
        paymentTerms: 'Net 30',
        fillRatePct: 93.0,
        defectRatePct: 1.4,
        status: 'Verified',
      },
      {
        id: 'sup-seed-003',
        ownerId: uid,
        supplierName: 'Rift Valley Rubber & Tyres',
        category: 'Tyres, Tubes & Suspension',
        area: 'Nakuru / Mlolongo Depot',
        leadTimeDays: 4,
        paymentTerms: 'Cash on Delivery',
        fillRatePct: 86.0,
        defectRatePct: 2.8,
        status: 'Probation',
      },
    ],
    stockCounts: [
      {
        id: 'cnt-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        itemId: 'sku-knd-275-17',
        partNumber: 'KND-275-17',
        partName: 'Kenda 2.75-17 Heavy Duty Boda Tyre',
        systemQty: 42,
        countedQty: 40,
        variance: -2,
        unitCost: 2300,
        reason: 'Bin D4 weekly cycle count — 2 tyres issued to workshop sample rack',
        status: 'PendingApproval',
      },
    ],
    transfers: [
      {
        id: 'tr-seed-001',
        ownerId: uid,
        sourceBranchId: 'branch-ind',
        destinationBranchName: 'Nairobi CBD Branch',
        partSummary: 'CARB-PZ26 Carburetor Assembly',
        quantity: 4,
        riderName: 'Joseph Kamau',
        plateNumber: 'KMDX 418B',
        status: 'Pending',
      },
      {
        id: 'tr-seed-002',
        ownerId: uid,
        sourceBranchId: 'branch-cbd',
        destinationBranchName: 'Industrial Area Depot',
        partSummary: 'KND-275-17 Heavy Duty Tyre',
        quantity: 10,
        riderName: 'Pending assignment',
        status: 'Pending',
      },
    ],
    creditAccounts: [
      {
        id: 'cred-seed-001',
        ownerId: uid,
        customerName: 'Thika Road Boda Spares',
        creditLimit: 120000,
        outstandingBalance: 42500,
        lastOrderDaysAgo: 4,
        churnRisk: 'Low',
      },
      {
        id: 'cred-seed-002',
        ownerId: uid,
        customerName: 'Rongai Mechanics Union',
        creditLimit: 60000,
        outstandingBalance: 55200,
        lastOrderDaysAgo: 15,
        churnRisk: 'High',
      },
      {
        id: 'cred-seed-003',
        ownerId: uid,
        customerName: 'Kitengela Two-Wheel Hub',
        creditLimit: 85000,
        outstandingBalance: 18000,
        lastOrderDaysAgo: 13,
        churnRisk: 'Medium',
      },
    ],
    radarRequests: [
      {
        id: 'rad-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        partDescription: 'PZ26 Carburetor Assembly — OEM Spec',
        motorcycleModel: 'Bajaj Boxer BM150',
        urgencyStatus: 'Urgent',
        locationArea: 'Kirinyaga Road, Nairobi',
        quotedPrice: 2450,
        quotedSupplierArea: 'Industrial Area Wholesaler',
        fitConfidence: 'verified_fit',
        disputeStatus: 'None',
        status: 'Open',
      },
      {
        id: 'rad-seed-002',
        ownerId: uid,
        branchId: 'branch-cbd',
        partDescription: 'Heavy Duty Rear Shock Absorber Pair',
        motorcycleModel: 'TVS HLX 125',
        urgencyStatus: 'Normal',
        locationArea: 'Ngara / CBD',
        fitConfidence: 'likely_fit',
        disputeStatus: 'None',
        status: 'Open',
      },
    ],
    expenses: [
      {
        id: 'exp-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        category: 'Boda Courier Dispatch',
        amount: 1450,
        description: 'Same-day parts delivery to Kawangware',
        expenseDate: today,
      },
      {
        id: 'exp-seed-002',
        ownerId: uid,
        branchId: 'branch-ind',
        category: 'Warehouse Handling',
        amount: 2100,
        description: 'Pallet offloading and bin labelling',
        expenseDate: today,
      },
    ],
    payoutBatches: [
      {
        id: 'pay-seed-001',
        ownerId: uid,
        title: 'Weekly Rider Delivery Settlement',
        category: 'RiderSettlement',
        recipientCount: 4,
        totalAmount: 14800,
        status: 'PendingApproval',
      },
      {
        id: 'pay-seed-002',
        ownerId: uid,
        title: 'Mechanic Referral Commissions — Nov Wk 3',
        category: 'ReferralCommission',
        recipientCount: 6,
        totalAmount: 9200,
        status: 'PendingApproval',
      },
    ],
    auditLogs: [
      {
        id: 'aud-seed-001',
        ownerId: uid,
        actionType: 'WORKSPACE_BOOTSTRAP',
        module: 'Foundation',
        summary: 'Initialized multi-branch workspace, inventory ledger, and compliance switches.',
        branchId: 'branch-cbd',
      },
    ],
    customers: [
      {
        id: 'cust-seed-001',
        ownerId: uid,
        fullName: 'James Mwangi',
        phone: '+254712345678',
        bikeModel: 'Bajaj Boxer BM150',
        consentWhatsApp: true,
        consentSms: true,
        consentMarketing: true,
        totalSpent: 15400,
        visitCount: 5,
      },
      {
        id: 'cust-seed-002',
        ownerId: uid,
        fullName: 'Grace Wanjiku',
        phone: '+254722112233',
        bikeModel: 'TVS HLX 125',
        consentWhatsApp: true,
        consentSms: false,
        consentMarketing: false,
        totalSpent: 6800,
        visitCount: 2,
      },
    ],
    salesReturns: [
      {
        id: 'ret-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        saleId: 'sale-seed-001',
        itemId: 'sku-tvs-brk-125',
        partNumber: 'TVS-BRK-125',
        quantity: 1,
        refundAmount: 550,
        refundMethod: 'cash',
        reason: 'Wrong rear drum size for HLX 125 customer bike',
        status: 'PendingApproval',
      },
    ],
    drawerShifts: [
      {
        id: 'shift-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        shiftDay: today,
        openingFloat: 5000,
        expectedCash: 5000,
        status: 'Open',
      },
    ],
    notifications: [
      {
        id: 'ntf-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        templateKey: 'LOW_STOCK_ALERT',
        channel: 'in_app',
        title: 'Low stock: NGK-CR8E',
        body: 'NGK CR8E Spark Plug dropped to 3 units (reorder threshold 12). Draft a PO in Inventory -> Reorder.',
        status: 'Unread',
      },
      {
        id: 'ntf-seed-002',
        ownerId: uid,
        branchId: 'branch-cbd',
        templateKey: 'MARKETING_PROMO',
        channel: 'sms',
        title: 'Suppressed SMS promo: Grace Wanjiku',
        body: 'Marketing SMS suppressed automatically because customer opted out (consentMarketing=false).',
        status: 'Suppressed',
      },
    ],
    journalEntries: [
      {
        id: 'je-seed-001',
        ownerId: uid,
        ...buildSaleJournalEntry({
          branchId: 'branch-cbd',
          saleId: 'sale-seed-001',
          paymentMethod: 'mobile_money_reference',
          totalAmount: 5104,
          vatAmount: 704,
          cogsAmount: 2900,
        }),
        entryNumber: 'JE-SEED-001',
      },
      {
        id: 'je-seed-002',
        ownerId: uid,
        ...buildExpenseJournalEntry({
          branchId: 'branch-cbd',
          expenseId: 'exp-seed-001',
          category: 'Boda Courier Dispatch',
          amount: 1450,
        }),
        entryNumber: 'JE-SEED-002',
      },
    ],
  }
}

function makePreviewState(uid) {
  const inventory = makeSeedInventory(uid).map(item => ({ ...item, createdAt: new Date().toISOString() }))
  const seeds = makeSeedDocs(uid)
  const saved = readSelection(uid)
  return {
    profile: {
      uid,
      displayName: 'Kenya Motor Owner',
      activeOrganizationId: saved.organizationId || 'org-kenyamotor',
      activeBranchId: saved.branchId || 'branch-cbd',
      complianceMode: 'etims_vat',
    },
    inventory,
    stockMovements: [
      {
        id: 'mov-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        itemId: 'sku-bj-csk-150',
        partNumber: 'BJ-CSK-150',
        movementType: 'receipt',
        quantityDelta: 18,
        lotNumber: 'LOT-OPEN-01',
        unitCostSnapshot: 1450,
        reason: 'Opening stock verification',
        createdAt: new Date().toISOString(),
      },
    ],
    purchaseOrders: seeds.purchaseOrders,
    suppliers: seeds.suppliers,
    stockCounts: seeds.stockCounts,
    sales: [
      {
        id: 'sale-seed-001',
        ownerId: uid,
        branchId: 'branch-cbd',
        subtotal: 4400,
        discountAmount: 0,
        vatAmount: 704,
        totalAmount: 5104,
        paymentMethod: 'mobile_money_reference',
        paymentReference: 'TJK8921LM0',
        customerName: 'Walk-in Boda Rider',
        itemCount: 2,
        etimsStatus: 'Accepted',
        createdAt: new Date().toISOString(),
      },
    ],
    expenses: seeds.expenses,
    transfers: seeds.transfers,
    creditAccounts: seeds.creditAccounts,
    radarRequests: seeds.radarRequests,
    etimsInvoices: [
      {
        id: 'etims-seed-001',
        ownerId: uid,
        saleId: 'sale-seed-001',
        invoiceNumber: 'INV-KMS-00104',
        totalAmount: 5104,
        vatAmount: 704,
        cuin: 'KRA-VSCU-9981204A',
        status: 'Accepted',
        createdAt: new Date().toISOString(),
      },
    ],
    payoutBatches: seeds.payoutBatches,
    auditLogs: seeds.auditLogs.map(log => ({ ...log, createdAt: new Date().toISOString() })),
    customers: seeds.customers.map(c => ({ ...c, createdAt: new Date().toISOString() })),
    salesReturns: seeds.salesReturns.map(r => ({ ...r, createdAt: new Date().toISOString() })),
    drawerShifts: seeds.drawerShifts.map(s => ({ ...s, createdAt: new Date().toISOString() })),
    notifications: seeds.notifications.map(n => ({ ...n, createdAt: new Date().toISOString() })),
    journalEntries: seeds.journalEntries.map(j => ({ ...j, createdAt: new Date().toISOString() })),
    chatThreads: [
      {
        id: 'thread-default',
        ownerId: uid,
        title: 'Kenya Motorcycle Spare Parts Co-Pilot',
        rolePreset: 'parts_specialist',
        modelMode: 'standard',
      },
    ],
    messagesByThread: {
      'thread-default': [
        {
          id: 'msg-welcome',
          ownerId: uid,
          role: 'model',
          text: 'Karibu Kenya Motorcycle Spare Parts General. Ask me about OEM part fitment (Boxer BM150, TVS HLX, Honda Ace), stock margins, Google Search market prices, or Google Maps nearby wholesalers.',
          model: 'gemini-4-hydrogen',
          mode: 'standard',
        },
      ],
    },
  }
}

export function WorkspaceProvider({ children }) {
  const { session } = useAuth()
  const uid = session?.user?.id || null
  const isFirebaseSession = Boolean(auth.currentUser && auth.currentUser.uid === uid && auth.currentUser.emailVerified)

  const [ready, setReady] = useState(false)
  const [asyncError, setAsyncError] = useState(null)
  const reportAsyncFirestoreError = useCallback((err, operationType, path) => {
    try {
      handleFirestoreError(err, operationType, path)
    } catch (wrapped) {
      setAsyncError(wrapped)
    }
  }, [])
  const [profile, setProfile] = useState(() => {
    const saved = readSelection(uid)
    return {
      uid: uid || 'local-owner',
      displayName: session?.user?.displayName || 'Kenya Motor Owner',
      activeOrganizationId: saved.organizationId || 'org-kenyamotor',
      activeBranchId: saved.branchId || 'branch-cbd',
      complianceMode: 'etims_vat',
    }
  })
  const [inventory, setInventory] = useState([])
  const [stockMovements, setStockMovements] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [stockCounts, setStockCounts] = useState([])
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [transfers, setTransfers] = useState([])
  const [creditAccounts, setCreditAccounts] = useState([])
  const [radarRequests, setRadarRequests] = useState([])
  const [etimsInvoices, setEtimsInvoices] = useState([])
  const [payoutBatches, setPayoutBatches] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [customers, setCustomers] = useState([])
  const [salesReturns, setSalesReturns] = useState([])
  const [drawerShifts, setDrawerShifts] = useState([])
  const [notifications, setNotifications] = useState([])
  const [journalEntries, setJournalEntries] = useState([])
  const [chatThreads, setChatThreads] = useState([])
  const [messagesByThread, setMessagesByThread] = useState({})
  const [devices, setDevices] = useState(SEED_DEVICES)
  const [approvalRequests, setApprovalRequests] = useState([])
  const [purchaseRequisitions, setPurchaseRequisitions] = useState([])
  const [supplierQuotes, setSupplierQuotes] = useState([])
  const [inboundContainers, setInboundContainers] = useState([
    {
      id: 'cnt-seed-001',
      branchId: 'branch-ind',
      containerNumber: 'MSKU-492018-4',
      originPort: 'Mundra Port (India)',
      shippingLine: 'Maersk East Africa',
      etaDate: '2026-11-28',
      itemsSummary: 'Bajaj Boxer & TVS HLX OEM Chain Kits + Pistons (40ft HC)',
      status: 'In Transit',
    },
  ])
  const [supportTickets, setSupportTickets] = useState([])

  const [tenantSettings, setTenantSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_tenant_settings_${uid || 'anon'}`) || 'null')
      return saved ? { ...DEFAULT_TENANT_SETTINGS, ...saved } : DEFAULT_TENANT_SETTINGS
    } catch {
      return DEFAULT_TENANT_SETTINGS
    }
  })
  const [branches, setBranches] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_branches_${uid || 'anon'}`) || 'null')
      return Array.isArray(saved) && saved.length ? saved : BRANCHES
    } catch {
      return BRANCHES
    }
  })
  const [staffMembers, setStaffMembers] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_staff_${uid || 'anon'}`) || 'null')
      return Array.isArray(saved) && saved.length ? saved : SEED_STAFF
    } catch {
      return SEED_STAFF
    }
  })
  const [locations, setLocations] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_locations_${uid || 'anon'}`) || 'null')
      return Array.isArray(saved) && saved.length ? saved : SEED_LOCATIONS
    } catch {
      return SEED_LOCATIONS
    }
  })
  const [bikeModels, setBikeModels] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_bikes_${uid || 'anon'}`) || 'null')
      return Array.isArray(saved) && saved.length ? saved : SEED_BIKE_MODELS
    } catch {
      return SEED_BIKE_MODELS
    }
  })
  const [fitmentMappings, setFitmentMappings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_fitment_${uid || 'anon'}`) || 'null')
      return Array.isArray(saved) ? saved : [
        { id: 'fit-1', partNumber: 'BJ-CSK-150', bikeModelId: 'bike-boxer-bm150', bikeLabel: 'Bajaj Boxer BM150', position: 'Rear Drivetrain', confidence: 'verified_fit', oemCode: '36DU1007' },
        { id: 'fit-2', partNumber: 'TVS-BRK-125', bikeModelId: 'bike-tvs-hlx125', bikeLabel: 'TVS HLX 125', position: 'Rear Drum Brake', confidence: 'verified_fit', oemCode: 'N9110850' },
      ]
    } catch {
      return []
    }
  })
  const [apiKeys, setApiKeys] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_apikeys_${uid || 'anon'}`) || 'null')
      return Array.isArray(saved) && saved.length ? saved : [buildApiKeyMetadata('KMSP Mobile POS Sync Key', 'pos:sync inventory:read')]
    } catch {
      return []
    }
  })
  const [trainingMode, setTrainingMode] = useState(false)

  const [offlineMode, setOfflineMode] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [outbox, setOutbox] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`kms_outbox_${uid || 'anon'}`) || '[]')
    } catch {
      return []
    }
  })
  const [outboxConflicts, setOutboxConflicts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`kms_outbox_conflicts_${uid || 'anon'}`) || '[]')
    } catch {
      return []
    }
  })

  const [featureFlags, setFeatureFlags] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_flags_${uid || 'anon'}`) || 'null')
      return saved ? { ...DEFAULT_FEATURE_FLAGS, ...saved } : DEFAULT_FEATURE_FLAGS
    } catch {
      return DEFAULT_FEATURE_FLAGS
    }
  })

  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kms_ntf_prefs_${uid || 'anon'}`) || 'null')
      return saved || { inAppEnabled: true, whatsAppEnabled: true, smsEnabled: true, quietHoursEnabled: true }
    } catch {
      return { inAppEnabled: true, whatsAppEnabled: true, smsEnabled: true, quietHoursEnabled: true }
    }
  })

  // Phase 5 Agent Governance Kill Switches
  const [agentControls, setAgentControls] = useState({
    reorderIntelligence: true,
    marginGuardian: true,
    partsRadarMatcher: true,
    whatsappCopilot: true,
  })

  const activeBranchId = profile.activeBranchId || 'branch-cbd'
  const complianceMode = profile.complianceMode || 'etims_vat'
  const initializedRef = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(`kms_outbox_conflicts_${uid || 'anon'}`, JSON.stringify(outboxConflicts))
    } catch {
      // ignore
    }
  }, [outboxConflicts, uid])

  useEffect(() => {
    try {
      localStorage.setItem(`kms_outbox_${uid || 'anon'}`, JSON.stringify(outbox))
    } catch {
      // ignore storage quota errors
    }
  }, [outbox, uid])

  useEffect(() => {
    const goOffline = () => setOfflineMode(true)
    const goOnline = () => setOfflineMode(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // Bootstrap Firebase or Local Preview State
  useEffect(() => {
    let cancelled = false
    if (!uid) {
      Promise.resolve().then(() => {
        if (!cancelled) setReady(false)
      })
      return () => {
        cancelled = true
      }
    }

    if (!isFirebaseSession) {
      Promise.resolve().then(() => {
        if (cancelled) return
        const seed = makePreviewState(uid)
        setProfile(seed.profile)
        setInventory(seed.inventory)
        setStockMovements(seed.stockMovements)
        setPurchaseOrders(seed.purchaseOrders)
        setSuppliers(seed.suppliers)
        setStockCounts(seed.stockCounts)
        setSales(seed.sales)
        setExpenses(seed.expenses)
        setTransfers(seed.transfers)
        setCreditAccounts(seed.creditAccounts)
        setRadarRequests(seed.radarRequests)
        setEtimsInvoices(seed.etimsInvoices)
        setPayoutBatches(seed.payoutBatches)
        setAuditLogs(seed.auditLogs)
        setCustomers(seed.customers)
        setSalesReturns(seed.salesReturns)
        setDrawerShifts(seed.drawerShifts)
        setNotifications(seed.notifications)
        setJournalEntries(seed.journalEntries)
        setChatThreads(seed.chatThreads)
        setMessagesByThread(seed.messagesByThread)
        setReady(true)
      })
      return () => {
        cancelled = true
      }
    }

    const unsubs = []

    async function bootstrapAndSubscribe() {
      const userRef = doc(db, 'users', uid)
      const privateRef = doc(db, 'users', uid, 'private', 'info')
      const fbUser = auth.currentUser

      let userSnap
      try {
        userSnap = await getDoc(userRef)
      } catch (err) {
        if (!cancelled) reportAsyncFirestoreError(err, OperationType.GET, `users/${uid}`)
        return
      }

      if (!userSnap.exists()) {
        const displayName = (fbUser?.displayName?.trim() || fbUser?.email?.split('@')[0] || 'Kenya Motor Owner').slice(0, 120)
        try {
          await setDoc(userRef, {
            uid,
            displayName,
            activeOrganizationId: 'org-kenyamotor',
            activeBranchId: 'branch-cbd',
            complianceMode: 'etims_vat',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        } catch (err) {
          if (!cancelled) reportAsyncFirestoreError(err, OperationType.CREATE, `users/${uid}`)
          return
        }
      }

      const safeEmail = (fbUser?.email || 'owner@kenyamoto.co.ke').slice(0, 255)
      const safePhoto = fbUser?.photoURL ? fbUser.photoURL.slice(0, 512) : null
      try {
        const privateSnap = await getDoc(privateRef)
        if (!privateSnap.exists()) {
          await setDoc(privateRef, {
            ownerId: uid,
            email: safeEmail,
            ...(safePhoto ? { photoURL: safePhoto } : {}),
            updatedAt: serverTimestamp(),
          })
        } else {
          const prev = privateSnap.data()
          if (prev.email !== safeEmail || (safePhoto && prev.photoURL !== safePhoto)) {
            await updateDoc(privateRef, {
              email: safeEmail,
              ...(safePhoto ? { photoURL: safePhoto } : {}),
              updatedAt: serverTimestamp(),
            })
          }
        }
      } catch (err) {
        if (!cancelled) reportAsyncFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`)
        return
      }

      // Seed subcollections ONLY on first workspace setup after user doc exists
      if (initializedRef.current !== uid) {
        initializedRef.current = uid
        let invSnap
        try {
          invSnap = await getDocs(query(collection(db, 'users', uid, 'inventory'), where('ownerId', '==', uid)))
        } catch (err) {
          initializedRef.current = null
          if (!cancelled) reportAsyncFirestoreError(err, OperationType.LIST, `users/${uid}/inventory`)
          return
        }

        if (invSnap.empty) {
          try {
            const batch = writeBatch(db)
            for (const item of makeSeedInventory(uid)) {
              const { id, ...fields } = item
              batch.set(doc(db, 'users', uid, 'inventory', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            const seeds = makeSeedDocs(uid)
            for (const po of seeds.purchaseOrders) {
              const { id, ...fields } = po
              batch.set(doc(db, 'users', uid, 'purchaseOrders', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const tr of seeds.transfers) {
              const { id, ...fields } = tr
              batch.set(doc(db, 'users', uid, 'transfers', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const cred of seeds.creditAccounts) {
              const { id, ...fields } = cred
              batch.set(doc(db, 'users', uid, 'creditAccounts', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const rad of seeds.radarRequests) {
              const { id, ...fields } = rad
              batch.set(doc(db, 'users', uid, 'radarRequests', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const exp of seeds.expenses) {
              const { id, ...fields } = exp
              batch.set(doc(db, 'users', uid, 'expenses', id), {
                ...fields,
                createdAt: serverTimestamp(),
              })
            }
            for (const pay of seeds.payoutBatches) {
              const { id, ...fields } = pay
              batch.set(doc(db, 'users', uid, 'payoutBatches', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const aud of seeds.auditLogs) {
              const { id, ...fields } = aud
              batch.set(doc(db, 'users', uid, 'auditLogs', id), {
                ...fields,
                createdAt: serverTimestamp(),
              })
            }
            batch.set(doc(db, 'users', uid, 'chatThreads', 'thread-default'), {
              ownerId: uid,
              title: 'Kenya Motorcycle Spare Parts Co-Pilot',
              rolePreset: 'parts_specialist',
              modelMode: 'standard',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
            await batch.commit()
          } catch (err) {
            initializedRef.current = null
            if (!cancelled) reportAsyncFirestoreError(err, OperationType.CREATE, `users/${uid}/inventory`)
            return
          }

          // Promote workflow seed samples from valid initial state -> active state
          try {
            const promoBatch = writeBatch(db)
            promoBatch.update(doc(db, 'users', uid, 'purchaseOrders', 'po-seed-002'), {
              status: 'Approved',
              updatedAt: serverTimestamp(),
            })
            promoBatch.update(doc(db, 'users', uid, 'transfers', 'tr-seed-001'), {
              status: 'Dispatched',
              updatedAt: serverTimestamp(),
            })
            promoBatch.update(doc(db, 'users', uid, 'radarRequests', 'rad-seed-001'), {
              status: 'Pending',
              updatedAt: serverTimestamp(),
            })
            await promoBatch.commit()
          } catch (err) {
            if (!cancelled) reportAsyncFirestoreError(err, OperationType.UPDATE, `users/${uid}/purchaseOrders/po-seed-002`)
            return
          }
        }
        let supSnap
        try {
          supSnap = await getDocs(query(collection(db, 'users', uid, 'suppliers'), where('ownerId', '==', uid)))
        } catch (err) {
          initializedRef.current = null
          if (!cancelled) reportAsyncFirestoreError(err, OperationType.LIST, `users/${uid}/suppliers`)
          return
        }

        if (supSnap.empty) {
          try {
            const p2Batch = writeBatch(db)
            const seeds = makeSeedDocs(uid)
            for (const sup of seeds.suppliers) {
              const { id, ...fields } = sup
              p2Batch.set(doc(db, 'users', uid, 'suppliers', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const cnt of seeds.stockCounts) {
              const { id, ...fields } = cnt
              p2Batch.set(doc(db, 'users', uid, 'stockCounts', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            await p2Batch.commit()
          } catch (err) {
            initializedRef.current = null
            if (!cancelled) reportAsyncFirestoreError(err, OperationType.CREATE, `users/${uid}/suppliers`)
            return
          }
        }

        let jeSnap
        try {
          jeSnap = await getDocs(query(collection(db, 'users', uid, 'journalEntries'), where('ownerId', '==', uid)))
        } catch (err) {
          initializedRef.current = null
          if (!cancelled) reportAsyncFirestoreError(err, OperationType.LIST, `users/${uid}/journalEntries`)
          return
        }

        if (jeSnap.empty) {
          try {
            const p3Batch = writeBatch(db)
            const seeds = makeSeedDocs(uid)
            for (const je of seeds.journalEntries) {
              const { id, ...fields } = je
              p3Batch.set(doc(db, 'users', uid, 'journalEntries', id), {
                ...fields,
                createdAt: serverTimestamp(),
              })
            }
            for (const cust of seeds.customers) {
              const { id, ...fields } = cust
              p3Batch.set(doc(db, 'users', uid, 'customers', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const ret of seeds.salesReturns) {
              const { id, ...fields } = ret
              p3Batch.set(doc(db, 'users', uid, 'salesReturns', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const sh of seeds.drawerShifts) {
              const { id, ...fields } = sh
              p3Batch.set(doc(db, 'users', uid, 'drawerShifts', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            for (const ntf of seeds.notifications) {
              const { id, ...fields } = ntf
              p3Batch.set(doc(db, 'users', uid, 'notifications', id), {
                ...fields,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            }
            await p3Batch.commit()
          } catch (err) {
            initializedRef.current = null
            if (!cancelled) reportAsyncFirestoreError(err, OperationType.CREATE, `users/${uid}/journalEntries`)
            return
          }
        }
      }

      if (cancelled) return

      unsubs.push(
        onSnapshot(
          userRef,
          docSnap => {
            if (docSnap.exists()) setProfile(prev => ({ ...prev, ...docSnap.data() }))
          },
          err => reportAsyncFirestoreError(err, OperationType.GET, `users/${uid}`),
        ),
      )

      const subscribeCol = (colName, setter, orderField = 'createdAt', direction = 'desc') => {
        const q = query(
          collection(db, 'users', uid, colName),
          where('ownerId', '==', uid),
        )
        const unsub = onSnapshot(
          q,
          snap => {
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setter(sortRecords(rows, orderField, direction))
          },
          err => reportAsyncFirestoreError(err, OperationType.LIST, `users/${uid}/${colName}`),
        )
        unsubs.push(unsub)
      }

      subscribeCol('inventory', setInventory, 'partName', 'asc')
      subscribeCol('stockMovements', setStockMovements)
      subscribeCol('purchaseOrders', setPurchaseOrders)
      subscribeCol('suppliers', setSuppliers, 'supplierName', 'asc')
      subscribeCol('stockCounts', setStockCounts)
      subscribeCol('sales', setSales)
      subscribeCol('expenses', setExpenses)
      subscribeCol('transfers', setTransfers)
      subscribeCol('creditAccounts', setCreditAccounts)
      subscribeCol('radarRequests', setRadarRequests)
      subscribeCol('etimsInvoices', setEtimsInvoices)
      subscribeCol('payoutBatches', setPayoutBatches)
      subscribeCol('auditLogs', setAuditLogs)
      subscribeCol('customers', setCustomers, 'fullName', 'asc')
      subscribeCol('salesReturns', setSalesReturns)
      subscribeCol('drawerShifts', setDrawerShifts)
      subscribeCol('notifications', setNotifications)
      subscribeCol('journalEntries', setJournalEntries)
      subscribeCol('chatThreads', setChatThreads, 'updatedAt', 'desc')
      subscribeCol('devices', setDevices, 'deviceName', 'asc')
      subscribeCol('approvalRequests', setApprovalRequests)
      subscribeCol('purchaseRequisitions', setPurchaseRequisitions)
      subscribeCol('supplierQuotes', setSupplierQuotes)
      subscribeCol('inboundContainers', setInboundContainers)
      subscribeCol('supportTickets', setSupportTickets)

      if (!cancelled) setReady(true)
    }

    void bootstrapAndSubscribe()
    return () => {
      cancelled = true
      for (const unsub of unsubs) unsub()
    }
  }, [uid, isFirebaseSession, reportAsyncFirestoreError])

  const appendAuditLog = useCallback(
    async (actionType, moduleName, summary, branchId = activeBranchId) => {
      if (!uid) return
      const safeAction = String(actionType || 'EVENT').trim().slice(0, 100) || 'EVENT'
      const safeModule = String(moduleName || 'System').trim().slice(0, 80) || 'System'
      const safeSummary = String(summary || safeAction).trim().slice(0, 400) || safeAction
      const entry = {
        ownerId: uid,
        actionType: safeAction,
        module: safeModule,
        summary: safeSummary,
        branchId,
      }
      if (!isFirebaseSession) {
        setAuditLogs(prev => [{ id: `aud-${Date.now()}`, ...entry, createdAt: new Date().toISOString() }, ...prev])
        return
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'auditLogs'))
        await setDoc(ref, { ...entry, createdAt: serverTimestamp() })
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/auditLogs`)
      }
    },
    [uid, isFirebaseSession, activeBranchId],
  )

  const setActiveBranch = useCallback(
    async (branchId, organizationId = null) => {
      setProfile(prev => ({
        ...prev,
        activeBranchId: branchId,
        ...(organizationId ? { activeOrganizationId: organizationId } : {}),
      }))
      if (!isFirebaseSession) return
      try {
        await updateDoc(doc(db, 'users', uid), {
          activeBranchId: branchId,
          ...(organizationId ? { activeOrganizationId: organizationId } : {}),
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`)
      }
    },
    [uid, isFirebaseSession],
  )

  const setComplianceMode = useCallback(
    async mode => {
      const safe = mode === 'simplified' ? 'simplified' : 'etims_vat'
      setProfile(prev => ({ ...prev, complianceMode: safe }))
      if (!isFirebaseSession) {
        await appendAuditLog('COMPLIANCE_MODE_CHANGED', 'Compliance', `Switched compliance mode to ${safe}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid), { complianceMode: safe, updatedAt: serverTimestamp() })
        await appendAuditLog('COMPLIANCE_MODE_CHANGED', 'Compliance', `Switched compliance mode to ${safe}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`)
      }
    },
    [uid, isFirebaseSession, appendAuditLog],
  )

  // Phase 1: POS Sale (Online Firestore batch OR Offline Outbox queue)
  const commitSalePayload = useCallback(
    async payload => {
      const {
        cart,
        discountAmount,
        paymentMethod,
        paymentReference,
        payments = null,
        deviceId = 'DEV-COUNTER-01',
        priceSnapshotVersion = 'v1',
        customerName,
        branchId,
        mode,
        idempotencyKey,
      } = payload
      const totals = computePosSaleTotals(cart, discountAmount, mode)
      const itemCount = Math.max(
        cart.reduce((sum, line) => sum + Math.trunc(Number(line.quantity || 1)), 0),
        1,
      )
      const etimsStatus = mode === 'etims_vat' ? 'Queued' : 'NotRequired'
      const splitList = Array.isArray(payments) && payments.length ? payments : null
      const effectiveMethod = splitList && splitList.length > 1 ? 'split' : splitList?.[0]?.method || paymentMethod
      const paymentsSummary = splitList
        ? splitList.map(p => `${p.method}: KES ${p.amount}${p.reference ? ` (${p.reference})` : ''}`).join(' + ').slice(0, 400)
        : ''

      const totalCogs = cart.reduce((sum, line) => {
        const item = inventory.find(i => i.id === line.id)
        const cost = Number(line.unitCost ?? item?.unitCost ?? 0)
        return sum + cost * Math.trunc(Number(line.quantity || 1))
      }, 0)
      const saleJe = totals.totalAmount > 0
        ? buildSaleJournalEntry({
            branchId,
            saleId: idempotencyKey,
            paymentMethod: effectiveMethod,
            payments: splitList,
            totalAmount: totals.totalAmount,
            vatAmount: totals.vatAmount,
            cogsAmount: totalCogs,
          })
        : null

      if (!isFirebaseSession || trainingMode) {
        const saleId = idempotencyKey
        setInventory(prev =>
          prev.map(item => {
            const line = cart.find(c => c.id === item.id)
            if (!line) return item
            return { ...item, stockQuantity: Math.max(0, Number(item.stockQuantity) - Math.trunc(line.quantity)) }
          }),
        )
        const saleDoc = {
          id: saleId,
          ownerId: uid,
          branchId,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          vatAmount: totals.vatAmount,
          totalAmount: totals.totalAmount,
          paymentMethod: effectiveMethod,
          ...(splitList ? { payments: splitList, paymentsSummary } : {}),
          ...(paymentReference ? { paymentReference } : {}),
          ...(customerName ? { customerName } : {}),
          deviceId,
          priceSnapshotVersion,
          itemCount,
          etimsStatus,
          training: trainingMode,
          createdAt: new Date().toISOString(),
        }
        setSales(prev => [saleDoc, ...prev])
        setStockMovements(prev => [
          ...cart.map(line => {
            const item = inventory.find(i => i.id === line.id)
            return {
              id: `mov-${Date.now()}-${line.id}`,
              ownerId: uid,
              branchId,
              itemId: line.id,
              partNumber: line.partNumber || 'SKU',
              movementType: 'sale',
              quantityDelta: -Math.trunc(Number(line.quantity)),
              unitCostSnapshot: Number(line.unitCost ?? item?.unitCost ?? 0),
              reason: `POS sale ${saleId}${trainingMode ? ' [TRAINING SANDBOX]' : ''}`,
              createdAt: new Date().toISOString(),
            }
          }),
          ...prev,
        ])
        if (saleJe) {
          setJournalEntries(prev => [{ id: `je-${Date.now()}`, ownerId: uid, ...saleJe, createdAt: new Date().toISOString() }, ...prev])
        }
        if (mode === 'etims_vat' && !trainingMode) {
          setEtimsInvoices(prev => [
            {
              id: `etims-${Date.now()}`,
              ownerId: uid,
              saleId,
              invoiceNumber: `INV-KMS-${String(Math.floor(10000 + Math.random() * 89999))}`,
              totalAmount: totals.totalAmount,
              vatAmount: totals.vatAmount,
              status: 'Queued',
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ])
        }
        await appendAuditLog('POS_SALE_COMPLETED', 'POS', `Completed POS sale ${saleId} (${effectiveMethod}) for KES ${totals.totalAmount}`, branchId)
        return saleDoc
      }

      try {
        const batch = writeBatch(db)
        const saleId = idempotencyKey
        const saleRef = doc(db, 'users', uid, 'sales', saleId)
        const saleDoc = {
          ownerId: uid,
          branchId,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          vatAmount: totals.vatAmount,
          totalAmount: totals.totalAmount,
          paymentMethod: effectiveMethod,
          ...(paymentReference ? { paymentReference: paymentReference.slice(0, 120) } : {}),
          ...(paymentsSummary ? { paymentsSummary } : {}),
          priceSnapshotVersion: String(priceSnapshotVersion).slice(0, 40),
          deviceId: String(deviceId).slice(0, 80),
          ...(customerName ? { customerName: customerName.slice(0, 200) } : {}),
          itemCount,
          etimsStatus,
          createdAt: serverTimestamp(),
        }
        batch.set(saleRef, saleDoc)

        for (const line of cart) {
          const currentItem = inventory.find(i => i.id === line.id)
          const nextQty = Math.max(0, Math.trunc(Number(currentItem?.stockQuantity ?? line.stockQuantity) - Number(line.quantity)))
          batch.update(doc(db, 'users', uid, 'inventory', line.id), {
            stockQuantity: nextQty,
            updatedAt: serverTimestamp(),
          })
          batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
            ownerId: uid,
            branchId,
            itemId: line.id,
            partNumber: String(line.partNumber || 'SKU').slice(0, 100),
            movementType: 'sale',
            quantityDelta: -Math.trunc(Number(line.quantity)),
            unitCostSnapshot: Number(line.unitCost ?? currentItem?.unitCost ?? 0),
            reason: `POS sale ${saleId}`,
            createdAt: serverTimestamp(),
          })
        }

        if (saleJe) {
          batch.set(doc(collection(db, 'users', uid, 'journalEntries')), {
            ownerId: uid,
            ...saleJe,
            createdAt: serverTimestamp(),
          })
        }

        if (mode === 'etims_vat') {
          batch.set(doc(collection(db, 'users', uid, 'etimsInvoices')), {
            ownerId: uid,
            saleId,
            invoiceNumber: `INV-KMS-${String(Math.floor(10000 + Math.random() * 89999))}`,
            totalAmount: totals.totalAmount,
            vatAmount: totals.vatAmount,
            status: 'Queued',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }

        await batch.commit()
        await appendAuditLog('POS_SALE_COMPLETED', 'POS', `Completed POS sale ${saleId} (${effectiveMethod}) for KES ${totals.totalAmount}`, branchId)
        return { id: saleId, ...saleDoc, ...(splitList ? { payments: splitList, paymentsSummary } : {}) }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}/sales`)
      }
    },
    [uid, isFirebaseSession, trainingMode, inventory, appendAuditLog],
  )

  const completePosCheckout = useCallback(
    async ({ cart, discountAmount = 0, paymentMethod = 'cash', paymentReference = '', payments = null, customerName = '' }) => {
      const activeDevice = devices.find(d => d.branchId === activeBranchId && d.status === 'Active') || devices[0]
      if (activeDevice && (activeDevice.status === 'Revoked' || activeDevice.wipePending)) {
        throw new Error(`Device ${activeDevice.id} is revoked. Re-enroll an active POS device in Network -> Governance.`)
      }
      const idempotencyKey = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const totals = computePosSaleTotals(cart, discountAmount, complianceMode)

      let normalizedPayments = null
      let resolvedMethod = paymentMethod
      if (Array.isArray(payments) && payments.length) {
        const splitCheck = validateSplitPayments(payments, totals.totalAmount)
        if (!splitCheck.valid) throw new Error(splitCheck.error)
        normalizedPayments = splitCheck.normalizedPayments
        resolvedMethod = splitCheck.primaryMethod
      }

      const payload = {
        idempotencyKey,
        deviceId: activeDevice?.id || 'DEV-COUNTER-01',
        priceSnapshotVersion: `pv-${new Date().toISOString().slice(0, 10)}`,
        cart: cart.map(row => ({
          id: row.id,
          partName: row.partName || row.part_name,
          partNumber: row.partNumber || row.part_number,
          retailPrice: Number(row.retailPrice ?? row.retail_price),
          unitPriceSnapshot: Number(row.retailPrice ?? row.retail_price),
          stockQuantity: Number(row.stockQuantity ?? row.stock_quantity),
          quantity: Math.trunc(Number(row.quantity || 1)),
        })),
        discountAmount: Number(discountAmount || 0),
        paymentMethod: resolvedMethod,
        payments: normalizedPayments,
        paymentReference: paymentReference.trim(),
        customerName: customerName.trim(),
        branchId: activeBranchId,
        mode: complianceMode,
      }

      if (offlineMode) {
        setOutbox(prev => enqueueOfflineSale(prev, payload))
        setInventory(prev =>
          prev.map(item => {
            const line = payload.cart.find(c => c.id === item.id)
            if (!line) return item
            return { ...item, stockQuantity: Math.max(0, Number(item.stockQuantity) - line.quantity) }
          }),
        )
        return { id: idempotencyKey, offlineQueued: true, totals }
      }

      const saved = await commitSalePayload(payload)
      return { ...saved, offlineQueued: false, totals }
    },
    [activeBranchId, complianceMode, offlineMode, devices, commitSalePayload],
  )

  const syncOutbox = useCallback(async () => {
    if (offlineMode || !outbox.length) return { synced: 0, conflicts: 0 }
    let synced = 0
    const remaining = []
    const newConflicts = []
    const revokedDeviceIds = devices.filter(d => d.status === 'Revoked' || d.wipePending).map(d => d.id)

    for (const queued of outbox) {
      const check = detectOutboxConflict({ queuedSale: queued, inventory, revokedDeviceIds })
      if (check.hasConflict) {
        newConflicts.push({ ...queued, syncStatus: 'conflict', conflictReasons: check.reasons })
        continue
      }
      try {
        await commitSalePayload(queued)
        synced += 1
      } catch {
        remaining.push(queued)
      }
    }
    if (newConflicts.length) {
      setOutboxConflicts(prev => [...newConflicts, ...prev])
      await appendAuditLog('OUTBOX_SYNC_CONFLICT', 'Offline Sync', `Moved ${newConflicts.length} conflicted sale(s) to conflict resolution queue.`)
    }
    setOutbox(remaining)
    return { synced, conflicts: newConflicts.length }
  }, [offlineMode, outbox, devices, inventory, commitSalePayload, appendAuditLog])

  const resolveOutboxConflict = useCallback(
    async (idempotencyKey, action = 'accept_current') => {
      const target = outboxConflicts.find(c => c.idempotencyKey === idempotencyKey)
      if (!target) return
      if (action === 'discard') {
        setOutboxConflicts(prev => prev.filter(c => c.idempotencyKey !== idempotencyKey))
        await appendAuditLog('OUTBOX_CONFLICT_DISCARDED', 'Offline Sync', `Discarded conflicted offline sale ${idempotencyKey}`)
        return
      }
      const repricedCart = (target.cart || []).map(line => {
        const live = inventory.find(i => i.id === line.id)
        if (!live) return line
        return { ...line, retailPrice: Number(live.retailPrice), unitPriceSnapshot: Number(live.retailPrice) }
      })
      await commitSalePayload({ ...target, cart: repricedCart })
      setOutboxConflicts(prev => prev.filter(c => c.idempotencyKey !== idempotencyKey))
      await appendAuditLog('OUTBOX_CONFLICT_RESOLVED', 'Offline Sync', `Resolved & synced offline sale ${idempotencyKey} at current branch pricing.`)
    },
    [outboxConflicts, inventory, commitSalePayload, appendAuditLog],
  )

  // Auto-sync when back online
  useEffect(() => {
    if (offlineMode || !outbox.length || !ready) return
    const timer = setTimeout(() => {
      void syncOutbox()
    }, 120)
    return () => clearTimeout(timer)
  }, [offlineMode, outbox.length, ready, syncOutbox])

  // Phase 1: Expenses (with automatic balanced double-entry journal)
  const recordDailyExpense = useCallback(
    async ({ category, amount, description = '' }) => {
      const record = {
        ownerId: uid,
        branchId: activeBranchId,
        category: String(category).slice(0, 120),
        amount: Number(amount),
        ...(description.trim() ? { description: description.trim().slice(0, 400) } : {}),
        expenseDate: nairobiDay(),
      }
      if (!isFirebaseSession) {
        const expId = `exp-${Date.now()}`
        const local = { id: expId, ...record, createdAt: new Date().toISOString() }
        const je = buildExpenseJournalEntry({ branchId: activeBranchId, expenseId: expId, category: record.category, amount: record.amount })
        setExpenses(prev => [local, ...prev])
        setJournalEntries(prev => [{ id: `je-${Date.now()}`, ownerId: uid, ...je, createdAt: new Date().toISOString() }, ...prev])
        await appendAuditLog('EXPENSE_RECORDED', 'Finance', `Recorded ${record.category} expense of KES ${record.amount}`)
        return local
      }
      try {
        const batch = writeBatch(db)
        const ref = doc(collection(db, 'users', uid, 'expenses'))
        const je = buildExpenseJournalEntry({ branchId: activeBranchId, expenseId: ref.id, category: record.category, amount: record.amount })
        batch.set(ref, { ...record, createdAt: serverTimestamp() })
        batch.set(doc(collection(db, 'users', uid, 'journalEntries')), { ownerId: uid, ...je, createdAt: serverTimestamp() })
        await batch.commit()
        await appendAuditLog('EXPENSE_RECORDED', 'Finance', `Recorded ${record.category} expense of KES ${record.amount}`)
        return { id: ref.id, ...record }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/expenses`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  // Phase 2: Inventory + Parts Master + Cycle Counts + Procurement + GRN + Suppliers
  const addInventoryItem = useCallback(
    async ({
      partName,
      partNumber,
      category = 'General',
      compatibleModels = '',
      brand = 'Standard',
      barcode = '',
      qualityGrade = 'Aftermarket_A',
      uom = 'Piece',
      packSize = 1,
      binLocation = '',
      reservedQuantity = 0,
      oemCrossRefs = '',
      fitmentConfidence = 'verified_fit',
      unitCost,
      retailPrice,
      stockQuantity,
      reorderLevel,
    }) => {
      const safeGrade = ['OEM', 'Genuine', 'Aftermarket_A', 'Aftermarket_B'].includes(qualityGrade)
        ? qualityGrade
        : 'Aftermarket_A'
      const safeUom = ['Piece', 'Set', 'Pair', 'Box', 'Carton'].includes(uom) ? uom : 'Piece'
      const safeFit = ['verified_fit', 'likely_fit', 'requires_confirmation'].includes(fitmentConfidence)
        ? fitmentConfidence
        : 'verified_fit'
      const safeStock = Math.max(0, Math.trunc(Number(stockQuantity || 0)))
      const safeReserved = Math.min(safeStock, Math.max(0, Math.trunc(Number(reservedQuantity || 0))))
      const item = {
        ownerId: uid,
        branchId: activeBranchId,
        partName: String(partName).trim().slice(0, 255),
        partNumber: String(partNumber).trim().slice(0, 100),
        category: String(category || 'General').trim().slice(0, 100),
        compatibleModels: String(compatibleModels || '').trim().slice(0, 500),
        brand: String(brand || 'Standard').trim().slice(0, 100),
        ...(String(barcode || '').trim() ? { barcode: String(barcode).trim().slice(0, 100) } : {}),
        qualityGrade: safeGrade,
        uom: safeUom,
        packSize: Math.max(1, Math.trunc(Number(packSize || 1))),
        ...(String(binLocation || '').trim() ? { binLocation: String(binLocation).trim().slice(0, 60) } : {}),
        reservedQuantity: safeReserved,
        ...(String(oemCrossRefs || '').trim() ? { oemCrossRefs: String(oemCrossRefs).trim().slice(0, 300) } : {}),
        fitmentConfidence: safeFit,
        unitCost: Number(unitCost),
        retailPrice: Number(retailPrice),
        stockQuantity: safeStock,
        reorderLevel: Math.max(0, Math.trunc(Number(reorderLevel || 0))),
        blindListed: true,
      }
      const metrics = classifyStockVelocity(item)
      item.velocityClass = metrics.velocity

      if (!isFirebaseSession) {
        const local = { id: `sku-${Date.now()}`, ...item, createdAt: new Date().toISOString() }
        setInventory(prev => [local, ...prev])
        await appendAuditLog('INVENTORY_ADDED', 'Inventory', `Added SKU ${item.partNumber} (${item.partName}) qty ${item.stockQuantity}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'inventory'))
        await setDoc(ref, { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('INVENTORY_ADDED', 'Inventory', `Added SKU ${item.partNumber} (${item.partName}) qty ${item.stockQuantity}`)
        return { id: ref.id, ...item }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/inventory`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  const adjustInventoryStock = useCallback(
    async (itemId, delta, reason = 'Manual stock count adjustment') => {
      const item = inventory.find(i => i.id === itemId)
      if (!item) return
      const intDelta = Math.trunc(Number(delta || 0))
      const nextQty = Math.max(0, Math.trunc(Number(item.stockQuantity) + intDelta))
      const nextReserved = Math.min(nextQty, Math.max(0, Math.trunc(Number(item.reservedQuantity || 0))))
      const nextClass = classifyStockVelocity({ ...item, stockQuantity: nextQty }).velocity

      if (!isFirebaseSession) {
        setInventory(prev => prev.map(i => (i.id === itemId ? { ...i, stockQuantity: nextQty, reservedQuantity: nextReserved, velocityClass: nextClass } : i)))
        setStockMovements(prev => [
          {
            id: `mov-${Date.now()}`,
            ownerId: uid,
            branchId: item.branchId,
            itemId,
            partNumber: item.partNumber,
            movementType: 'adjustment',
            quantityDelta: intDelta,
            unitCostSnapshot: Number(item.unitCost || 0),
            reason,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ])
        await appendAuditLog('STOCK_ADJUSTED', 'Inventory', `Adjusted ${item.partNumber} by ${intDelta} (${reason})`)
        return
      }
      try {
        const batch = writeBatch(db)
        batch.update(doc(db, 'users', uid, 'inventory', itemId), {
          stockQuantity: nextQty,
          reservedQuantity: nextReserved,
          velocityClass: nextClass,
          updatedAt: serverTimestamp(),
        })
        batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
          ownerId: uid,
          branchId: item.branchId,
          itemId,
          partNumber: item.partNumber,
          movementType: 'adjustment',
          quantityDelta: intDelta,
          unitCostSnapshot: Number(item.unitCost || 0),
          reason: String(reason).slice(0, 300),
          createdAt: serverTimestamp(),
        })
        await batch.commit()
        await appendAuditLog('STOCK_ADJUSTED', 'Inventory', `Adjusted ${item.partNumber} by ${intDelta} (${reason})`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/inventory/${itemId}`)
      }
    },
    [uid, isFirebaseSession, inventory, appendAuditLog],
  )

  const updateInventoryReservation = useCallback(
    async (itemId, nextReservedQty) => {
      const item = inventory.find(i => i.id === itemId)
      if (!item) return
      const onHand = Math.max(0, Math.trunc(Number(item.stockQuantity || 0)))
      const clamped = Math.min(onHand, Math.max(0, Math.trunc(Number(nextReservedQty || 0))))
      if (!isFirebaseSession) {
        setInventory(prev => prev.map(i => (i.id === itemId ? { ...i, reservedQuantity: clamped } : i)))
        await appendAuditLog('STOCK_RESERVATION_UPDATED', 'Inventory', `Reserved qty for ${item.partNumber} set to ${clamped}/${onHand}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'inventory', itemId), {
          reservedQuantity: clamped,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('STOCK_RESERVATION_UPDATED', 'Inventory', `Reserved qty for ${item.partNumber} set to ${clamped}/${onHand}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/inventory/${itemId}`)
      }
    },
    [uid, isFirebaseSession, inventory, appendAuditLog],
  )

  const submitStockCount = useCallback(
    async ({ itemId, countedQty, reason = 'Cycle count discrepancy review' }) => {
      const item = inventory.find(i => i.id === itemId)
      if (!item) throw new Error('Target SKU not found on branch.')
      const systemQty = Math.max(0, Math.trunc(Number(item.stockQuantity || 0)))
      const counted = Math.max(0, Math.trunc(Number(countedQty || 0)))
      const variance = counted - systemQty
      const countDoc = {
        ownerId: uid,
        branchId: item.branchId,
        itemId,
        partNumber: String(item.partNumber).slice(0, 100),
        partName: String(item.partName).slice(0, 255),
        systemQty,
        countedQty: counted,
        variance,
        unitCost: Number(item.unitCost || 0),
        reason: String(reason || 'Cycle count review').trim().slice(0, 300),
        status: 'PendingApproval',
      }
      if (!isFirebaseSession) {
        const local = { id: `cnt-${Date.now()}`, ...countDoc, createdAt: new Date().toISOString() }
        setStockCounts(prev => [local, ...prev])
        await appendAuditLog('STOCK_COUNT_SUBMITTED', 'Inventory', `Submitted cycle count for ${item.partNumber}: ${counted} vs system ${systemQty} (variance ${variance})`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'stockCounts'))
        await setDoc(ref, { ...countDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('STOCK_COUNT_SUBMITTED', 'Inventory', `Submitted cycle count for ${item.partNumber}: ${counted} vs system ${systemQty} (variance ${variance})`)
        return { id: ref.id, ...countDoc }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/stockCounts`)
      }
    },
    [uid, isFirebaseSession, inventory, appendAuditLog],
  )

  const resolveStockCount = useCallback(
    async (countId, approve) => {
      const target = stockCounts.find(c => c.id === countId)
      if (!target || target.status !== 'PendingApproval') return
      const nextStatus = approve ? 'Approved' : 'Rejected'
      const item = inventory.find(i => i.id === target.itemId)
      const varJe =
        approve && target.variance !== 0
          ? buildVarianceJournalEntry({
              branchId: target.branchId,
              countId,
              partNumber: target.partNumber,
              variance: target.variance,
              unitCost: target.unitCost,
            })
          : null

      if (!isFirebaseSession) {
        setStockCounts(prev => prev.map(c => (c.id === countId ? { ...c, status: nextStatus } : c)))
        if (approve && item) {
          const nextQty = Math.max(0, Math.trunc(Number(item.stockQuantity) + Number(target.variance)))
          const nextReserved = Math.min(nextQty, Math.max(0, Math.trunc(Number(item.reservedQuantity || 0))))
          const nextClass = classifyStockVelocity({ ...item, stockQuantity: nextQty }).velocity
          setInventory(prev => prev.map(i => (i.id === item.id ? { ...i, stockQuantity: nextQty, reservedQuantity: nextReserved, velocityClass: nextClass } : i)))
          setStockMovements(prev => [
            {
              id: `mov-${Date.now()}`,
              ownerId: uid,
              branchId: target.branchId,
              itemId: target.itemId,
              partNumber: target.partNumber,
              movementType: 'count_variance',
              quantityDelta: Number(target.variance),
              unitCostSnapshot: Number(target.unitCost || 0),
              reason: `Approved count ${countId}: ${target.reason || 'Cycle count'}`,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ])
        }
        if (varJe) {
          setJournalEntries(prev => [{ id: `je-${Date.now()}`, ownerId: uid, ...varJe, createdAt: new Date().toISOString() }, ...prev])
        }
        await appendAuditLog('STOCK_COUNT_RESOLVED', 'Inventory', `Cycle count ${target.partNumber} ${nextStatus.toLowerCase()} (variance ${target.variance})`)
        return
      }

      try {
        const batch = writeBatch(db)
        batch.update(doc(db, 'users', uid, 'stockCounts', countId), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        })
        if (approve && item) {
          const nextQty = Math.max(0, Math.trunc(Number(item.stockQuantity) + Number(target.variance)))
          const nextReserved = Math.min(nextQty, Math.max(0, Math.trunc(Number(item.reservedQuantity || 0))))
          const nextClass = classifyStockVelocity({ ...item, stockQuantity: nextQty }).velocity
          batch.update(doc(db, 'users', uid, 'inventory', item.id), {
            stockQuantity: nextQty,
            reservedQuantity: nextReserved,
            velocityClass: nextClass,
            updatedAt: serverTimestamp(),
          })
          batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
            ownerId: uid,
            branchId: target.branchId,
            itemId: target.itemId,
            partNumber: target.partNumber,
            movementType: 'count_variance',
            quantityDelta: Math.trunc(Number(target.variance)),
            unitCostSnapshot: Number(target.unitCost || 0),
            reason: String(`Approved count ${countId}: ${target.reason || 'Cycle count'}`).slice(0, 300),
            createdAt: serverTimestamp(),
          })
        }
        if (varJe) {
          batch.set(doc(collection(db, 'users', uid, 'journalEntries')), {
            ownerId: uid,
            ...varJe,
            createdAt: serverTimestamp(),
          })
        }
        await batch.commit()
        await appendAuditLog('STOCK_COUNT_RESOLVED', 'Inventory', `Cycle count ${target.partNumber} ${nextStatus.toLowerCase()} (variance ${target.variance})`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/stockCounts/${countId}`)
      }
    },
    [uid, isFirebaseSession, stockCounts, inventory, appendAuditLog],
  )

  const toggleBlindListing = useCallback(
    async item => {
      const next = !item.blindListed
      if (!isFirebaseSession) {
        setInventory(prev => prev.map(i => (i.id === item.id ? { ...i, blindListed: next } : i)))
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'inventory', item.id), {
          blindListed: next,
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/inventory/${item.id}`)
      }
    },
    [uid, isFirebaseSession],
  )

  const createPurchaseOrder = useCallback(
    async ({ supplierName, itemsSummary, totalCost, freightCharges = 0, orderedQty = 10 }) => {
      const orderNumber = `PO-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 899))}`
      const safeFreight = Math.max(0, Number(freightCharges || 0))
      const safeOrdered = Math.max(1, Math.trunc(Number(orderedQty || 10)))
      const po = {
        ownerId: uid,
        branchId: activeBranchId,
        supplierName: String(supplierName).trim().slice(0, 200),
        orderNumber,
        itemsSummary: String(itemsSummary).trim().slice(0, 500),
        orderedQty: safeOrdered,
        receivedQty: 0,
        damagedQty: 0,
        freightCost: safeFreight,
        customsCost: 0,
        handlingCost: 0,
        totalCost: Number(totalCost),
        landedCost: Number(totalCost) + safeFreight,
        status: 'Pending',
      }
      if (!isFirebaseSession) {
        const local = { id: `po-${Date.now()}`, ...po, createdAt: new Date().toISOString() }
        setPurchaseOrders(prev => [local, ...prev])
        await appendAuditLog('PO_CREATED', 'Procurement', `Created ${orderNumber} with ${po.supplierName}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'purchaseOrders'))
        await setDoc(ref, { ...po, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('PO_CREATED', 'Procurement', `Created ${orderNumber} with ${po.supplierName}`)
        return { id: ref.id, ...po }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/purchaseOrders`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  const resolvePurchaseOrder = useCallback(
    async (poId, status, extraFreight = 0) => {
      const target = purchaseOrders.find(p => p.id === poId)
      if (!target) return
      const nextLanded =
        status === 'Received'
          ? Number(target.totalCost) + Number(extraFreight || 0)
          : Number(target.landedCost)

      if (!isFirebaseSession) {
        setPurchaseOrders(prev => prev.map(p => (p.id === poId ? { ...p, status, landedCost: nextLanded } : p)))
        await appendAuditLog('PO_STATUS_UPDATED', 'Procurement', `${target.orderNumber} -> ${status} (Landed KES ${nextLanded})`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'purchaseOrders', poId), {
          status,
          landedCost: nextLanded,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('PO_STATUS_UPDATED', 'Procurement', `${target.orderNumber} -> ${status} (Landed KES ${nextLanded})`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/purchaseOrders/${poId}`)
      }
    },
    [uid, isFirebaseSession, purchaseOrders, appendAuditLog],
  )

  const receivePurchaseOrderGrn = useCallback(
    async (
      poId,
      {
        receivedGoodQty,
        damagedQty = 0,
        lotNumber = '',
        freightCost = 0,
        customsCost = 0,
        handlingCost = 0,
        grnNotes = '',
        targetItemId = '',
      },
    ) => {
      const target = purchaseOrders.find(p => p.id === poId)
      if (!target || !['Approved', 'PartiallyReceived'].includes(target.status)) return
      const settlement = computeGrnSettlement({
        orderedQty: target.orderedQty || 10,
        previouslyReceivedQty: target.receivedQty || 0,
        receivedGoodQty,
        damagedQty,
        baseCost: target.totalCost,
        freightCost,
        customsCost,
        handlingCost,
      })

      const totalDamaged = Math.max(0, Math.trunc(Number(target.damagedQty || 0))) + settlement.damagedNow
      const safeLot = String(lotNumber || `LOT-${target.orderNumber}`).trim().slice(0, 80)
      const safeNotes = String(grnNotes || '').trim().slice(0, 400)
      const poUpdates = {
        status: settlement.newStatus,
        receivedQty: settlement.totalGoodReceived,
        damagedQty: totalDamaged,
        lotNumber: safeLot,
        ...(safeNotes ? { grnNotes: safeNotes } : {}),
        freightCost: Math.max(0, Number(freightCost || 0)),
        customsCost: Math.max(0, Number(customsCost || 0)),
        handlingCost: Math.max(0, Number(handlingCost || 0)),
        landedCost: settlement.totalLandedCost,
      }
      const linkedSku = targetItemId ? inventory.find(i => i.id === targetItemId) : null
      const grnJe =
        settlement.totalLandedCost > 0
          ? buildGrnReceiptJournalEntry({
              branchId: target.branchId,
              poId,
              orderNumber: target.orderNumber,
              totalLandedCost: settlement.totalLandedCost,
            })
          : null

      if (!isFirebaseSession) {
        setPurchaseOrders(prev => prev.map(p => (p.id === poId ? { ...p, ...poUpdates } : p)))
        if (linkedSku && settlement.goodNow > 0) {
          const nextQty = Math.trunc(Number(linkedSku.stockQuantity) + settlement.goodNow)
          const nextClass = classifyStockVelocity({ ...linkedSku, stockQuantity: nextQty }).velocity
          setInventory(prev =>
            prev.map(i => (i.id === linkedSku.id ? { ...i, stockQuantity: nextQty, velocityClass: nextClass } : i)),
          )
          setStockMovements(prev => [
            {
              id: `mov-grn-${Date.now()}`,
              ownerId: uid,
              branchId: target.branchId,
              itemId: linkedSku.id,
              partNumber: linkedSku.partNumber,
              movementType: 'receipt',
              quantityDelta: settlement.goodNow,
              lotNumber: safeLot,
              unitCostSnapshot: settlement.unitLandedCost,
              reason: `GRN ${target.orderNumber}${safeNotes ? ` · ${safeNotes}` : ''}`,
              createdAt: new Date().toISOString(),
            },
            ...(settlement.damagedNow > 0
              ? [
                  {
                    id: `mov-dmg-${Date.now() + 1}`,
                    ownerId: uid,
                    branchId: target.branchId,
                    itemId: linkedSku.id,
                    partNumber: linkedSku.partNumber,
                    movementType: 'damage',
                    quantityDelta: -settlement.damagedNow,
                    lotNumber: safeLot,
                    unitCostSnapshot: Number(linkedSku.unitCost || 0),
                    reason: `GRN discrepancy on ${target.orderNumber}`,
                    createdAt: new Date().toISOString(),
                  },
                ]
              : []),
            ...prev,
          ])
        }
        if (grnJe) {
          setJournalEntries(prev => [{ id: `je-${Date.now()}`, ownerId: uid, ...grnJe, createdAt: new Date().toISOString() }, ...prev])
        }
        await appendAuditLog(
          'PO_GRN_RECORDED',
          'Procurement',
          `GRN ${target.orderNumber}: +${settlement.goodNow} good, ${settlement.damagedNow} damaged -> ${settlement.newStatus} (Landed KES ${settlement.totalLandedCost})`,
        )
        return settlement
      }

      try {
        const batch = writeBatch(db)
        batch.update(doc(db, 'users', uid, 'purchaseOrders', poId), {
          ...poUpdates,
          updatedAt: serverTimestamp(),
        })
        if (linkedSku && settlement.goodNow > 0) {
          const nextQty = Math.trunc(Number(linkedSku.stockQuantity) + settlement.goodNow)
          const nextClass = classifyStockVelocity({ ...linkedSku, stockQuantity: nextQty }).velocity
          batch.update(doc(db, 'users', uid, 'inventory', linkedSku.id), {
            stockQuantity: nextQty,
            velocityClass: nextClass,
            updatedAt: serverTimestamp(),
          })
          batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
            ownerId: uid,
            branchId: target.branchId,
            itemId: linkedSku.id,
            partNumber: linkedSku.partNumber,
            movementType: 'receipt',
            quantityDelta: settlement.goodNow,
            lotNumber: safeLot,
            unitCostSnapshot: settlement.unitLandedCost,
            reason: String(`GRN ${target.orderNumber}${safeNotes ? ` · ${safeNotes}` : ''}`).slice(0, 300),
            createdAt: serverTimestamp(),
          })
          if (settlement.damagedNow > 0) {
            batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
              ownerId: uid,
              branchId: target.branchId,
              itemId: linkedSku.id,
              partNumber: linkedSku.partNumber,
              movementType: 'damage',
              quantityDelta: -settlement.damagedNow,
              lotNumber: safeLot,
              unitCostSnapshot: Number(linkedSku.unitCost || 0),
              reason: `GRN discrepancy on ${target.orderNumber}`,
              createdAt: serverTimestamp(),
            })
          }
        }
        if (grnJe) {
          batch.set(doc(collection(db, 'users', uid, 'journalEntries')), {
            ownerId: uid,
            ...grnJe,
            createdAt: serverTimestamp(),
          })
        }
        await batch.commit()
        await appendAuditLog(
          'PO_GRN_RECORDED',
          'Procurement',
          `GRN ${target.orderNumber}: +${settlement.goodNow} good, ${settlement.damagedNow} damaged -> ${settlement.newStatus} (Landed KES ${settlement.totalLandedCost})`,
        )
        return settlement
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/purchaseOrders/${poId}`)
      }
    },
    [uid, isFirebaseSession, purchaseOrders, inventory, appendAuditLog],
  )

  const createSupplier = useCallback(
    async ({ supplierName, category = 'Spare Parts Wholesaler', area = 'Nairobi CBD', leadTimeDays = 2, paymentTerms = 'Net 14' }) => {
      const supplierDoc = {
        ownerId: uid,
        supplierName: String(supplierName).trim().slice(0, 200),
        category: String(category || 'General').trim().slice(0, 100),
        area: String(area || 'Nairobi').trim().slice(0, 150),
        leadTimeDays: Math.max(0, Math.trunc(Number(leadTimeDays || 2))),
        paymentTerms: String(paymentTerms || 'Net 14').trim().slice(0, 80),
        fillRatePct: 98,
        defectRatePct: 0.5,
        status: 'Verified',
      }
      if (!isFirebaseSession) {
        const local = { id: `sup-${Date.now()}`, ...supplierDoc, createdAt: new Date().toISOString() }
        setSuppliers(prev => [local, ...prev])
        await appendAuditLog('SUPPLIER_ADDED', 'Procurement', `Added verified supplier ${supplierDoc.supplierName}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'suppliers'))
        await setDoc(ref, { ...supplierDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('SUPPLIER_ADDED', 'Procurement', `Added verified supplier ${supplierDoc.supplierName}`)
        return { id: ref.id, ...supplierDoc }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/suppliers`)
      }
    },
    [uid, isFirebaseSession, appendAuditLog],
  )

  // Phase 3: Branch Transfers & Wholesale Credit Accounts
  const createBranchTransfer = useCallback(
    async ({ destinationBranchName, partSummary, quantity }) => {
      const tr = {
        ownerId: uid,
        sourceBranchId: activeBranchId,
        destinationBranchName: String(destinationBranchName).trim().slice(0, 200),
        partSummary: String(partSummary).trim().slice(0, 300),
        quantity: Math.max(1, Math.trunc(Number(quantity || 1))),
        status: 'Pending',
      }
      if (!isFirebaseSession) {
        const local = { id: `tr-${Date.now()}`, ...tr }
        setTransfers(prev => [local, ...prev])
        await appendAuditLog('TRANSFER_CREATED', 'Dispatch', `Requested transfer of ${tr.quantity}x ${tr.partSummary} to ${tr.destinationBranchName}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'transfers'))
        await setDoc(ref, { ...tr, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('TRANSFER_CREATED', 'Dispatch', `Requested transfer of ${tr.quantity}x ${tr.partSummary}`)
        return { id: ref.id, ...tr }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/transfers`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  const updateBranchTransfer = useCallback(
    async (transferId, status, riderInfo = {}) => {
      const updates = {
        status,
        ...(riderInfo.riderName ? { riderName: riderInfo.riderName.slice(0, 120) } : {}),
        ...(riderInfo.plateNumber ? { plateNumber: riderInfo.plateNumber.slice(0, 40) } : {}),
      }
      if (!isFirebaseSession) {
        setTransfers(prev => prev.map(t => (t.id === transferId ? { ...t, ...updates } : t)))
        await appendAuditLog('TRANSFER_UPDATED', 'Dispatch', `Transfer ${transferId} moved to ${status}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'transfers', transferId), {
          ...updates,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('TRANSFER_UPDATED', 'Dispatch', `Transfer ${transferId} moved to ${status}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/transfers/${transferId}`)
      }
    },
    [uid, isFirebaseSession, appendAuditLog],
  )

  const createCreditAccount = useCallback(
    async ({ customerName, creditLimit, outstandingBalance = 0, lastOrderDaysAgo = 0 }) => {
      const churnRisk = evaluateChurnRisk(lastOrderDaysAgo, creditLimit, outstandingBalance)
      const acc = {
        ownerId: uid,
        customerName: String(customerName).trim().slice(0, 200),
        creditLimit: Number(creditLimit),
        outstandingBalance: Number(outstandingBalance),
        lastOrderDaysAgo: Math.max(0, Math.trunc(Number(lastOrderDaysAgo || 0))),
        churnRisk,
      }
      if (!isFirebaseSession) {
        const local = { id: `cred-${Date.now()}`, ...acc }
        setCreditAccounts(prev => [local, ...prev])
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'creditAccounts'))
        await setDoc(ref, { ...acc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        return { id: ref.id, ...acc }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/creditAccounts`)
      }
    },
    [uid, isFirebaseSession],
  )

  const settleCreditBalance = useCallback(
    async (accountId, paymentAmount) => {
      const target = creditAccounts.find(a => a.id === accountId)
      if (!target) return
      const nextBal = Math.max(0, Number(target.outstandingBalance) - Number(paymentAmount || 0))
      const nextRisk = evaluateChurnRisk(0, target.creditLimit, nextBal)
      if (!isFirebaseSession) {
        setCreditAccounts(prev =>
          prev.map(a => (a.id === accountId ? { ...a, outstandingBalance: nextBal, lastOrderDaysAgo: 0, churnRisk: nextRisk } : a)),
        )
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'creditAccounts', accountId), {
          outstandingBalance: nextBal,
          lastOrderDaysAgo: 0,
          churnRisk: nextRisk,
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/creditAccounts/${accountId}`)
      }
    },
    [uid, isFirebaseSession, creditAccounts],
  )

  // Phase 4 & 7: Parts Radar, Quotes, Reservations & Disputes
  const createRadarRequest = useCallback(
    async ({ partDescription, motorcycleModel = '', urgencyStatus = 'Normal', locationArea = 'Nairobi CBD' }) => {
      const reqDoc = {
        ownerId: uid,
        branchId: activeBranchId,
        partDescription: String(partDescription).trim().slice(0, 300),
        ...(motorcycleModel.trim() ? { motorcycleModel: motorcycleModel.trim().slice(0, 150) } : {}),
        urgencyStatus: urgencyStatus === 'Urgent' ? 'Urgent' : 'Normal',
        locationArea: String(locationArea).trim().slice(0, 150),
        disputeStatus: 'None',
        status: 'Open',
      }
      if (!isFirebaseSession) {
        const local = { id: `rad-${Date.now()}`, ...reqDoc }
        setRadarRequests(prev => [local, ...prev])
        await appendAuditLog('RADAR_REQUEST_CREATED', 'Parts Radar', `Requested ${reqDoc.partDescription}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'radarRequests'))
        await setDoc(ref, { ...reqDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('RADAR_REQUEST_CREATED', 'Parts Radar', `Requested ${reqDoc.partDescription}`)
        return { id: ref.id, ...reqDoc }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/radarRequests`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  const updateRadarRequest = useCallback(
    async (requestId, updates) => {
      if (!isFirebaseSession) {
        setRadarRequests(prev => prev.map(r => (r.id === requestId ? { ...r, ...updates } : r)))
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'radarRequests', requestId), {
          ...updates,
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/radarRequests/${requestId}`)
      }
    },
    [uid, isFirebaseSession],
  )

  // Phase 6: eTIMS VSCU Retry & Owner-Approved Payout Batches
  const retryEtimsInvoice = useCallback(
    async invoiceId => {
      const cuin = `KRA-VSCU-${Math.floor(1000000 + Math.random() * 8999999)}K`
      if (!isFirebaseSession) {
        setEtimsInvoices(prev => prev.map(inv => (inv.id === invoiceId ? { ...inv, status: 'Accepted', cuin } : inv)))
        await appendAuditLog('ETIMS_INVOICE_ACCEPTED', 'Compliance', `VSCU accepted invoice ${invoiceId} with CUIN ${cuin}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'etimsInvoices', invoiceId), {
          status: 'Accepted',
          cuin,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('ETIMS_INVOICE_ACCEPTED', 'Compliance', `VSCU accepted invoice ${invoiceId} with CUIN ${cuin}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/etimsInvoices/${invoiceId}`)
      }
    },
    [uid, isFirebaseSession, appendAuditLog],
  )

  const createPayoutBatch = useCallback(
    async ({ title, category, recipientCount, totalAmount }) => {
      const batchDoc = {
        ownerId: uid,
        title: String(title).trim().slice(0, 200),
        category,
        recipientCount: Math.max(1, Math.trunc(Number(recipientCount || 1))),
        totalAmount: Number(totalAmount),
        status: 'PendingApproval',
      }
      if (!isFirebaseSession) {
        const local = { id: `pay-${Date.now()}`, ...batchDoc }
        setPayoutBatches(prev => [local, ...prev])
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'payoutBatches'))
        await setDoc(ref, { ...batchDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        return { id: ref.id, ...batchDoc }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/payoutBatches`)
      }
    },
    [uid, isFirebaseSession],
  )

  const resolvePayoutBatch = useCallback(
    async (batchId, approve) => {
      const status = approve ? 'Approved' : 'Rejected'
      if (!isFirebaseSession) {
        setPayoutBatches(prev => prev.map(b => (b.id === batchId ? { ...b, status } : b)))
        await appendAuditLog('PAYOUT_RESOLVED', 'Finance', `Owner digitally ${status.toLowerCase()} payout batch ${batchId}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'payoutBatches', batchId), {
          status,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('PAYOUT_RESOLVED', 'Finance', `Owner digitally ${status.toLowerCase()} payout batch ${batchId}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/payoutBatches/${batchId}`)
      }
    },
    [uid, isFirebaseSession, appendAuditLog],
  )

  // Phase 5: Gemini Multi-Turn Chat Thread Subscription & Persistence
  const subscribeChatThread = useCallback(
    (threadId, onMessages) => {
      if (!uid || !threadId) return () => {}
      if (!isFirebaseSession) {
        onMessages(messagesByThread[threadId] || [])
        return () => {}
      }
      const q = query(
        collection(db, 'users', uid, 'chatThreads', threadId, 'messages'),
        where('ownerId', '==', uid),
      )
      return onSnapshot(
        q,
        snap => onMessages(sortRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })), 'createdAt', 'asc')),
        err => reportAsyncFirestoreError(err, OperationType.LIST, `users/${uid}/chatThreads/${threadId}/messages`),
      )
    },
    [uid, isFirebaseSession, messagesByThread, reportAsyncFirestoreError],
  )

  const createChatThread = useCallback(
    async ({ title = 'New Assistant Thread', rolePreset = 'parts_specialist', modelMode = 'standard' }) => {
      const docData = {
        ownerId: uid,
        title: String(title).slice(0, 160),
        rolePreset,
        modelMode,
      }
      if (!isFirebaseSession) {
        const id = `thread-${Date.now()}`
        const local = { id, ...docData }
        setChatThreads(prev => [local, ...prev])
        setMessagesByThread(prev => ({ ...prev, [id]: [] }))
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'chatThreads'))
        await setDoc(ref, { ...docData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        return { id: ref.id, ...docData }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/chatThreads`)
      }
    },
    [uid, isFirebaseSession],
  )

  const updateChatThreadConfig = useCallback(
    async (threadId, { rolePreset, modelMode, title }) => {
      if (!isFirebaseSession) {
        setChatThreads(prev =>
          prev.map(th => (th.id === threadId ? { ...th, ...(rolePreset ? { rolePreset } : {}), ...(modelMode ? { modelMode } : {}), ...(title ? { title } : {}) } : th)),
        )
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'chatThreads', threadId), {
          ...(rolePreset ? { rolePreset } : {}),
          ...(modelMode ? { modelMode } : {}),
          ...(title ? { title: title.slice(0, 160) } : {}),
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/chatThreads/${threadId}`)
      }
    },
    [uid, isFirebaseSession],
  )

  const appendChatMessage = useCallback(
    async (threadId, { role, text, model, mode, links }) => {
      const linksJson = links && (links.webSources?.length || links.mapPlaces?.length)
        ? JSON.stringify(links).slice(0, 8000)
        : null
      const safeText = (String(text || '').trim() || ' ').slice(0, 16000)
      const msg = {
        ownerId: uid,
        role: role === 'user' ? 'user' : 'model',
        text: safeText,
        ...(model ? { model: String(model).slice(0, 80) } : {}),
        ...(mode ? { mode: String(mode).slice(0, 40) } : {}),
        ...(linksJson ? { linksJson } : {}),
      }
      if (!isFirebaseSession) {
        const localMsg = { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, ...msg }
        setMessagesByThread(prev => ({
          ...prev,
          [threadId]: [...(prev[threadId] || []), localMsg],
        }))
        return localMsg
      }
      try {
        const threadRef = doc(db, 'users', uid, 'chatThreads', threadId)
        const snap = await getDoc(threadRef)
        if (!snap.exists()) {
          await setDoc(threadRef, {
            ownerId: uid,
            title: 'Kenya Motorcycle Spare Parts General Co-Pilot',
            rolePreset: 'parts_specialist',
            modelMode: mode || 'standard',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
        const msgRef = doc(collection(db, 'users', uid, 'chatThreads', threadId, 'messages'))
        await setDoc(msgRef, { ...msg, createdAt: serverTimestamp() })
        return { id: msgRef.id, ...msg }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/chatThreads/${threadId}/messages`)
      }
    },
    [uid, isFirebaseSession],
  )

  const toggleAgentControl = useCallback(
    async key => {
      setAgentControls(prev => {
        const next = { ...prev, [key]: !prev[key] }
        void appendAuditLog('AGENT_KILL_SWITCH', 'AI Control Plane', `${key} set to ${next[key] ? 'ACTIVE' : 'SUSPENDED'}`)
        return next
      })
    },
    [appendAuditLog],
  )

  // P0/P1/P2 Extensions: Reversing Entries, Customers/Consent, Sales Returns, Drawer Shifts, Notifications, Governance, Pack-Break & Bulk Import
  const postReversingJournalEntry = useCallback(
    async (entryId, reason = 'Manual ledger correction reversal') => {
      const target = journalEntries.find(j => j.id === entryId)
      const revJe = buildReversingJournalEntry(target, reason)
      if (!isFirebaseSession) {
        const local = { id: `je-rev-${Date.now()}`, ownerId: uid, ...revJe, createdAt: new Date().toISOString() }
        setJournalEntries(prev => [local, ...prev])
        await appendAuditLog('JOURNAL_REVERSED', 'Finance', `Posted reversing entry ${revJe.entryNumber} for ${target.entryNumber}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'journalEntries'))
        await setDoc(ref, { ownerId: uid, ...revJe, createdAt: serverTimestamp() })
        await appendAuditLog('JOURNAL_REVERSED', 'Finance', `Posted reversing entry ${revJe.entryNumber} for ${target.entryNumber}`)
        return { id: ref.id, ...revJe }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/journalEntries`)
      }
    },
    [uid, isFirebaseSession, journalEntries, appendAuditLog],
  )

  const createCustomerProfile = useCallback(
    async ({ fullName, phone = '', bikeModel = '', consentWhatsApp = true, consentSms = true, consentMarketing = false }) => {
      const rec = {
        ownerId: uid,
        fullName: String(fullName).trim().slice(0, 200),
        ...(String(phone || '').trim() ? { phone: String(phone).trim().slice(0, 40) } : {}),
        ...(String(bikeModel || '').trim() ? { bikeModel: String(bikeModel).trim().slice(0, 120) } : {}),
        consentWhatsApp: Boolean(consentWhatsApp),
        consentSms: Boolean(consentSms),
        consentMarketing: Boolean(consentMarketing),
        totalSpent: 0,
        visitCount: 0,
      }
      if (!isFirebaseSession) {
        const local = { id: `cust-${Date.now()}`, ...rec, createdAt: new Date().toISOString() }
        setCustomers(prev => [local, ...prev])
        await appendAuditLog('CUSTOMER_CREATED', 'CRM', `Added customer profile ${rec.fullName}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'customers'))
        await setDoc(ref, { ...rec, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('CUSTOMER_CREATED', 'CRM', `Added customer profile ${rec.fullName}`)
        return { id: ref.id, ...rec }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/customers`)
      }
    },
    [uid, isFirebaseSession, appendAuditLog],
  )

  const updateCustomerConsent = useCallback(
    async (customerId, consentPatch) => {
      const target = customers.find(c => c.id === customerId)
      if (!target) return
      const nextPatch = {
        consentWhatsApp: consentPatch.consentWhatsApp ?? target.consentWhatsApp,
        consentSms: consentPatch.consentSms ?? target.consentSms,
        consentMarketing: consentPatch.consentMarketing ?? target.consentMarketing,
      }
      if (!isFirebaseSession) {
        setCustomers(prev => prev.map(c => (c.id === customerId ? { ...c, ...nextPatch } : c)))
        await appendAuditLog('CUSTOMER_CONSENT_UPDATED', 'CRM', `Updated channel consent for ${target.fullName}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'customers', customerId), {
          ...nextPatch,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('CUSTOMER_CONSENT_UPDATED', 'CRM', `Updated channel consent for ${target.fullName}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/customers/${customerId}`)
      }
    },
    [uid, isFirebaseSession, customers, appendAuditLog],
  )

  const sendWorkspaceNotification = useCallback(
    async ({ templateKey, vars = {}, channel = 'in_app', category = 'operational', customer = null }) => {
      const rendered = renderNotificationTemplate(templateKey, vars)
      const gate = evaluateNotificationDelivery({ channel, category, customer, prefs: notificationPrefs })
      const docData = {
        ownerId: uid,
        branchId: activeBranchId,
        templateKey: String(templateKey || 'ALERT').slice(0, 80),
        channel,
        title: rendered.title,
        body: `${rendered.body} (${gate.reason})`.slice(0, 600),
        status: gate.status,
      }
      if (!isFirebaseSession) {
        const local = { id: `ntf-${Date.now()}`, ...docData, createdAt: new Date().toISOString() }
        setNotifications(prev => [local, ...prev])
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'notifications'))
        await setDoc(ref, { ...docData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        return { id: ref.id, ...docData }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/notifications`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, notificationPrefs],
  )

  const markNotificationRead = useCallback(
    async notificationId => {
      if (!isFirebaseSession) {
        setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, status: 'Read' } : n)))
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
          status: 'Read',
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/notifications/${notificationId}`)
      }
    },
    [uid, isFirebaseSession],
  )

  const markAllNotificationsRead = useCallback(async () => {
    const unread = notifications.filter(n => n.status === 'Unread')
    if (!unread.length) return
    if (!isFirebaseSession) {
      setNotifications(prev => prev.map(n => (n.status === 'Unread' ? { ...n, status: 'Read' } : n)))
      return
    }
    try {
      const batch = writeBatch(db)
      for (const n of unread) {
        batch.update(doc(db, 'users', uid, 'notifications', n.id), { status: 'Read', updatedAt: serverTimestamp() })
      }
      await batch.commit()
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/notifications`)
    }
  }, [uid, isFirebaseSession, notifications])

  const submitSalesReturn = useCallback(
    async ({ saleId = '', itemId, quantity = 1, refundAmount, refundMethod = 'cash', reason, requestedBy = '' }) => {
      const item = inventory.find(i => i.id === itemId)
      if (!item) throw new Error('Returned SKU not found on active workspace.')
      const actor = String(requestedBy || session?.user?.displayName || session?.user?.email || 'Counter Cashier').slice(0, 120)
      const retDoc = {
        ownerId: uid,
        branchId: item.branchId,
        ...(String(saleId || '').trim() ? { saleId: String(saleId).trim().slice(0, 128) } : {}),
        itemId,
        partNumber: item.partNumber,
        quantity: Math.max(1, Math.trunc(Number(quantity || 1))),
        refundAmount: Math.max(0, Number(refundAmount || 0)),
        refundMethod,
        reason: String(reason || 'Customer return').trim().slice(0, 300),
        requestedBy: actor,
        status: 'PendingApproval',
      }
      if (!isFirebaseSession) {
        const local = { id: `ret-${Date.now()}`, ...retDoc, createdAt: new Date().toISOString() }
        setSalesReturns(prev => [local, ...prev])
        await appendAuditLog('SALES_RETURN_STAGED', 'POS', `Staged return of ${retDoc.quantity}x ${retDoc.partNumber} (KES ${retDoc.refundAmount}) by ${actor}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'salesReturns'))
        await setDoc(ref, { ...retDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('SALES_RETURN_STAGED', 'POS', `Staged return of ${retDoc.quantity}x ${retDoc.partNumber} (KES ${retDoc.refundAmount}) by ${actor}`)
        return { id: ref.id, ...retDoc }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/salesReturns`)
      }
    },
    [uid, isFirebaseSession, session, inventory, appendAuditLog],
  )

  const resolveSalesReturn = useCallback(
    async (returnId, approve, { approverName = '', approverRole = 'owner' } = {}) => {
      const target = salesReturns.find(r => r.id === returnId)
      if (!target || target.status !== 'PendingApproval') return
      const resolvedActor = String(approverName || session?.user?.displayName || session?.user?.email || 'Branch Manager').slice(0, 120)
      if (approve) {
        const sod = validateReturnActorSeparation({
          requestedBy: target.requestedBy,
          approverName: resolvedActor,
          role: approverRole,
        })
        if (!sod.allowed) {
          throw new Error(sod.reason)
        }
      }
      const nextStatus = approve ? 'Approved' : 'Rejected'
      const item = inventory.find(i => i.id === target.itemId)
      const restockCost = item ? Number(item.unitCost || 0) * target.quantity : 0
      const retJe = approve
        ? buildReturnReversalJournalEntry({
            branchId: target.branchId,
            returnId,
            partNumber: target.partNumber,
            refundAmount: target.refundAmount,
            refundMethod: target.refundMethod,
            restockCost,
          })
        : null

      if (!isFirebaseSession) {
        setSalesReturns(prev => prev.map(r => (r.id === returnId ? { ...r, status: nextStatus, approvedBy: resolvedActor } : r)))
        if (approve && item) {
          const nextQty = Math.trunc(Number(item.stockQuantity) + Number(target.quantity))
          setInventory(prev => prev.map(i => (i.id === item.id ? { ...i, stockQuantity: nextQty } : i)))
          setStockMovements(prev => [
            {
              id: `mov-ret-${Date.now()}`,
              ownerId: uid,
              branchId: target.branchId,
              itemId: item.id,
              partNumber: target.partNumber,
              movementType: 'return',
              quantityDelta: Number(target.quantity),
              unitCostSnapshot: Number(item.unitCost || 0),
              reason: `Approved return ${returnId}: ${target.reason}`,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ])
        }
        if (retJe) {
          setJournalEntries(prev => [{ id: `je-ret-${Date.now()}`, ownerId: uid, ...retJe, createdAt: new Date().toISOString() }, ...prev])
        }
        if (approve) {
          await sendWorkspaceNotification({
            templateKey: 'RETURN_APPROVED',
            vars: { partNumber: target.partNumber, refundAmount: target.refundAmount, refundMethod: target.refundMethod },
          })
        }
        await appendAuditLog('SALES_RETURN_RESOLVED', 'POS', `Return ${target.partNumber} ${nextStatus.toLowerCase()} by ${resolvedActor} (KES ${target.refundAmount})`)
        return
      }

      try {
        const batch = writeBatch(db)
        batch.update(doc(db, 'users', uid, 'salesReturns', returnId), {
          status: nextStatus,
          approvedBy: resolvedActor,
          updatedAt: serverTimestamp(),
        })
        if (approve && item) {
          const nextQty = Math.trunc(Number(item.stockQuantity) + Number(target.quantity))
          batch.update(doc(db, 'users', uid, 'inventory', item.id), {
            stockQuantity: nextQty,
            updatedAt: serverTimestamp(),
          })
          batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
            ownerId: uid,
            branchId: target.branchId,
            itemId: item.id,
            partNumber: target.partNumber,
            movementType: 'return',
            quantityDelta: Math.trunc(Number(target.quantity)),
            unitCostSnapshot: Number(item.unitCost || 0),
            reason: String(`Approved return ${returnId}: ${target.reason}`).slice(0, 300),
            createdAt: serverTimestamp(),
          })
        }
        if (retJe) {
          batch.set(doc(collection(db, 'users', uid, 'journalEntries')), {
            ownerId: uid,
            ...retJe,
            createdAt: serverTimestamp(),
          })
        }
        await batch.commit()
        if (approve) {
          await sendWorkspaceNotification({
            templateKey: 'RETURN_APPROVED',
            vars: { partNumber: target.partNumber, refundAmount: target.refundAmount, refundMethod: target.refundMethod },
          })
        }
        await appendAuditLog('SALES_RETURN_RESOLVED', 'POS', `Return ${target.partNumber} ${nextStatus.toLowerCase()} by ${resolvedActor} (KES ${target.refundAmount})`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/salesReturns/${returnId}`)
      }
    },
    [uid, isFirebaseSession, session, salesReturns, inventory, appendAuditLog, sendWorkspaceNotification],
  )

  const openDrawerShift = useCallback(
    async (openingFloat = 5000, notes = '') => {
      const rec = {
        ownerId: uid,
        branchId: activeBranchId,
        shiftDay: nairobiDay(),
        openingFloat: Math.max(0, Number(openingFloat || 0)),
        expectedCash: Math.max(0, Number(openingFloat || 0)),
        ...(String(notes || '').trim() ? { notes: String(notes).trim().slice(0, 300) } : {}),
        status: 'Open',
      }
      if (!isFirebaseSession) {
        const local = { id: `shift-${Date.now()}`, ...rec, createdAt: new Date().toISOString() }
        setDrawerShifts(prev => [local, ...prev])
        await appendAuditLog('SHIFT_OPENED', 'POS', `Opened cash drawer shift with float KES ${rec.openingFloat}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'drawerShifts'))
        await setDoc(ref, { ...rec, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('SHIFT_OPENED', 'POS', `Opened cash drawer shift with float KES ${rec.openingFloat}`)
        return { id: ref.id, ...rec }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/drawerShifts`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  const closeDrawerShift = useCallback(
    async (shiftId, countedCash, notes = '') => {
      const target = drawerShifts.find(s => s.id === shiftId)
      if (!target || target.status !== 'Open') return
      const cashSales = sales
        .filter(s => s.branchId === target.branchId && s.paymentMethod === 'cash')
        .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
      const cashRefunds = salesReturns
        .filter(r => r.branchId === target.branchId && r.status === 'Approved' && r.refundMethod === 'cash')
        .reduce((sum, r) => sum + Number(r.refundAmount || 0), 0)
      const cashExpenses = expenses
        .filter(e => e.branchId === target.branchId)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0)

      const recon = computeShiftReconciliation({
        openingFloat: target.openingFloat,
        cashSales,
        cashRefunds,
        cashExpenses,
        countedCash,
      })
      const updates = {
        expectedCash: recon.expectedCash,
        countedCash: recon.countedCash,
        variance: recon.variance,
        ...(String(notes || '').trim() ? { notes: String(notes).trim().slice(0, 300) } : {}),
        status: 'Closed',
      }
      if (!isFirebaseSession) {
        setDrawerShifts(prev => prev.map(s => (s.id === shiftId ? { ...s, ...updates } : s)))
        await appendAuditLog('SHIFT_CLOSED', 'POS', `Closed drawer shift: expected KES ${recon.expectedCash}, counted KES ${recon.countedCash}, variance KES ${recon.variance}`)
        return recon
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'drawerShifts', shiftId), { ...updates, updatedAt: serverTimestamp() })
        await appendAuditLog('SHIFT_CLOSED', 'POS', `Closed drawer shift: expected KES ${recon.expectedCash}, counted KES ${recon.countedCash}, variance KES ${recon.variance}`)
        return recon
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/drawerShifts/${shiftId}`)
      }
    },
    [uid, isFirebaseSession, drawerShifts, sales, salesReturns, expenses, appendAuditLog],
  )

  const breakStockPack = useCallback(
    async (itemId, packsToBreak = 1) => {
      const parentItem = inventory.find(i => i.id === itemId)
      const plan = buildPackBreakMovements({ parentItem, packsToBreak })
      const existingChild = inventory.find(
        i => i.branchId === parentItem.branchId && i.partNumber === plan.loosePartNumber,
      )
      if (!isFirebaseSession) {
        setInventory(prev => {
          const updated = prev.map(i => (i.id === parentItem.id ? { ...i, stockQuantity: plan.nextParentStock } : i))
          if (existingChild) {
            return updated.map(i =>
              i.id === existingChild.id
                ? { ...i, stockQuantity: Math.trunc(Number(i.stockQuantity) + plan.looseUnitsCreated) }
                : i,
            )
          }
          return [
            {
              id: `sku-unit-${Date.now()}`,
              ownerId: uid,
              branchId: parentItem.branchId,
              partName: plan.loosePartName,
              partNumber: plan.loosePartNumber,
              category: parentItem.category || 'General',
              compatibleModels: parentItem.compatibleModels || '',
              brand: parentItem.brand || 'Standard',
              qualityGrade: parentItem.qualityGrade || 'Aftermarket_A',
              uom: 'Piece',
              packSize: 1,
              binLocation: parentItem.binLocation || 'LOOSE-BIN',
              reservedQuantity: 0,
              unitCost: plan.unitCostPerPiece,
              retailPrice: plan.retailPricePerPiece,
              stockQuantity: plan.looseUnitsCreated,
              reorderLevel: 5,
              velocityClass: 'normal',
              blindListed: false,
              createdAt: new Date().toISOString(),
            },
            ...updated,
          ]
        })
        setStockMovements(prev => [
          {
            id: `mov-brk-out-${Date.now()}`,
            ownerId: uid,
            branchId: parentItem.branchId,
            itemId: parentItem.id,
            partNumber: parentItem.partNumber,
            movementType: 'pack_break',
            quantityDelta: -plan.packsBroken,
            unitCostSnapshot: Number(parentItem.unitCost || 0),
            reason: `Pack break -> +${plan.looseUnitsCreated} loose ${plan.loosePartNumber}`,
            createdAt: new Date().toISOString(),
          },
          {
            id: `mov-brk-in-${Date.now() + 1}`,
            ownerId: uid,
            branchId: parentItem.branchId,
            itemId: existingChild?.id || parentItem.id,
            partNumber: plan.loosePartNumber,
            movementType: 'pack_break',
            quantityDelta: plan.looseUnitsCreated,
            unitCostSnapshot: plan.unitCostPerPiece,
            reason: `Unpacked from ${plan.packsBroken}x ${parentItem.partNumber}`,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ])
        await appendAuditLog('STOCK_PACK_BROKEN', 'Inventory', `Broke ${plan.packsBroken} pack(s) of ${parentItem.partNumber} into ${plan.looseUnitsCreated} loose units`)
        return plan
      }

      try {
        const batch = writeBatch(db)
        batch.update(doc(db, 'users', uid, 'inventory', parentItem.id), {
          stockQuantity: plan.nextParentStock,
          updatedAt: serverTimestamp(),
        })
        let childId = existingChild?.id
        if (existingChild) {
          batch.update(doc(db, 'users', uid, 'inventory', existingChild.id), {
            stockQuantity: Math.trunc(Number(existingChild.stockQuantity) + plan.looseUnitsCreated),
            updatedAt: serverTimestamp(),
          })
        } else {
          const childRef = doc(collection(db, 'users', uid, 'inventory'))
          childId = childRef.id
          batch.set(childRef, {
            ownerId: uid,
            branchId: parentItem.branchId,
            partName: plan.loosePartName.slice(0, 255),
            partNumber: plan.loosePartNumber.slice(0, 100),
            category: String(parentItem.category || 'General').slice(0, 100),
            compatibleModels: String(parentItem.compatibleModels || '').slice(0, 500),
            brand: String(parentItem.brand || 'Standard').slice(0, 100),
            qualityGrade: parentItem.qualityGrade || 'Aftermarket_A',
            uom: 'Piece',
            packSize: 1,
            binLocation: String(parentItem.binLocation || 'LOOSE-BIN').slice(0, 60),
            reservedQuantity: 0,
            unitCost: plan.unitCostPerPiece,
            retailPrice: plan.retailPricePerPiece,
            stockQuantity: plan.looseUnitsCreated,
            reorderLevel: 5,
            velocityClass: 'normal',
            blindListed: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
        batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
          ownerId: uid,
          branchId: parentItem.branchId,
          itemId: parentItem.id,
          partNumber: parentItem.partNumber,
          movementType: 'pack_break',
          quantityDelta: -plan.packsBroken,
          unitCostSnapshot: Number(parentItem.unitCost || 0),
          reason: `Pack break -> +${plan.looseUnitsCreated} loose ${plan.loosePartNumber}`,
          createdAt: serverTimestamp(),
        })
        batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
          ownerId: uid,
          branchId: parentItem.branchId,
          itemId: childId,
          partNumber: plan.loosePartNumber,
          movementType: 'pack_break',
          quantityDelta: plan.looseUnitsCreated,
          unitCostSnapshot: plan.unitCostPerPiece,
          reason: `Unpacked from ${plan.packsBroken}x ${parentItem.partNumber}`,
          createdAt: serverTimestamp(),
        })
        await batch.commit()
        await appendAuditLog('STOCK_PACK_BROKEN', 'Inventory', `Broke ${plan.packsBroken} pack(s) of ${parentItem.partNumber} into ${plan.looseUnitsCreated} loose units`)
        return plan
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/inventory/${parentItem.id}`)
      }
    },
    [uid, isFirebaseSession, inventory, appendAuditLog],
  )

  const importCatalogueRows = useCallback(
    async validRows => {
      if (!Array.isArray(validRows) || !validRows.length) return { imported: 0 }
      for (const row of validRows) {
        await addInventoryItem(row)
      }
      await appendAuditLog('CATALOGUE_CSV_IMPORTED', 'Inventory', `Imported ${validRows.length} SKU row(s) after duplicate checks`)
      return { imported: validRows.length }
    },
    [addInventoryItem, appendAuditLog],
  )

  const returnPurchaseOrderStock = useCallback(
    async ({ poId, itemId, quantity = 1, reason = 'Defective batch returned to supplier' }) => {
      const po = purchaseOrders.find(p => p.id === poId)
      const sku = inventory.find(i => i.id === itemId)
      if (!po || !sku) throw new Error('Select a valid PO and SKU for supplier return.')
      const qty = Math.max(1, Math.trunc(Number(quantity || 1)))
      if (qty > Number(sku.stockQuantity || 0)) {
        throw new Error(`Cannot return ${qty} units; only ${sku.stockQuantity} on hand.`)
      }
      const returnCost = Math.round(qty * Number(sku.unitCost || 0) * 100) / 100
      const prnJe = returnCost > 0 ? buildPurchaseReturnJournalEntry({ branchId: po.branchId, poId, orderNumber: po.orderNumber, returnCost }) : null

      if (!isFirebaseSession) {
        setInventory(prev => prev.map(i => (i.id === sku.id ? { ...i, stockQuantity: Math.max(0, Number(i.stockQuantity) - qty) } : i)))
        setStockMovements(prev => [
          {
            id: `mov-prn-${Date.now()}`,
            ownerId: uid,
            branchId: po.branchId,
            itemId: sku.id,
            partNumber: sku.partNumber,
            movementType: 'purchase_return',
            quantityDelta: -qty,
            unitCostSnapshot: Number(sku.unitCost || 0),
            reason: `Return on ${po.orderNumber}: ${reason}`,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ])
        if (prnJe) {
          setJournalEntries(prev => [{ id: `je-prn-${Date.now()}`, ownerId: uid, ...prnJe, createdAt: new Date().toISOString() }, ...prev])
        }
        await appendAuditLog('PURCHASE_RETURN_POSTED', 'Procurement', `Returned ${qty}x ${sku.partNumber} on ${po.orderNumber} (Debit Memo KES ${returnCost})`)
        return { qty, returnCost }
      }

      try {
        const batch = writeBatch(db)
        batch.update(doc(db, 'users', uid, 'inventory', sku.id), {
          stockQuantity: Math.max(0, Math.trunc(Number(sku.stockQuantity) - qty)),
          updatedAt: serverTimestamp(),
        })
        batch.set(doc(collection(db, 'users', uid, 'stockMovements')), {
          ownerId: uid,
          branchId: po.branchId,
          itemId: sku.id,
          partNumber: sku.partNumber,
          movementType: 'purchase_return',
          quantityDelta: -qty,
          unitCostSnapshot: Number(sku.unitCost || 0),
          reason: String(`Return on ${po.orderNumber}: ${reason}`).slice(0, 300),
          createdAt: serverTimestamp(),
        })
        if (prnJe) {
          batch.set(doc(collection(db, 'users', uid, 'journalEntries')), {
            ownerId: uid,
            ...prnJe,
            createdAt: serverTimestamp(),
          })
        }
        await batch.commit()
        await appendAuditLog('PURCHASE_RETURN_POSTED', 'Procurement', `Returned ${qty}x ${sku.partNumber} on ${po.orderNumber} (Debit Memo KES ${returnCost})`)
        return { qty, returnCost }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/inventory/${sku.id}`)
      }
    },
    [uid, isFirebaseSession, purchaseOrders, inventory, appendAuditLog],
  )

  const updateTenantSettings = useCallback(
    next => {
      setTenantSettings(prev => {
        const merged = { ...prev, ...next }
        try {
          localStorage.setItem(`kms_tenant_settings_${uid || 'anon'}`, JSON.stringify(merged))
        } catch {
          // ignore
        }
        void appendAuditLog('TENANT_SETTINGS_UPDATED', 'Governance', `Updated business profile & workspace settings (${merged.businessName}, ${merged.tenantStatus})`)
        return merged
      })
    },
    [uid, appendAuditLog],
  )

  const addOrUpdateBranch = useCallback(
    branch => {
      const id = String(branch.id || `branch-${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9_-]/g, '')
      const record = {
        id,
        organizationId: branch.organizationId || profile.activeOrganizationId || 'org-kenyamotor',
        name: String(branch.name || 'New Branch').trim().slice(0, 120),
        area: String(branch.area || 'Kenya').trim().slice(0, 120),
        status: branch.status || 'Active',
      }
      setBranches(prev => {
        const next = prev.some(b => b.id === id) ? prev.map(b => (b.id === id ? record : b)) : [...prev, record]
        try {
          localStorage.setItem(`kms_branches_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
      void appendAuditLog('BRANCH_SAVED', 'Governance', `Saved branch ${record.name} (${record.status})`)
      return record
    },
    [uid, profile.activeOrganizationId, appendAuditLog],
  )

  const addOrUpdateStaffMember = useCallback(
    staff => {
      const id = String(staff.id || `staff-${Date.now().toString(36)}`)
      const record = {
        id,
        name: String(staff.name || '').trim().slice(0, 120),
        email: String(staff.email || '').trim().slice(0, 120),
        role: staff.role || 'cashier',
        branchId: staff.branchId || activeBranchId,
        status: staff.status || 'Active',
        permissions: Array.isArray(staff.permissions) ? staff.permissions : ['pos'],
      }
      setStaffMembers(prev => {
        const next = prev.some(s => s.id === id) ? prev.map(s => (s.id === id ? record : s)) : [record, ...prev]
        try {
          localStorage.setItem(`kms_staff_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
      void appendAuditLog('STAFF_UPDATED', 'Governance', `Staff ${record.name} (${record.role}) -> ${record.status}`)
      return record
    },
    [uid, activeBranchId, appendAuditLog],
  )

  const enrollDevice = useCallback(
    async ({ deviceName, capabilities = 'Barcode Scanner, Offline POS', branchId = activeBranchId }) => {
      const cleanName = String(deviceName || '').trim().slice(0, 120)
      if (!cleanName) throw new Error('Device name is required.')
      const docData = {
        ownerId: uid,
        branchId,
        deviceName: cleanName,
        capabilities: String(capabilities).slice(0, 200),
        status: 'Active',
        wipePending: false,
      }
      if (!isFirebaseSession) {
        const local = { id: `DEV-${Date.now().toString(36).toUpperCase()}`, ...docData, createdAt: new Date().toISOString() }
        setDevices(prev => [local, ...prev])
        await appendAuditLog('DEVICE_ENROLLED', 'Security', `Enrolled POS device ${local.deviceName} (${local.id})`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'devices'))
        await setDoc(ref, { ...docData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('DEVICE_ENROLLED', 'Security', `Enrolled POS device ${cleanName}`)
        return { id: ref.id, ...docData }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/devices`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  const revokeDevice = useCallback(
    async deviceId => {
      const target = devices.find(d => d.id === deviceId)
      if (!target) return
      if (!isFirebaseSession || deviceId.startsWith('DEV-')) {
        setDevices(prev => prev.map(d => (d.id === deviceId ? { ...d, status: 'Revoked', wipePending: true } : d)))
        await appendAuditLog('DEVICE_REVOKED_WIPE', 'Security', `Revoked device ${target.deviceName} and flagged remote offline wipe.`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'devices', deviceId), {
          status: 'Revoked',
          wipePending: true,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('DEVICE_REVOKED_WIPE', 'Security', `Revoked device ${target.deviceName} and flagged remote offline wipe.`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/devices/${deviceId}`)
      }
    },
    [uid, isFirebaseSession, devices, appendAuditLog],
  )

  const addLocation = useCallback(
    loc => {
      const record = {
        id: `loc-${Date.now().toString(36)}`,
        branchId: loc.branchId || activeBranchId,
        name: String(loc.name || '').trim().slice(0, 120),
        kind: loc.kind || 'Shop Shelf',
        code: String(loc.code || 'BIN-NEW').trim().toUpperCase().slice(0, 40),
      }
      setLocations(prev => {
        const next = [record, ...prev]
        try {
          localStorage.setItem(`kms_locations_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
      void appendAuditLog('LOCATION_ADDED', 'Inventory', `Added storage location ${record.code} (${record.kind})`)
      return record
    },
    [uid, activeBranchId, appendAuditLog],
  )

  const addBikeModel = useCallback(
    bike => {
      const record = {
        id: `bike-${Date.now().toString(36)}`,
        make: String(bike.make || '').trim().slice(0, 80),
        model: String(bike.model || '').trim().slice(0, 80),
        variant: String(bike.variant || '').trim().slice(0, 80),
        engineCc: Number(bike.engineCc || 150),
        yearRange: String(bike.yearRange || '2020–2026').slice(0, 30),
      }
      setBikeModels(prev => {
        const next = [record, ...prev]
        try {
          localStorage.setItem(`kms_bikes_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
      void appendAuditLog('BIKE_MODEL_ADDED', 'Catalogue', `Added bike model ${record.make} ${record.model}`)
      return record
    },
    [uid, appendAuditLog],
  )

  const addFitmentMapping = useCallback(
    mapping => {
      const bike = bikeModels.find(b => b.id === mapping.bikeModelId)
      const record = {
        id: `fit-${Date.now().toString(36)}`,
        partNumber: String(mapping.partNumber || '').trim().slice(0, 100),
        bikeModelId: mapping.bikeModelId || '',
        bikeLabel: bike ? `${bike.make} ${bike.model}` : String(mapping.bikeLabel || 'Universal'),
        position: String(mapping.position || 'Standard').trim().slice(0, 80),
        confidence: mapping.confidence || 'verified_fit',
        oemCode: String(mapping.oemCode || '').trim().slice(0, 80),
      }
      setFitmentMappings(prev => {
        const next = [record, ...prev]
        try {
          localStorage.setItem(`kms_fitment_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
      void appendAuditLog('FITMENT_MAPPED', 'Catalogue', `Mapped ${record.partNumber} -> ${record.bikeLabel} (${record.confidence})`)
      return record
    },
    [uid, bikeModels, appendAuditLog],
  )

  const requestApproval = useCallback(
    async ({ requestType, summary, requestedRole = 'cashier', payload = {} }) => {
      const actor = String(session?.user?.displayName || session?.user?.email || 'Operator').slice(0, 120)
      const reqDoc = {
        ownerId: uid,
        branchId: activeBranchId,
        requestType,
        summary: String(summary).trim().slice(0, 300),
        requestedBy: actor,
        requestedRole: String(requestedRole).slice(0, 40),
        payloadJson: JSON.stringify(payload).slice(0, 2000),
        status: 'PendingApproval',
      }
      if (!isFirebaseSession) {
        const local = { id: `apr-${Date.now()}`, ...reqDoc, createdAt: new Date().toISOString() }
        setApprovalRequests(prev => [local, ...prev])
        await appendAuditLog('APPROVAL_REQUESTED', 'Governance', `${requestType}: ${reqDoc.summary}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'approvalRequests'))
        await setDoc(ref, { ...reqDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('APPROVAL_REQUESTED', 'Governance', `${requestType}: ${reqDoc.summary}`)
        return { id: ref.id, ...reqDoc }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/approvalRequests`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, session, appendAuditLog],
  )

  const resolveApprovalRequest = useCallback(
    async (approvalId, approve, { approverRole = 'owner' } = {}) => {
      const target = approvalRequests.find(a => a.id === approvalId)
      if (!target || target.status !== 'PendingApproval') return
      const resolvedBy = String(session?.user?.displayName || session?.user?.email || 'Manager').slice(0, 120)
      if (approve && target.requestedBy === resolvedBy && approverRole !== 'owner') {
        throw new Error('Separation of duties: requester cannot self-approve this request.')
      }
      const nextStatus = approve ? 'Approved' : 'Rejected'

      if (approve && target.requestType === 'stock_adjustment') {
        try {
          const parsed = JSON.parse(target.payloadJson || '{}')
          if (parsed.itemId && parsed.quantityDelta) {
            await adjustInventoryStock(parsed.itemId, Number(parsed.quantityDelta), `Approved Adjustment (${parsed.reasonCode || 'correction'}): ${parsed.notes || ''}`)
          }
        } catch {
          // skip malformed payload
        }
      }

      if (!isFirebaseSession) {
        setApprovalRequests(prev => prev.map(a => (a.id === approvalId ? { ...a, status: nextStatus, resolvedBy } : a)))
        await appendAuditLog('APPROVAL_RESOLVED', 'Governance', `${target.requestType} ${nextStatus} by ${resolvedBy}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'approvalRequests', approvalId), {
          status: nextStatus,
          resolvedBy,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('APPROVAL_RESOLVED', 'Governance', `${target.requestType} ${nextStatus} by ${resolvedBy}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/approvalRequests/${approvalId}`)
      }
    },
    [uid, isFirebaseSession, session, approvalRequests, adjustInventoryStock, appendAuditLog],
  )

  const createPurchaseRequisition = useCallback(
    async ({ itemsSummary, estimatedCost = 0 }) => {
      const actor = String(session?.user?.displayName || session?.user?.email || 'Storekeeper').slice(0, 120)
      const docData = {
        ownerId: uid,
        branchId: activeBranchId,
        reqNumber: `PR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(100 + Math.random() * 899))}`,
        itemsSummary: String(itemsSummary || '').trim().slice(0, 400),
        estimatedCost: Math.max(0, Number(estimatedCost || 0)),
        requestedBy: actor,
        status: 'PendingApproval',
      }
      if (!isFirebaseSession) {
        const local = { id: `pr-${Date.now()}`, ...docData, createdAt: new Date().toISOString() }
        setPurchaseRequisitions(prev => [local, ...prev])
        await appendAuditLog('PR_CREATED', 'Procurement', `Created Purchase Requisition ${docData.reqNumber}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'purchaseRequisitions'))
        await setDoc(ref, { ...docData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('PR_CREATED', 'Procurement', `Created Purchase Requisition ${docData.reqNumber}`)
        return { id: ref.id, ...docData }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/purchaseRequisitions`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, session, appendAuditLog],
  )

  const resolvePurchaseRequisition = useCallback(
    async (reqId, nextStatus, supplierName = '') => {
      const target = purchaseRequisitions.find(r => r.id === reqId)
      if (!target) return
      if (nextStatus === 'ConvertedToPO') {
        await createPurchaseOrder({
          supplierName: supplierName || suppliers[0]?.supplierName || 'Nairobi Spares Importers Ltd',
          itemsSummary: target.itemsSummary,
          totalCost: target.estimatedCost,
          orderedQty: 10,
        })
      }
      if (!isFirebaseSession) {
        setPurchaseRequisitions(prev => prev.map(r => (r.id === reqId ? { ...r, status: nextStatus } : r)))
        await appendAuditLog('PR_UPDATED', 'Procurement', `Purchase Requisition ${target.reqNumber} -> ${nextStatus}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'purchaseRequisitions', reqId), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('PR_UPDATED', 'Procurement', `Purchase Requisition ${target.reqNumber} -> ${nextStatus}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/purchaseRequisitions/${reqId}`)
      }
    },
    [uid, isFirebaseSession, purchaseRequisitions, suppliers, createPurchaseOrder, appendAuditLog],
  )

  const createSupplierQuote = useCallback(
    async ({ rfqRef, supplierId, partNumber, quotedUnitPrice, leadTimeDays = 2, paymentTerms = 'Net 30' }) => {
      const sup = suppliers.find(s => s.id === supplierId) || suppliers[0]
      const docData = {
        ownerId: uid,
        branchId: activeBranchId,
        rfqRef: String(rfqRef || `RFQ-${Date.now().toString().slice(-4)}`).trim().slice(0, 80),
        supplierId: sup?.id || String(supplierId || 'sup-default'),
        supplierName: sup?.supplierName || 'Supplier',
        partNumber: String(partNumber || '').trim().slice(0, 100),
        quotedUnitPrice: Math.max(1, Number(quotedUnitPrice || 1)),
        leadTimeDays: Math.max(0, Math.trunc(Number(leadTimeDays || 2))),
        paymentTerms: String(paymentTerms || 'Net 30').slice(0, 80),
        status: 'Submitted',
      }
      if (!isFirebaseSession) {
        const local = { id: `rfq-${Date.now()}`, ...docData, createdAt: new Date().toISOString() }
        setSupplierQuotes(prev => [local, ...prev])
        await appendAuditLog('RFQ_SUBMITTED', 'Procurement', `Logged quote ${docData.rfqRef} from ${docData.supplierName} for ${docData.partNumber}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'supplierQuotes'))
        await setDoc(ref, { ...docData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('RFQ_SUBMITTED', 'Procurement', `Logged quote ${docData.rfqRef} from ${docData.supplierName} for ${docData.partNumber}`)
        return { id: ref.id, ...docData }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/supplierQuotes`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, suppliers, appendAuditLog],
  )

  const awardSupplierQuote = useCallback(
    async (quoteId, qty = 10) => {
      const quote = supplierQuotes.find(q => q.id === quoteId)
      if (!quote || quote.status !== 'Submitted') return
      await createPurchaseOrder({
        supplierName: quote.supplierName,
        itemsSummary: `${quote.partNumber} x${qty} (Awarded ${quote.rfqRef})`,
        totalCost: Number(quote.quotedUnitPrice) * Math.max(1, Number(qty)),
        orderedQty: Math.max(1, Math.trunc(Number(qty))),
      })
      if (!isFirebaseSession) {
        setSupplierQuotes(prev => prev.map(q => (q.id === quoteId ? { ...q, status: 'Awarded' } : q)))
        await appendAuditLog('RFQ_AWARDED', 'Procurement', `Awarded ${quote.rfqRef} to ${quote.supplierName} -> PO drafted.`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'supplierQuotes', quoteId), {
          status: 'Awarded',
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('RFQ_AWARDED', 'Procurement', `Awarded ${quote.rfqRef} to ${quote.supplierName} -> PO drafted.`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/supplierQuotes/${quoteId}`)
      }
    },
    [uid, isFirebaseSession, supplierQuotes, createPurchaseOrder, appendAuditLog],
  )

  const createInboundContainer = useCallback(
    async ({ containerNumber, originPort, shippingLine = '', etaDate = '', itemsSummary }) => {
      const docData = {
        ownerId: uid,
        branchId: activeBranchId,
        containerNumber: String(containerNumber || '').trim().toUpperCase().slice(0, 80),
        originPort: String(originPort || '').trim().slice(0, 120),
        shippingLine: String(shippingLine || '').trim().slice(0, 120),
        etaDate: String(etaDate || '').trim().slice(0, 20),
        itemsSummary: String(itemsSummary || '').trim().slice(0, 400),
        status: 'Booked',
      }
      if (!isFirebaseSession) {
        const local = { id: `cnt-${Date.now()}`, ...docData, createdAt: new Date().toISOString() }
        setInboundContainers(prev => [local, ...prev])
        await appendAuditLog('CONTAINER_BOOKED', 'Logistics', `Booked container ${docData.containerNumber} from ${docData.originPort}`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'inboundContainers'))
        await setDoc(ref, { ...docData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('CONTAINER_BOOKED', 'Logistics', `Booked container ${docData.containerNumber} from ${docData.originPort}`)
        return { id: ref.id, ...docData }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/inboundContainers`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  const updateInboundContainer = useCallback(
    async (containerId, nextStatus) => {
      const target = inboundContainers.find(c => c.id === containerId)
      if (!target) return
      if (!isFirebaseSession || containerId.startsWith('cnt-seed')) {
        setInboundContainers(prev => prev.map(c => (c.id === containerId ? { ...c, status: nextStatus } : c)))
        await appendAuditLog('CONTAINER_STAGE_UPDATED', 'Logistics', `Container ${target.containerNumber} -> ${nextStatus}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'inboundContainers', containerId), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('CONTAINER_STAGE_UPDATED', 'Logistics', `Container ${target.containerNumber} -> ${nextStatus}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/inboundContainers/${containerId}`)
      }
    },
    [uid, isFirebaseSession, inboundContainers, appendAuditLog],
  )

  const createSupportTicket = useCallback(
    async ({ subject, category = 'Operations', priority = 'Normal', description }) => {
      const docData = {
        ownerId: uid,
        branchId: activeBranchId,
        subject: String(subject || '').trim().slice(0, 160),
        category: String(category).slice(0, 80),
        priority,
        description: String(description || '').trim().slice(0, 600),
        status: 'Open',
      }
      if (!isFirebaseSession) {
        const local = { id: `tkt-${Date.now()}`, ...docData, createdAt: new Date().toISOString() }
        setSupportTickets(prev => [local, ...prev])
        await appendAuditLog('SUPPORT_TICKET_CREATED', 'Support', `Ticket: ${docData.subject} (${priority})`)
        return local
      }
      try {
        const ref = doc(collection(db, 'users', uid, 'supportTickets'))
        await setDoc(ref, { ...docData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await appendAuditLog('SUPPORT_TICKET_CREATED', 'Support', `Ticket: ${docData.subject} (${priority})`)
        return { id: ref.id, ...docData }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/supportTickets`)
      }
    },
    [uid, activeBranchId, isFirebaseSession, appendAuditLog],
  )

  const resolveSupportTicket = useCallback(
    async (ticketId, status = 'Resolved') => {
      if (!isFirebaseSession) {
        setSupportTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, status } : t)))
        await appendAuditLog('SUPPORT_TICKET_UPDATED', 'Support', `Ticket ${ticketId} -> ${status}`)
        return
      }
      try {
        await updateDoc(doc(db, 'users', uid, 'supportTickets', ticketId), {
          status,
          updatedAt: serverTimestamp(),
        })
        await appendAuditLog('SUPPORT_TICKET_UPDATED', 'Support', `Ticket ${ticketId} -> ${status}`)
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/supportTickets/${ticketId}`)
      }
    },
    [uid, isFirebaseSession, appendAuditLog],
  )

  const createApiKey = useCallback(
    (label, scope) => {
      const created = buildApiKeyMetadata(label, scope)
      setApiKeys(prev => {
        const next = [created, ...prev]
        try {
          localStorage.setItem(`kms_apikeys_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
      void appendAuditLog('API_KEY_GENERATED', 'Security', `Issued API key ${created.maskedPrefix} (${created.scope})`)
      return created
    },
    [uid, appendAuditLog],
  )

  const revokeApiKey = useCallback(
    keyId => {
      setApiKeys(prev => {
        const next = prev.map(k => (k.id === keyId ? { ...k, status: 'Revoked' } : k))
        try {
          localStorage.setItem(`kms_apikeys_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
      void appendAuditLog('API_KEY_REVOKED', 'Security', `Revoked partner API key ${keyId}`)
    },
    [uid, appendAuditLog],
  )

  const exportWorkspaceBackup = useCallback(
    () =>
      buildWorkspaceBackupPayload({
        tenantSettings,
        branches,
        inventory,
        sales,
        expenses,
        journalEntries,
        stockMovements,
        purchaseOrders,
        suppliers,
        customers,
        auditLogs,
      }),
    [tenantSettings, branches, inventory, sales, expenses, journalEntries, stockMovements, purchaseOrders, suppliers, customers, auditLogs],
  )

  const verifyBackupPayload = useCallback(payload => verifyWorkspaceBackupPayload(payload), [])

  const toggleFeatureFlag = useCallback(
    key => {
      setFeatureFlags(prev => {
        const next = { ...prev, [key]: !prev[key] }
        try {
          localStorage.setItem(`kms_flags_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        void appendAuditLog('FEATURE_FLAG_UPDATED', 'Platform Governance', `Feature flag ${key} -> ${next[key] ? 'ENABLED' : 'DISABLED'}`)
        return next
      })
    },
    [uid, appendAuditLog],
  )

  const toggleNotificationPref = useCallback(
    key => {
      setNotificationPrefs(prev => {
        const next = { ...prev, [key]: !prev[key] }
        try {
          localStorage.setItem(`kms_ntf_prefs_${uid || 'anon'}`, JSON.stringify(next))
        } catch {
          // ignore
        }
        void appendAuditLog('NOTIFICATION_PREF_UPDATED', 'Notifications', `Preference ${key} -> ${next[key] ? 'ON' : 'OFF'}`)
        return next
      })
    },
    [uid, appendAuditLog],
  )

  const value = useMemo(
    () => ({
      ready,
      isFirebaseSession,
      profile,
      activeBranchId,
      complianceMode,
      tenantSettings,
      updateTenantSettings,
      branches,
      addOrUpdateBranch,
      staffMembers,
      addOrUpdateStaffMember,
      devices,
      enrollDevice,
      revokeDevice,
      locations,
      addLocation,
      bikeModels,
      addBikeModel,
      fitmentMappings,
      addFitmentMapping,
      approvalRequests,
      requestApproval,
      resolveApprovalRequest,
      purchaseRequisitions,
      createPurchaseRequisition,
      resolvePurchaseRequisition,
      supplierQuotes,
      createSupplierQuote,
      awardSupplierQuote,
      inboundContainers,
      createInboundContainer,
      updateInboundContainer,
      supportTickets,
      createSupportTicket,
      resolveSupportTicket,
      apiKeys,
      createApiKey,
      revokeApiKey,
      trainingMode,
      setTrainingMode,
      exportWorkspaceBackup,
      verifyBackupPayload,
      inventory,
      stockMovements,
      purchaseOrders,
      suppliers,
      stockCounts,
      sales,
      expenses,
      transfers,
      creditAccounts,
      radarRequests,
      etimsInvoices,
      payoutBatches,
      auditLogs,
      customers,
      salesReturns,
      drawerShifts,
      notifications,
      journalEntries,
      chatThreads,
      messagesByThread,
      offlineMode,
      setOfflineMode,
      outbox,
      outboxConflicts,
      syncOutbox,
      resolveOutboxConflict,
      agentControls,
      toggleAgentControl,
      featureFlags,
      toggleFeatureFlag,
      notificationPrefs,
      toggleNotificationPref,
      setActiveBranch,
      setComplianceMode,
      completePosCheckout,
      recordDailyExpense,
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
      allocateLandedCost,
      createBranchTransfer,
      updateBranchTransfer,
      createCreditAccount,
      settleCreditBalance,
      createRadarRequest,
      updateRadarRequest,
      retryEtimsInvoice,
      createPayoutBatch,
      resolvePayoutBatch,
      postReversingJournalEntry,
      createCustomerProfile,
      updateCustomerConsent,
      sendWorkspaceNotification,
      markNotificationRead,
      markAllNotificationsRead,
      submitSalesReturn,
      resolveSalesReturn,
      openDrawerShift,
      closeDrawerShift,
      breakStockPack,
      importCatalogueRows,
      returnPurchaseOrderStock,
      subscribeChatThread,
      createChatThread,
      updateChatThreadConfig,
      appendChatMessage,
      appendAuditLog,
    }),
    [
      ready,
      isFirebaseSession,
      profile,
      activeBranchId,
      complianceMode,
      tenantSettings,
      updateTenantSettings,
      branches,
      addOrUpdateBranch,
      staffMembers,
      addOrUpdateStaffMember,
      devices,
      enrollDevice,
      revokeDevice,
      locations,
      addLocation,
      bikeModels,
      addBikeModel,
      fitmentMappings,
      addFitmentMapping,
      approvalRequests,
      requestApproval,
      resolveApprovalRequest,
      purchaseRequisitions,
      createPurchaseRequisition,
      resolvePurchaseRequisition,
      supplierQuotes,
      createSupplierQuote,
      awardSupplierQuote,
      inboundContainers,
      createInboundContainer,
      updateInboundContainer,
      supportTickets,
      createSupportTicket,
      resolveSupportTicket,
      apiKeys,
      createApiKey,
      revokeApiKey,
      trainingMode,
      exportWorkspaceBackup,
      verifyBackupPayload,
      inventory,
      stockMovements,
      purchaseOrders,
      suppliers,
      stockCounts,
      sales,
      expenses,
      transfers,
      creditAccounts,
      radarRequests,
      etimsInvoices,
      payoutBatches,
      auditLogs,
      customers,
      salesReturns,
      drawerShifts,
      notifications,
      journalEntries,
      chatThreads,
      messagesByThread,
      offlineMode,
      outbox,
      outboxConflicts,
      syncOutbox,
      resolveOutboxConflict,
      agentControls,
      toggleAgentControl,
      featureFlags,
      toggleFeatureFlag,
      notificationPrefs,
      toggleNotificationPref,
      setActiveBranch,
      setComplianceMode,
      completePosCheckout,
      recordDailyExpense,
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
      updateBranchTransfer,
      createCreditAccount,
      settleCreditBalance,
      createRadarRequest,
      updateRadarRequest,
      retryEtimsInvoice,
      createPayoutBatch,
      resolvePayoutBatch,
      postReversingJournalEntry,
      createCustomerProfile,
      updateCustomerConsent,
      sendWorkspaceNotification,
      markNotificationRead,
      markAllNotificationsRead,
      submitSalesReturn,
      resolveSalesReturn,
      openDrawerShift,
      closeDrawerShift,
      breakStockPack,
      importCatalogueRows,
      returnPurchaseOrderStock,
      subscribeChatThread,
      createChatThread,
      updateChatThreadConfig,
      appendChatMessage,
      appendAuditLog,
    ],
  )

  if (asyncError) {
    throw asyncError
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
