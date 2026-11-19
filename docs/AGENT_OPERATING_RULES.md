# Agent Operating Rules
## Kenya Motorcycle Spare Parts & Supply Chain Ecosystem

This document is the single source of truth for how the project agents in `.qoder/agents/` work together. Every agent must read this document, `AGENTS.md`, and the handover documents relevant to its task before starting work.

## 1. Authoritative references (order of precedence)

1. `AGENTS.md` — project safety and process rules (always binding).
2. `docs/Master_Ecosystem_Blueprint.pdf` — Master Ecosystem Blueprint v2.0 (19 Nov 2026). Authoritative product and architecture specification.
3. `docs/Phased_Implementation_Roadmap.pdf` — Phased Implementation Roadmap v2.0 (19 Nov 2026). Authoritative delivery plan, phase gates, Definition of Done, release stages.
4. `HANDOVER/00_READ_FIRST.md` through `HANDOVER/11_VERIFICATION_AND_MIGRATION_CHECKLIST.md` — verified current state, decisions, contradictions, and pending work.
5. Supporting docs: `docs/MASTER PRODUCT REQUIREMENTS DOCUMENT.pdf`, `docs/MASTER TEST SUITE.pdf`.

Derived convenience copies: `docs/reference-text/*.extracted.txt` are plain-text extractions of the two v2.0 PDFs (PDF page rendering is unavailable in this environment). If an extract conflicts with its PDF, the PDF wins. Re-extract with `.venv/Scripts/python` + `pypdf` if the PDFs change.

Where the blueprint and roadmap conflict with older handover assumptions, the v2.0 documents define the target; record the contradiction in `HANDOVER/06_CONTRADICTIONS_AND_DECISION_REGISTER.md` instead of silently resolving it.

## 2. Delivery pipeline and gates

Major features flow through these stages in order. A stage's output must exist and be approved before the next stage begins.

| # | Stage | Owner agent | Gate to proceed |
|---|-------|-------------|-----------------|
| 1 | Interpret raw information | `raw-information-interpreter` | Requirement register reviewed; open questions answered or explicitly deferred by the human product owner |
| 2 | Specify | `product-specification-architect` | Reviewable specification with testable acceptance criteria for every requirement; approved by product owner |
| 3 | Design | `solution-architect` | Technical design (ADR + API contracts + data model + security model) approved before any coding |
| 4 | Implement | `backend-engineer`, `frontend-engineer` | Implementation strictly from the agreed specification and API contracts |
| 5 | Test | `qa-test-engineer` | Every acceptance criterion has an executed test with recorded evidence; offline and reconciliation scenarios mandatory |
| 6 | Review | `code-security-reviewer` | No blocking findings; security review mandatory for auth, payments, tenant data, permissions, AI, and external integrations |
| 7 | Release | `release-manager` + `devops-integration-engineer` | Phase gate satisfied (section 5); explicit human approval for any production action |

## 3. Single source of truth — canonical artifact locations

| Artifact | Canonical location | Written by |
|----------|--------------------|------------|
| Requirement register, business rules, data dictionary, assumptions, open questions, prioritised backlog | `docs/requirements/REQUIREMENT_REGISTER.md` (plus per-source evidence files in `docs/requirements/`) | raw-information-interpreter |
| Feature specifications (epics, stories, acceptance criteria, workflows, edge cases, permissions, notifications, reports) | `docs/specs/<feature-id>/SPEC.md` | product-specification-architect |
| Architecture decision records | `docs/architecture/adr/ADR-NNN-<title>.md` | solution-architect |
| Domain model, API contracts, event flows, security model, migration plans | `docs/architecture/` (`api-contracts/`, `domain-model.md`, etc.) | solution-architect |
| Test results and acceptance status (TC-01 … TC-40) | `HANDOVER/05_TESTING_AND_ACCEPTANCE_LEDGER.md` | qa-test-engineer |
| Module/feature status and release status | `HANDOVER/04_MODULES_AND_FEATURE_STATUS.md`, `HANDOVER/08_NEXT_DEVELOPMENT_ROADMAP.md` | release-manager |
| Phase gate checklists and gate decisions | `docs/release/PHASE_GATE_TRACKER.md` | release-manager |
| Contradictions and decisions | `HANDOVER/06_CONTRADICTIONS_AND_DECISION_REGISTER.md` | any agent that discovers a contradiction |

Rules:
- Never keep a parallel private version of these artifacts. Update the canonical file; cite IDs (REQ-, BR-, ADR-, TC-) across documents.
- Create directories/files on first use; do not duplicate content into chat-only summaries.
- Never place secrets, `.env.local` values, database URLs, keys, or tokens in any artifact, log, test, or chat output.

## 4. Approval model — standing delegation (D-011, 2026-11-19)

