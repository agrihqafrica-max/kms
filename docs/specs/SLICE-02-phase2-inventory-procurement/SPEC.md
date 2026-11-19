# SLICE-02 — Phase 2: Parts Master, Cycle Counts, Reorder Intelligence & Procurement / GRN

- **Status**: Implemented (Frontend + Cloud Firestore + Domain Unit Tests; Postgres/Supabase historical API untouched)
- **Blueprint Authority**: `Master_Ecosystem_Blueprint_v2.0` (§4.2, §4.3, §4.5, §5.1, §5.2, §6.3, §10), `Phased_Implementation_Roadmap_v2.0` (§4 Phase 2)
- **Active Roles**: `raw-information-interpreter`, `product-specification-architect`, `solution-architect`, `backend-engineer`, `frontend-engineer`, `qa-test-engineer`, `code-security-reviewer`, `devops-integration-engineer`, `release-manager`

---

## 1. Interpreted Phase 2 Functional Scope

1. **Parts Master & Bike Fitment Depth**:
   - Every branch SKU supports `brand`, `barcode`, `qualityGrade` (`OEM | Genuine | Aftermarket_A | Aftermarket_B`), `uom` (`Piece | Set | Pair | Box | Carton`), `packSize` (`int >= 1`), `binLocation`, `reservedQuantity` (`0 <= reserved <= stockQuantity`), `oemCrossRefs`, and `fitmentConfidence` (`verified_fit | likely_fit | requires_confirmation`).
   - Net saleable stock is strictly `available = max(0, stockQuantity - reservedQuantity)`.
2. **Stock Health Valuation & CSV Export**:
   - Real-time branch valuation summary: Total Cost Valuation, Retail Value & Avg Gross Margin %, Reorder Alerts (separating open-PO covered vs uncovered SKUs), and Dead-Stock Capital Tied Up.
   - RFC-4180 CSV download (`buildInventoryValuationCsv`) with CSV formula/quote escaping.
3. **Automated Reorder Queue & Dead-Stock Capital Recovery**:
   - Low-stock recommendations sorted by open-PO coverage and shortage severity, with one-click PO drafting.
   - Slow/dead-stock list with direct inter-branch transfer proposal creation (`transfers` collection in valid `Pending` state) and 15% clearance audit flagging.
4. **Supplier Registry & Scorecard**:
   - Persistent `suppliers` collection storing `supplierName`, `category`, `area`, `leadTimeDays`, `paymentTerms`, `fillRatePct`, `defectRatePct`, and `status` (`Verified | Probation | Suspended`), scored into `Preferred | Standard | Watchlist` tiers.
5. **Partial / Full GRN Receiving & Landed Cost Breakdown**:
   - POs transition cleanly through `Pending -> Approved -> PartiallyReceived -> Received` (or `Rejected`).
   - GRN captures `receivedGoodQty`, `damagedQty`, `lotNumber`, `grnNotes`, plus itemized `freightCost`, `customsCost`, and `handlingCost`.
   - When linked to a branch SKU, posting a GRN atomically updates PO status/totals, increments SKU stock, and records signed `receipt` and `damage` `stockMovements` with lot and unit landed-cost snapshots.
6. **Cycle Count Variance Proposals (No Silent Stock Overwrites)**:
   - Storekeepers submit physical shelf counts into `stockCounts` (`PendingApproval`).
   - Managers approve or reject variance proposals; approval atomically updates `inventory.stockQuantity`, recalculates `velocityClass`, writes an immutable signed `count_variance` `stockMovements` entry, and appends an `AuditLog`.

---

## 2. Acceptance Criteria (`AC-P2-001` – `AC-P2-008`)

- **AC-P2-001 (Parts Master & Search)**: Searching by SKU, barcode, OEM cross-reference, brand, or bike model filters branch SKUs cleanly; creating a new SKU persists all Parts Master attributes inside `users/{uid}/inventory`.
- **AC-P2-002 (Reservation & Availability)**: `reservedQuantity` cannot go negative or exceed `stockQuantity`; UI shows `On Hand / Reserved / Available` with tabular alignment.
- **AC-P2-003 (Stock Health & CSV)**: Stock Health KPI strip matches `computeStockHealthSummary(branchItems)`; Export CSV produces valid RFC-4180 output.
- **AC-P2-004 (Reorder Queue & Dead Stock)**: Uncovered critical SKUs sort first; Draft PO creates a `Pending` PO; Dead Stock transfer proposes a `Pending` branch transfer.
- **AC-P2-005 (Partial GRN & Landed Cost)**: Partial delivery (`totalGoodReceived < orderedQty`) transitions PO to `PartiallyReceived` without losing remaining backorder count; summing freight + customs + handling sets `landedCost` and computes `unitLandedCost`.
- **AC-P2-006 (Supplier Scorecard)**: Supplier profiles persist in `users/{uid}/suppliers` and render fill rate, defect rate, lead time, and score tier.
- **AC-P2-007 (Cycle Count Governance)**: Submitting a physical count creates a `PendingApproval` `stockCounts` doc without changing SKU `stockQuantity` until explicitly approved; approval atomically updates `stockQuantity` and writes a `count_variance` `stockMovements` row.
- **AC-P2-008 (Enterprise SaaS Visual Standard)**: No bloated website-style display headlines (`topbar h1 <= 20px`), crisp single-row SaaS header with breadcrumbs, squared zero-pill semantic tags, dense scrollable tables with `tabular-nums`, and responsive 390px layout.
