---
status: ACTIVE
audience: agents
last_updated: 2026-06-07
owner: 'Platform Team'
review_cadence: P90D
categories: [planning, analytics, moic]
keywords: [moic, follow-on-ranking, reserve-analytics, fund-scoped]
---

# M6: Reserve/MOIC Analytics and Follow-on Ranking

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface fund-scoped follow-on rankings by wiring the existing
`MOICCalculator.rankByReservesMOIC` to a new authenticated endpoint, then adding
a rankings section to `moic-analysis.tsx`.

**Architecture:** New service queries `portfoliocompanies` via Drizzle, maps
rows through the existing `dbToMOICInvestment` adapter (re-exported from
`server/routes/moic.ts`), calls `MOICCalculator.rankByReservesMOIC`, and returns
a Zod-contracted response. `GET /api/funds/:fundId/moic/rankings` guards with
`requireAuth` + `requireFundAccess`. The client page reads fundId from a
`?fundId=` query param via TanStack Query.

**Tech Stack:** TypeScript, Express, Zod, Drizzle ORM, `MOICCalculator`
(existing), React 18, TanStack Query, Vitest, React Testing Library.

---

## Inventory

- `shared/core/moic/MOICCalculator.ts` —
  `rankByReservesMOIC(investments: Investment[])` returns
  `Array<{ investment: Investment; reservesMOIC: MOICResult; rank: number }>`.
  `MOICResult` has `value: number | null`, `description`, `formula`, `inputs`.
  `Investment.id` is `string`.
- `server/routes/moic.ts` — exports `dbToMOICInvestment()` adapter that maps
  `portfoliocompanies` join row → `Investment`. Mounts at `/api/moic` via
  `routes.ts:84`.
- `shared/schema/portfolio.ts` — `portfolioCompanies` table has `id`, `fundId`,
  `name`, `investmentAmount`, `currentValuation`, `investmentDate`,
  `plannedReservesCents`, `exitMoicBps`.
- `server/routes.ts:84` — dynamic `mountDefaultRoutes` pattern for route files.
- `server/app.ts` — static import pattern; fund routes at line 213.
- `client/src/pages/moic-analysis.tsx` — unrouted page with hardcoded data;
  navigation entry exists in `client/src/config/navigation.ts`.
- `client/src/hooks/use-moic.ts` — existing mutation hooks; add a `useQuery`
  hook here.
- `client/src/app/app-routes.tsx` — add `/moic-analysis` to `APP_ROUTES`.

## File Structure

- Create: `shared/contracts/fund-moic-v1.contract.ts`
- Create: `server/services/fund-moic-ranking-service.ts`
- Create: `server/routes/fund-moic.ts`
- Modify: `server/routes.ts` — add dynamic mount
- Modify: `server/app.ts` — add static import + mount
- Modify: `client/src/hooks/use-moic.ts` — add `useFundMoicRankings` query hook
- Modify: `client/src/pages/moic-analysis.tsx` — add follow-on rankings section
- Modify: `client/src/app/app-routes.tsx` — add route entry
- Create: `tests/unit/routes/fund-moic-route-contract.test.ts`
- Create: `tests/unit/services/fund-moic-ranking-service.test.ts`
- Create: `tests/unit/pages/moic-analysis.test.tsx`

---

### Task 1: Contract Schema and Route Guard Tests (TDD RED)

**Files:**

- Create: `shared/contracts/fund-moic-v1.contract.ts`
- Create: `tests/unit/routes/fund-moic-route-contract.test.ts`

- [x] **Step 1: Write the response contract**
- [x] **Step 2: Write route source-level guard test**
- [x] **Step 3: Run RED**

---

### Task 2: Fund Rankings Service

**Files:**

- Create: `server/services/fund-moic-ranking-service.ts`
- Create: `tests/unit/services/fund-moic-ranking-service.test.ts`

- [x] **Step 1: Write failing service tests**
- [x] **Step 2: Run RED**
- [x] **Step 3: Implement service**
- [x] **Step 4: Run GREEN**

---

### Task 3: Route and Mounts

**Files:**

- Create: `server/routes/fund-moic.ts`
- Modify: `server/routes.ts`
- Modify: `server/app.ts`

- [x] **Step 1: Implement route**
- [x] **Step 2: Mount in routes.ts and app.ts**
- [x] **Step 3: Run route contract test GREEN**

---

### Task 4: Client Hook and Page Wiring

**Files:**

- Modify: `client/src/hooks/use-moic.ts`
- Modify: `client/src/pages/moic-analysis.tsx`
- Modify: `client/src/app/app-routes.tsx`
- Create: `tests/unit/pages/moic-analysis.test.tsx`

- [ ] **Step 1: Add `useFundMoicRankings` query hook**
- [ ] **Step 2: Write failing page test**
- [ ] **Step 3: Run RED**
- [ ] **Step 4: Add rankings section to moic-analysis.tsx + add to APP_ROUTES**
- [ ] **Step 5: Run GREEN**

---

### Task 5: Verification and PR

- [ ] **Step 1: Full focused suite**
- [ ] **Step 2: Type check and lint**
- [ ] **Step 3: Commit and push**
