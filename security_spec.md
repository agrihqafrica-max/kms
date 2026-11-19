# Security Specification — KenyaMoto Supply Hub Firestore Rules

## 1. Data Invariants
1. Every document under `/users/{userId}/**` belongs strictly to `userId == request.auth.uid`.
2. Every subcollection write checks parent existence (`exists(/databases/$(database)/documents/users/$(userId))`) and `incoming().ownerId == request.auth.uid`.
3. Every ID path segment passes `isValidId(id)` (`size <= 128` and `^[a-zA-Z0-9_\-]+$`).
4. Every string field enforces `.size()` bounds; every document enforces exact required keys (`hasAll`) and allowed keys (`hasOnly`).
5. PII (`email`, `photoURL`) is isolated in `/users/{userId}/private/info` and readable/writable only by `userId == request.auth.uid` with verified email.
6. Immutable ledger records (`sales`, `stockMovements`, `auditLogs`, `chatMessages`, `journalEntries`) forbid client `update` and `delete`.
7. Stateful workflows (`purchaseOrders`, `transfers`, `etimsInvoices`, `payoutBatches`, `radarRequests`, `stockCounts`, `salesReturns`, `approvalRequests`, `purchaseRequisitions`, `supplierQuotes`, `inboundContainers`, `supportTickets`) enforce terminal state locks (no updates once terminal) and allowlisted `affectedKeys().hasOnly(...)` action branches.
8. Enrolled devices (`devices`) enforce active-to-revoked remote wipe flags without permitting deletion, and `SalesReturn` carries `requestedBy`/`approvedBy` attribution for separation-of-duties checks (`BR-002`).
9. Every `createdAt` on create equals `request.time`; every `updatedAt` on update equals `request.time`; `ownerId` and `createdAt` are immutable.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Cross-Tenant Read**: User B reads `/users/userA/inventory/item1`.
2. **Cross-Tenant List Scraping**: User B queries `/users/userA/sales`.
3. **Identity Spoofing on Create**: User A writes `/users/userA/inventory/item1` with `ownerId: "userB"`.
4. **Shadow Field Injection**: User A creates `/users/userA/inventory/item1` with extra `isVerifiedAdmin: true`.
5. **Client Timestamp Forgery**: User A creates `/users/userA/sales/sale1` with `createdAt` in the past instead of `request.time`.
6. **Immutable Ledger Mutation**: User A updates `totalAmount` on an existing `/users/userA/sales/sale1`.
7. **Ledger Deletion**: User A deletes `/users/userA/auditLogs/log1` or `/users/userA/stockMovements/m1`.
8. **Terminal State Bypass**: User A updates a `PurchaseOrder` whose status is already `Received` or `Rejected`.
9. **Path ID Poisoning**: User A writes `/users/userA/inventory/bad$id..with.dots` or 1KB ID string.
10. **PII Leak / Unverified Email**: Unverified or foreign user reads `/users/userA/private/info`.
11. **Value Poisoning on Update**: User A updates `PurchaseOrder` `status` to `"HackedStatus"` not in allowlist.
12. **Oversized String DoS**: User A writes a 50KB `partName` into `/users/userA/inventory/item1`.
