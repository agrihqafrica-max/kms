import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

test('firestore.rules includes rules_version 2 and default-deny catch-all', () => {
  assert.match(rulesContent, /rules_version\s*=\s*'2'/);
  assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules covers every collection in firebase-blueprint.json', () => {
  const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));
  for (const pathKey of Object.keys(blueprint.firestore)) {
    const collectionName = pathKey.split('/').filter(p => !p.startsWith('{')).pop();
    assert.ok(
      rulesContent.includes(collectionName),
      `Missing match block for blueprint collection: ${collectionName}`
    );
  }
});

test('firestore.rules enforces Eight Pillars guards (isValidId, email_verified, request.time, affectedKeys)', () => {
  assert.match(rulesContent, /function isValidId\(id\)/);
  assert.match(rulesContent, /email_verified == true/);
  assert.match(rulesContent, /request\.time/);
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly/);
  assert.match(rulesContent, /allow update, delete: if false;/);
  assert.match(rulesContent, /'PartiallyReceived'/);
  assert.match(rulesContent, /'count_variance'/);
  assert.match(rulesContent, /'damage'/);
  assert.match(rulesContent, /'pack_break'/);
  assert.match(rulesContent, /'purchase_return'/);
  assert.match(rulesContent, /function isValidStockCount\(/);
  assert.match(rulesContent, /function isValidSupplier\(/);
  assert.match(rulesContent, /function isValidJournalEntry\(/);
  assert.match(rulesContent, /data\.totalCredit == data\.totalDebit/);
  assert.match(rulesContent, /function isValidCustomerProfile\(/);
  assert.match(rulesContent, /function isValidSalesReturn\(/);
  assert.match(rulesContent, /function isValidDrawerShift\(/);
  assert.match(rulesContent, /function isValidAppNotification\(/);
  assert.match(rulesContent, /function isValidDeviceRecord\(/);
  assert.match(rulesContent, /function isValidApprovalRequest\(/);
  assert.match(rulesContent, /function isValidPurchaseRequisition\(/);
  assert.match(rulesContent, /function isValidSupplierQuote\(/);
  assert.match(rulesContent, /function isValidInboundContainer\(/);
  assert.match(rulesContent, /function isValidSupportTicket\(/);
  assert.match(rulesContent, /'split'/);
});

test('firestoreStore initial seed statuses conform to firestore.rules create invariants and avoid composite index queries', () => {
  const storeSource = fs.readFileSync('frontend/src/lib/firestoreStore.jsx', 'utf8');
  const seedMatch = storeSource.match(/function makeSeedDocs\(uid\) \{[\s\S]*?\n\}/);
  assert.ok(seedMatch, 'makeSeedDocs must exist in firestoreStore.jsx');
  const seedBlock = seedMatch[0];

  const poSection = seedBlock.match(/purchaseOrders:\s*\[[\s\S]*?\],\s*transfers:/)[0];
  assert.doesNotMatch(poSection, /status:\s*'(Approved|PartiallyReceived|Received|Rejected)'/);

  const transferSection = seedBlock.match(/transfers:\s*\[[\s\S]*?\],\s*creditAccounts:/)[0];
  assert.doesNotMatch(transferSection, /status:\s*'(Dispatched|Received|Rejected)'/);

  const radarSection = seedBlock.match(/radarRequests:\s*\[[\s\S]*?\],\s*expenses:/)[0];
  assert.doesNotMatch(radarSection, /status:\s*'(Pending|Reserved|Resolved)'/);

  if (/stockCounts:\s*\[/.test(seedBlock)) {
    const countsSection = seedBlock.match(/stockCounts:\s*\[[\s\S]*?\],/)[0];
    assert.doesNotMatch(countsSection, /status:\s*'(Approved|Rejected)'/);
  }

  if (/salesReturns:\s*\[/.test(seedBlock)) {
    const retSection = seedBlock.match(/salesReturns:\s*\[[\s\S]*?\],/)[0];
    assert.doesNotMatch(retSection, /status:\s*'(Approved|Rejected)'/);
  }

  if (/drawerShifts:\s*\[/.test(seedBlock)) {
    const shiftSection = seedBlock.match(/drawerShifts:\s*\[[\s\S]*?\],/)[0];
    assert.doesNotMatch(shiftSection, /status:\s*'(Closed|Approved)'/);
  }

  assert.doesNotMatch(storeSource, /orderBy\(/);
});


