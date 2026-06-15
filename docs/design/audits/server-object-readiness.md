# Server-object readiness audit (PR 0-S)

**Purpose:** gate the operating-object PRs (tasks / assumptions / comments /
cash-events / lp-snapshots) on real backend readiness, so "persistence can be
in-memory" becomes a decision, not a silent default. No code; this doc is the
gate.

**Method:** three parallel read-only audits across the persistence surfaces —
routes (`server/routes/**`), schema + migrations (`shared/schema*`,
`migrations/**`), and workers/queues (`workers/**`, `server/queues/**`,
`server/workers/**`). Verified against `main` on 2026-06-15.

---

## Readiness matrix

| Object          | Server route                             | DB table / schema                 | Migration | Worker / queue            | Verdict             |
| --------------- | ---------------------------------------- | --------------------------------- | --------- | ------------------------- | ------------------- |
| **cash_event**  | YES — `server/routes/cashflow.ts` (CRUD) | YES — `cashFlowEvents`            | YES       | YES — capital-call worker | **HAS_PERSISTENCE** |
| **lp_snapshot** | YES — `server/routes/shares.ts`          | YES — `shares` + `shareSnapshots` | YES       | YES — report-generation   | **HAS_PERSISTENCE** |
| **task**        | NONE                                     | NONE                              | NONE      | NONE                      | **NONE**            |
| **assumption**  | NONE                                     | NONE                              | NONE      | NONE                      | **NONE**            |
| **comment**     | NONE                                     | NONE                              | NONE      | NONE                      | **NONE**            |

---

## Per-object detail

### cash_event — HAS_PERSISTENCE

- **Route:** `server/routes/cashflow.ts` — full CRUD:
  `GET/POST/PUT/DELETE /api/cashflow/:fundId/transactions` (L109/191/229/279),
  `GET/POST .../capital-calls` (L321/360), `.../cash-position` (L509),
  `.../recurring-expenses` (L595/644). LP-scoped:
  `server/routes/lp-capital-calls.ts`, `server/routes/lp-distributions.ts`.
- **Schema:** `shared/schema/lp-reporting-evidence.ts:106` table
  `cashFlowEvents`; adjacent `capitalActivities`, `lpCapitalCalls`,
  `lpDistributions`, `fundDistributions`.
- **Migration:** `server/migrations/20260508_lp_reporting_foundation_v1.up.sql`
  (`cash_flow_events`).
- **Worker:** `server/workers/capital-call-status-worker.ts:105` (status
  transitions, payments, notifications).

### lp_snapshot — HAS_PERSISTENCE

- **Route:** `server/routes/shares.ts` — `POST /api/shares` (L397) **creates a
  share link AND an immutable snapshot**; `GET /api/shares` (L450), `PATCH`
  (L481), `DELETE` (L570), `GET .../analytics` (L620); public read
  `GET /api/public/shares/:id` (L664) + `POST .../verify` (L689). Mounted at
  `/api/shares` + `/api/public/shares` (`server/routes.ts:139-140`).
- **Schema:** `shared/schema/shares.ts:85` table `shareSnapshots` (+ `shares`);
  separate LP-reporting `lpPerformanceSnapshots`
  (`shared/schema-lp-reporting.ts:217`).
- **Migration:** `migrations/001_lp_reporting_schema.sql`
  (`lp_performance_snapshots`); shares tables under `shared/schema/shares.ts`.
- **Worker:** `server/queues/report-generation-queue.ts:272` queue
  `lp-report-generation` (PDF/XLSX/CSV; writes `lpReports`).
- **Note:** the immutable-snapshot-on-share model the plan wanted **already
  exists server-side**. PR 10 is mostly UI (explicit snapshot + preview before
  share), not a new backend.

### task — NONE

- No route, table, or worker. Adjacent only: `activities` table
  (`shared/schema.ts:392`) + `server/routes/activities.ts:20`, and
  `pipelineActivities`. None carry task status/owner/dueDate semantics.

### assumption — NONE

- No route, table, or worker. Adjacent: `scenarioCases` +
  `server/routes/scenario-analysis.ts` (`/api/scenarios`), and JSONB blobs in
  `fundStrategyModels` (`shared/schema.ts:1483`) /
  `reserveAllocationStrategies`. No typed assumption table or versioning.

### comment — NONE

- No route, table, or worker. Adjacent: `auditLog` (`shared/schema.ts:747`),
  `lpAuditLog`, and the `lpNotifications` infrastructure (notifications are
  created, but there is no comment/thread/mention model).

---

## Gate

**A PR may build an operating object end-to-end only if this audit marks it
`HAS_PERSISTENCE`.** Anything `NONE` stays a typed contract in `shared/` with no
production UI until its backend (route + table + migration, and a worker where
async) lands in a prior PR.

- Buildable now: **cash_event**, **lp_snapshot**.
- Backend-first (NONE): **task**, **assumption**, **comment** — each needs a
  schema + migration + route PR before any UI.

---

## Consequence for the object-PR sequence (corrects the optimized plan)

The optimized plan's PR 9 recommended building **Task** first "end-to-end." This
audit proves that is the **wrong** first object: Task has no route, table, or
worker, so it would be in-memory/fake — exactly the over-build PR 0-S exists to
prevent. Revised:

1. **PR 9 → lp_snapshot** (was Task). Fully backed (`shares`/`shareSnapshots` +
   report-generation). This _is_ the plan's PR 10 (snapshot-before-share) and is
   buildable now — likely UI-only since the immutable snapshot already exists
   server-side. Promote it to the first object PR.
2. **PR 9b (optional) → cash_event** operating-object surface (cashflow routes +
   `cashFlowEvents` + capital-call worker already exist).
3. **task / assumption / comment** — defer. If wanted, each needs a dedicated
   backend PR (Drizzle table + `npm run db:push`/migration + route) _before_ any
   `shared/operating-objects.ts` UI. Ship them as typed contracts only until
   then.

`shared/operating-objects.ts` (the plan's zod contracts) should therefore land
incrementally: the `lp_snapshot` and `cash_event` schemas can bind to real
tables now; `task`/`assumption`/`comment` schemas remain contract-only.
