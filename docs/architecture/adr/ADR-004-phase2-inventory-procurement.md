# ADR-004 — Phase 2 Inventory, Cycle Count Governance & Procurement GRN Architecture

- **Status**: Accepted & Deployed to Firestore Rules (`ai-studio-kms-163f3f6d-1c1d-4fb4-af5a-0104916ad335`)
- **Date**: 2026-11-19
- **Context**: Master Ecosystem Blueprint §4.2, §4.3, §4.5, §5.1, §5.2, §6.3 requires full Parts Master depth, cycle-count approval before stock adjustment, partial GRN discrepancy tracking with itemized landed-cost allocation, and supplier reliability tracking under strict owner isolation.

## Decision

1. **Firestore Blueprint & Rules Synchronization**:
   - Extended `/users/{userId}/inventory/{itemId}` with `brand`, `barcode`, `qualityGrade`, `uom`, `packSize`, `binLocation`, `reservedQuantity`, `oemCrossRefs`, and `fitmentConfidence`.
   - Extended `/users/{userId}/purchaseOrders/{poId}` to support `'PartiallyReceived'`, `orderedQty`, `receivedQty`, `damagedQty`, `lotNumber`, `grnNotes`, `freightCost`, `customsCost`, `handlingCost`.
   - Extended `/users/{userId}/stockMovements/{movementId}` with `'count_variance'` and `'damage'` movement types, `lotNumber`, and `unitCostSnapshot` (preserving `allow update, delete: if false`).
   - Added `/users/{userId}/stockCounts/{countId}` (create strictly `status == 'PendingApproval'`, update strictly from `'PendingApproval'` modifying only `['status', 'updatedAt']`, `allow delete: if false`).
   - Added `/users/{userId}/suppliers/{supplierId}` under Eight Pillars owner + `email_verified` + `request.time` + `affectedKeys().hasOnly(...)` guards.
2. **Composite-Index Avoidance**:
   - All subscriptions query `where('ownerId', '==', uid)` and perform client-side deterministic sorting (`sortRecords`) so newly added collections (`stockCounts`, `suppliers`) work immediately on Cloud Firestore without requiring manual composite-index provisioning.
3. **Seed Idempotency for Existing Users**:
   - `bootstrapAndSubscribe()` checks `suppliers` emptiness independently of `inventory` emptiness so previously authenticated owners receive initial `suppliers` and `cnt-seed-001` (`PendingApproval`) cleanly.
4. **Pure Domain Decoupling**:
   - `computeAvailableStock`, `buildReorderRecommendations`, `computeGrnSettlement`, `computeStockHealthSummary`, `evaluateSupplierScore`, and `buildInventoryValuationCsv` live in `frontend/src/lib/kmsDomain.js` and are covered by `node:test` assertions.

## Security & Integrity Notes

- Cycle count proposals cannot mutate `inventory` directly on create; stock mutation happens inside an explicit manager-approved `writeBatch` pairing `stockCounts.status`, `inventory.stockQuantity`, and an immutable `stockMovements` (`count_variance`) ledger record.
- Partial/full GRN updates validate `existing().status in ['Pending', 'Approved', 'PartiallyReceived']` inside `firestore.rules`.
- No secrets or privileged admin keys exist in client code or bundles.