The product owner has delegated implementation and phase-gate approval authority to the release-manager for the build program. The pipeline runs autonomously, phase by phase, without per-task human confirmation: interpret → specify → design → implement → test → review → gate → next phase.

Delegated (release-manager may approve and proceed):
- Requirement-register finalisation, specifications, technical designs, API contracts.
- Code changes, schema migrations **with a verified rollback plan**, test execution.
- Phase-gate decisions, provided every universal gate condition (§5) is evidenced.
- Cleanup of verified test data leftovers (exact-ID scoped, transactional, evidence recorded).
- Open questions are resolved with conservative Blueprint-aligned defaults, recorded as decisions in `HANDOVER/06_CONTRADICTIONS_AND_DECISION_REGISTER.md`, and surfaced in gate reports — never silently invented as requirements.

NOT delegated — hard limits (Blueprint §2.2, §8; these remain regardless of autonomy):
- Live payment execution, payout release, or bank/mobile-money debit.
- Live eTIMS submission to KRA (sandbox only until certification + credentials + narrowly scoped automation policy).
- External WhatsApp/SMS/email to real recipients (sandbox/mock only until provider credentials + consent infrastructure + narrowly scoped automation policy).
- Production deployment exposing real users; irreversible actions affecting third parties.
- Secret exposure in any artifact, log, or chat; destructive operations beyond verified test data or rollback-planned schema changes.

AI agents assist; accountable decisions are recorded. Autonomy changes who approves the build, not the integrity rules.

## 5. Phase gates and Definition of Done

Phases (Roadmap v2.0): 0 Platform Foundation · 1 Counter-First POS & Offline Trading · 2 Inventory, Catalogue & Procurement · 3 Wholesale, Credit & Fulfilment · 4 Parts Radar & Compatibility · 5 AI Co-Pilots & Automation · 6 Compliance, Payments & Settlement · 7 Network Marketplace & Trust · 8 Scale, Intelligence & Partner Ecosystem.

A phase cannot be marked complete until ALL of the following are done:
1. Every phase acceptance criterion (roadmap) is met with executed-test evidence.
2. Offline-first acceptance: core workflows survive a network outage and synchronise without duplicates.
3. Ledger-first acceptance: financial and inventory impacts reconcile.
4. Security review passed (tenant isolation, permissions, audit logging, AI guardrails).
5. Notifications, reports, error states, and support procedures operational.
6. Gate decision recorded by the release-manager in `docs/release/PHASE_GATE_TRACKER.md` with evidence links (approval authority delegated per §4 / D-011). External-side-effect limits in §4 still apply at every gate.

Release path: development → staging → internal release → pilot tenants → gradual rollout (tenant-stable cohorts) → general availability → flag retirement. New capabilities deploy behind feature flags, disabled by default.

## 6. Non-negotiable engineering invariants (Blueprint v2.0)

- **Multi-tenancy**: tenant isolation enforced at database (RLS), API, cache, search, file storage, analytics, and AI-context layers. One tenant, one secure boundary.
- **Offline-first**: outbox pattern; client-generated UUIDs, device ID, timestamp, sequence number, idempotency keys; server-side conflict detection and reconciliation queue; stock reservations at point of sale; never rely on Background Sync alone.
- **Immutable ledger**: double-entry, append-only journal entries; corrections by reversing entries only; stock changes only through signed movement records, never quantity overwrites.
- **Access control**: RBAC + attribute-based rules (branch, approval limit, cost visibility, customer ownership, time window); separation of duties; blind-stock network visibility (hide exact quantities, buying costs, customer lists).
- **Audit**: every sensitive action attributable to user, device, role, branch, timestamp, with before/after values where applicable; immutable audit logs.
- **AI guardrails**: agent registry, policy engine, approval queues, immutable decision trail, kill switch; no cross-tenant access, unapproved messaging, posted-ledger mutation, or direct bank debit by any agent.
- **Experience**: core counter workflow under 10 seconds; large touch targets; barcode-first; minimal typing; Kiswahili and English; progressive disclosure.

## 7. Verified current state (as of 2026-11-19 handover)

- Stack: FastAPI + SQLAlchemy async/asyncpg → Supabase PostgreSQL (32 RLS-enabled tables); React/Vite frontend, single-page component, demo data in Overview/POS; no Supabase Auth client/login flow yet; no offline PWA implementation yet.
- TC-01 and TC-02 PARTIAL (structural/isolated tests only), TC-03 PASS (RLS isolation with rollback), TC-04–TC-40 mostly NOT TESTED / NOT IMPLEMENTED. See `HANDOVER/05_TESTING_AND_ACCEPTANCE_LEDGER.md`.
- Migrations 001–003 exist locally as standalone SQL; many earlier live migrations have no local files. No migration framework, no CI, not a Git repository.
- Never mark unexecuted functionality PASS. Verify code and live database evidence independently (read-only metadata queries).