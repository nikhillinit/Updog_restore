# Timeline makeApp Mount (issue #1036 burn-down) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount the `timeline` router on the `makeApp`/Vercel production surface so `/api/timeline` stops 404-ing in prod, and gate the cross-fund `GET /api/timeline/events/latest` behind admin auth — cross-surface-safe.

**Architecture:** `server/routes.ts` (Docker-only) already mounts `./routes/timeline.js` at `/api/timeline`; `server/app.ts` (the live Vercel `makeApp` surface) does not, so the client's timeline calls 404 in prod. We add the mount to `app.ts` and — because mounting newly exposes the all-funds `/events/latest` endpoint on prod — gate that one route with route-local `requireAuth(), requireRole('admin')` (the established `server/routes/fund-moic.ts:185-189` convention; self-applying `requireAuth()` keeps it safe on both surfaces because Docker/`registerRoutes` populates `req.context`, not `req.user`). The route-mount-parity guard's ledger is updated in the same PR.

**Tech Stack:** TypeScript, Express, Zod, Vitest (server project, Node env), supertest, `jsonwebtoken` (HS256 via `signToken`).

**Decision record (from the multi-model debate scrutiny — codex/kimi/agy + claude, 2026-07-07; synthesis: `.claude/artifacts/timeline-makeapp-debate.md`):**
- `useLatestEvents` (`client/src/hooks/useTimelineData.ts:165`) has ZERO call sites, so admin-gating `/events/latest` is security hardening, not feature restoration. EVIDENCE (cite in PR body): `git grep -n 'useLatestEvents'` returns only the definition at `useTimelineData.ts:165` — no importers/callers. The line reference proves existence; the grep proves non-use.
- Option A (route-local `requireAuth()+requireRole('admin')` in the shared router) chosen over Option B (gate only at the app.ts mount) for robustness: defense-in-depth on both surfaces + convention consistency (`server/routes/fund-moic.ts:185-189`).
- Auth-proof honesty: the new makeApp-surface test uses REAL signed tokens (avoiding the REFL-001 frozen-config trap — `server/config/index.ts` snapshots `process.env` at import). But only the **403** (signed non-admin) assertion proves the NEW route-local admin gate. The **401** (no token) assertion only exercises the PRE-EXISTING global `/api` auth boundary (`server/app.ts:187`), which returns 401 whether or not timeline is mounted and independent of the route-local `requireAuth()` — do NOT cite it as proof of the new auth work.
- Coverage boundary: the makeApp-surface test proves MOUNT (400 on bad fundId) + the admin GATE (403) + fund-scoped REACHABILITY (an authenticated `/:fundId` clears auth+scope into the service). It does NOT assert a 200 body — the eager default service (`timeline.ts:334-343`, REFL-037) runs the real DB on the makeApp surface; the functional 200 read is proven in `timeline.contract.test.ts` via `createTimelineRouter(mockService)`.
- Cross-surface: adding route-local `requireAuth()` makes `/events/latest` return 401 on the Docker/registerRoutes surface (which populates `req.context`, not `req.user`). Safe because `useLatestEvents` has zero callers; the four fund-scoped routes are unchanged (they use `enforceProvidedFundScope`, which re-verifies the bearer token itself and builds `req.user.fundIds` from claims — `provided-fund-scope.ts:42-57`).
- Middleware order: `requireAuth()+requireRole('admin')` run BEFORE `timelineReadLimiter` so an authz decision wins over a 429 and rate-limit state is not leaked to unauthorized callers. This is safe: tokens are HS256 (cheap synchronous HMAC — `jwt.ts:72-74,303`), and makeApp already throttles unauthenticated floods at the global 60/min limiter (`app.ts:141`) BEFORE `/api` auth runs. (The cited `fund-moic.ts:185-189` convention has no route-local limiter, so it does not by itself establish auth-before-limiter ordering.)

---

## Preconditions

- [ ] **Step 0: Re-verify baseline before branching**

Run:
```bash
git fetch
git status --short
git rev-parse --short HEAD
```
Expected: clean tree; `HEAD` at `458094e9` (the PR #1038 route-mount-parity guard squash) or later. Then:
```bash
git switch -c feat/1036-burndown-timeline-makeapp-mount
```

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `server/routes/timeline.ts` | Timeline router; add admin gate to `/events/latest` only | Modify |
| `server/app.ts` | makeApp prod surface; import + mount timeline | Modify |
| `tests/unit/routes/timeline.contract.test.ts` | Router-factory contract; add `/events/latest` authz + service-call coverage | Modify |
| `tests/unit/api/time-travel-api.test.ts` | Response-format tests; inject admin so `/events/latest` format tests still pass | Modify |
| `tests/unit/routes/timeline-makeapp-surface.contract.test.ts` | makeApp mount reachability (400) + fund-scoped reachability + admin-gate (403); the 401 only exercises the pre-existing global `/api` boundary | Create |
| `tests/unit/server/route-mount-parity.test.ts` | Parity ledger; drop timeline exemption, 12→11, retarget canary | Modify |
| `tests/unit/mount-parity-migrations.test.ts` | D6 inventory; classify `timelineRouter` | Modify |

Commit boundaries (each leaves the suite green):
- **Commit 1** = Task 1 (router gate + both existing test files updated atomically).
- **Commit 2** = Task 2 (makeApp mount + surface test + parity ledger, atomic).
- Task 3 = negative controls + verification + PR.

---

## Task 1: Admin-gate `/events/latest` in the shared router

**Files:**
- Modify: `server/routes/timeline.ts` (import near line 22; route at lines 302-323)
- Test: `tests/unit/routes/timeline.contract.test.ts`
- Test: `tests/unit/api/time-travel-api.test.ts:38-53,455-540`

- [ ] **Step 1: Add the failing authz contract tests (factory + mocked auth)**

In `tests/unit/routes/timeline.contract.test.ts`, add a hoisted auth state and a `jwt` mock at the top of the mock block (immediately after the existing `vi.mock('../../../server/lib/auth/provided-fund-scope', ...)` at line 16), so `createTimelineRouter` picks up mocked `requireAuth`/`requireRole`:

```typescript
const authState = vi.hoisted(() => ({
  user: { id: '1', role: 'admin', roles: ['admin'], fundIds: [] } as
    | { id: string; role: string; roles: string[]; fundIds: number[] }
    | null,
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, _res: Response, next: () => void) => {
    (req as unknown as { user: unknown }).user = authState.user;
    next();
  },
  requireRole:
    (role: string) => (req: Request, res: Response, next: () => void) => {
      const user = (req as unknown as { user?: { role?: string } }).user;
      if (!user || user.role !== role) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
    },
}));
```

Reset `authState.user` to admin in the existing `beforeEach` (after line 79 `service = makeService();`):

```typescript
    authState.user = { id: '1', role: 'admin', roles: ['admin'], fundIds: [] };
```

Then append two tests inside the `describe('timeline route contracts', ...)` block (after line 149):

```typescript
  it('GET /events/latest rejects a non-admin before reading events', async () => {
    authState.user = { id: '9', role: 'user', roles: ['user'], fundIds: [] };
    const res = await request(makeApp(service)).get('/api/timeline/events/latest');
    expect(res.status).toBe(403);
    expect(service.getLatestEvents).not.toHaveBeenCalled();
  });

  it('GET /events/latest returns events for an admin', async () => {
    const res = await request(makeApp(service)).get('/api/timeline/events/latest?limit=5');
    expect(res.status).toBe(200);
    expect(service.getLatestEvents).toHaveBeenCalledWith(5, undefined);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/timeline.contract.test.ts
```
Expected: FAIL — the non-admin test gets `200` (no gate yet) and `getLatestEvents` is called; the mocked `jwt` module is unused by the router.

- [ ] **Step 3: Add the admin gate to the router**

In `server/routes/timeline.ts`, add the import immediately after line 22 (`import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';`). Use NO `.js` extension to match this file's import style (every relative import in `timeline.ts` is extensionless) so the test's `vi.mock('../../../server/lib/auth/jwt')` resolves to the same module:

```typescript
import { requireAuth, requireRole } from '../lib/auth/jwt';
```

Change the `/events/latest` route (currently lines 302-311) so the guard runs BEFORE the rate limiter and validation (authz boundary must win over a malformed 400):

```typescript
  router.get(
    '/events/latest',
    requireAuth(),
    requireRole('admin'),
    timelineReadLimiter,
    validateRequest({
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        eventTypes: z.array(z.string()).optional(),
      }),
    }),
    asyncHandler(async (req, res) => {
```

Leave the handler body and the four fund-scoped routes unchanged.

- [ ] **Step 4: Run the contract tests to verify they pass**

Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/timeline.contract.test.ts
```
Expected: PASS — 7 tests (5 pre-existing fund-scope + 2 new).

- [ ] **Step 5: Repair the response-format tests (they now hit the gate)**

`tests/unit/api/time-travel-api.test.ts` mounts the default router on a bare app with no auth; its 3 `/events/latest` tests (455-540) will now `401`. Add a `jwt` mock so the injected user is admin — this file tests response FORMAT, not auth (the real auth boundary is proven in Task 2). Insert after the existing `vi.mock('../../../server/db', ...)` block (ends line 94):

```typescript
// Inject an admin user so the /events/latest admin gate passes; this file
// verifies response format only. The real auth boundary (401/403) is proven in
// tests/unit/routes/timeline-makeapp-surface.contract.test.ts with real tokens.
vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: any, _res: any, next: any) => {
    req.user = { id: '1', role: 'admin', roles: ['admin'], fundIds: [] };
    next();
  },
  requireRole: (role: string) => (req: any, res: any, next: any) =>
    req.user?.role === role ? next() : res.sendStatus(403),
}));
```

- [ ] **Step 6: Run the format tests to verify they pass**

Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/api/time-travel-api.test.ts
```
Expected: PASS — the 3 `/events/latest` tests return `200` again; fund-scoped tests unaffected (those routes have no `requireAuth`).

- [ ] **Step 7: Commit**

```bash
git add server/routes/timeline.ts tests/unit/routes/timeline.contract.test.ts tests/unit/api/time-travel-api.test.ts
git commit -m "feat(timeline): admin-gate /events/latest before makeApp mount (#1036)"
```

---

## Task 2: Mount timeline on makeApp + surface proof + parity ledger

**Files:**
- Create: `tests/unit/routes/timeline-makeapp-surface.contract.test.ts`
- Modify: `server/app.ts` (import near line 20; mount near line 234)
- Modify: `tests/unit/server/route-mount-parity.test.ts:197-200,230,245-250`
- Modify: `tests/unit/mount-parity-migrations.test.ts` (MAKEAPP_ROUTE_INVENTORY, lines 40-113)

- [ ] **Step 1: Create the makeApp surface contract test (negative control first)**

Create `tests/unit/routes/timeline-makeapp-surface.contract.test.ts`. Copy the env/auth harness verbatim from `tests/unit/routes/dashboard-summary-makeapp-surface.contract.test.ts` (lines 1-94: `ENV_KEYS`, `saveEnv`, `restoreEnv`, `configureTestAuthEnv`, `makeAppWithTestAuth`, `authorizationHeader`) — these are local functions, not exports, so copy them. Add a non-admin variant of the header. Then the body:

```typescript
async function nonAdminAuthorizationHeader() {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '9',
    email: 'route-surface-nonadmin@example.com',
    role: 'user',
    fundIds: [1],
  })}`;
}

describe('timeline makeApp surface', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('mounts the timeline router on the production makeApp API surface', async () => {
    // Non-numeric fundId reaches the mounted /:fundId handler's own guard:
    // parseTimelineFundId rejects it -> 400 { error: 'Invalid fund ID' } before
    // any DB access. When NOT mounted, the same request falls through to the
    // makeApp catch-all 404 { error: 'not_found' } (the mount-parity defect).
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/timeline/abc')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid fund ID' });
  }, 30_000);

  // NOTE: this 401 comes from the PRE-EXISTING global /api auth boundary
  // (app.ts:187), NOT from the route-local requireAuth() this PR adds -- it would
  // 401 even if timeline were unmounted. It is a boundary sanity check, not proof
  // of the new admin gate. The 403 test below is the proof of the new gate.
  it('401s an unauthenticated /events/latest at the pre-existing global /api boundary', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).get('/api/timeline/events/latest');
    expect(res.status).toBe(401);
  }, 30_000);

  it('rejects a signed non-admin /events/latest with 403 (proves the new route-local admin gate)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/timeline/events/latest')
      .set('Authorization', await nonAdminAuthorizationHeader());
    expect(res.status).toBe(403);
  }, 30_000);

  it('lets an authenticated fund-scoped GET /api/timeline/:fundId clear auth+scope into the service', async () => {
    // The mount exists to fix the CLIENT's fund-scoped timeline reads (useTimelineData),
    // so prove one actually reaches the service on makeApp. A signed token scoped to fund 1
    // (role is irrelevant here -- the /:fundId routes use enforceProvidedFundScope, not
    // requireRole). Assert the status is NOT 401/403/404: 404 => not mounted, 401 => global
    // auth rejected the token, 403 => fund-scope denied. Any other status (200, or a DB-driven
    // 500 from the eager default service / REFL-037) proves the request cleared the mount, the
    // /api auth boundary, AND the fund-scope gate. We deliberately do NOT assert 200:
    // timeline.ts:334-343 injects the real DB on this surface (REFL-037); the 200 body is
    // covered by timeline.contract.test.ts via createTimelineRouter(mockService).
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/timeline/1')
      .set('Authorization', await nonAdminAuthorizationHeader());

    expect([401, 403, 404]).not.toContain(res.status);
  }, 30_000);
});
```

Prepend the same imports the dashboard file uses:
```typescript
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Run the surface test to verify the mount assertion fails (negative control #1)**

Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/timeline-makeapp-surface.contract.test.ts
```
Expected: FAIL — the mount test and the fund-scoped reachability test both get `404 { error: 'not_found' }` (timeline not mounted on makeApp yet), so `[401,403,404]` contains the status and the reachability assertion fails; the 403 admin-gate test also fails (404, not 403). The 401 test passes vacuously (the global `/api` auth boundary returns 401 whether or not timeline is mounted) — which is exactly why it is not proof of the new gate.

- [ ] **Step 3: Import and mount timeline in app.ts**

In `server/app.ts`, add the import immediately after line 20 (`import fundMoicRouter from './routes/fund-moic.js';`):

```typescript
import timelineRouter from './routes/timeline.js';
```

Add the mount immediately after line 234 (`app.use('/api', fundMoicRouter);`), matching the Docker mount path `/api/timeline` and placed after the global `/api` auth (line 187):

```typescript
  // Timeline / time-travel API (#1036 burn-down). Mounted here so the
  // Vercel/makeApp surface matches the Docker routes.ts mount; without it the
  // client's /api/timeline calls 404 in prod. /events/latest self-gates with
  // requireAuth()+requireRole('admin') inside the router (cross-surface safe).
  app.use('/api/timeline', timelineRouter);
```

- [ ] **Step 4: Run the surface test to verify it passes**

Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/timeline-makeapp-surface.contract.test.ts
```
Expected: PASS — 400 reachability, 401 no-token, 403 non-admin.

- [ ] **Step 5: Run the parity guard to observe the expected failures**

Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/server/route-mount-parity.test.ts tests/unit/mount-parity-migrations.test.ts
```
Expected: FAIL — `route-mount-parity`: the canary "timeline is Docker-only today" now fails (`makeApp.has('./routes/timeline.js')` is `true`) and the stale-exemption check flags `./routes/timeline.js`; `mount-parity-migrations`: the D6 inventory guard fails on the unclassified `timelineRouter`.

- [ ] **Step 6: Update the parity ledger**

In `tests/unit/server/route-mount-parity.test.ts`:

(a) DELETE the timeline exemption block (lines 197-200):
```typescript
  './routes/timeline.js': {
    kind: 'gap-pending',
    reason: 'client useTimelineData hits /api/timeline heavily -- likely real 404',
  },
```

(b) Change the gap-pending pin (line 230) from `12` to `11`:
```typescript
const GAP_PENDING_COUNT = 11;
```

(c) Retarget the Docker-only canary (lines 245-250) from `timeline` to `shares`:
```typescript
  it('a known gap-pending router (shares) is Docker-only today', () => {
    const docker = extractRouteModulePaths(routesSrc);
    const makeApp = extractRouteModulePaths(appSrc);
    expect(docker.has('./routes/shares.js')).toBe(true);
    expect(makeApp.has('./routes/shares.js')).toBe(false);
  });
```

- [ ] **Step 7: Classify the router in the migrations inventory**

In `tests/unit/mount-parity-migrations.test.ts`, add to `MAKEAPP_ROUTE_INVENTORY` (alongside the other `other-table` entries, e.g. after line 86 `fundMetricsRouter: { kind: 'other-table' },`):

```typescript
  // TimeTravelAnalyticsService reads fund_events, fund_snapshots, funds; also
  // funds in POST /:fundId/snapshot. None are in C1_MOUNTED_TABLES.
  timelineRouter: { kind: 'other-table' },
```

- [ ] **Step 8: Run the parity guard to verify it passes**

Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/server/route-mount-parity.test.ts tests/unit/mount-parity-migrations.test.ts
```
Expected: PASS — all parity assertions green; gap-pending count is 11.

- [ ] **Step 9: Commit**

```bash
git add server/app.ts tests/unit/routes/timeline-makeapp-surface.contract.test.ts tests/unit/server/route-mount-parity.test.ts tests/unit/mount-parity-migrations.test.ts
git commit -m "feat(routes): mount timeline router on makeApp; burn down gap-pending 12->11 (#1036)"
```

---

## Task 3: Negative controls, full verification, and PR

**Files:** none modified (verification only)

- [ ] **Step 1: Negative control — remove only the mount (keep the import)**

Temporarily comment out `app.use('/api/timeline', timelineRouter);` in `server/app.ts` (use Edit, not `git checkout`). Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/timeline-makeapp-surface.contract.test.ts
```
Expected: FAIL — the mount test returns makeApp `404 { error: 'not_found' }`. Restore the line and re-run; expected PASS.

- [ ] **Step 2: Negative control — remove import + mount after the exemption is gone**

Temporarily remove BOTH the `import timelineRouter ...` and the `app.use('/api/timeline', ...)` lines (Edit). Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/server/route-mount-parity.test.ts
```
Expected: FAIL — `findUnexemptedDockerOnly` flags `./routes/timeline.js` (Docker-only, no exemption). Restore both lines and re-run; expected PASS.

- [ ] **Step 3: Typecheck and lint**

Run:
```powershell
npm run check
npm run lint
```
Expected: both PASS with no new errors.

- [ ] **Step 4: Run the full affected server suite once**

Run:
```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/timeline.contract.test.ts tests/unit/api/time-travel-api.test.ts tests/unit/routes/timeline-makeapp-surface.contract.test.ts tests/unit/server/route-mount-parity.test.ts tests/unit/mount-parity-migrations.test.ts
```
Expected: PASS — all five files green.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/1036-burndown-timeline-makeapp-mount
gh pr create --base main --title "feat(routes): mount timeline router on makeApp (#1036 burn-down)" --body "<see PR body requirements below>"
```

PR body MUST include: route inventory (5 routes; `/events/latest` is the only all-funds route); the auth decision (route-local `requireAuth()+requireRole('admin')` per the `fund-moic.ts:185-189` convention; cross-surface-safe; `git grep -n 'useLatestEvents'` shows only the `useTimelineData.ts:165` definition => zero callers => hardening); the auth-proof labeling (the **403** proves the new gate; the **401** only exercises the pre-existing global `/api` boundary at `app.ts:187` and is NOT cited as proof of the new work; the fund-scoped reachability test proves an authenticated `/:fundId` clears auth+scope; no makeApp 200 body assertion, by REFL-037); the Docker-surface behavior note (`/events/latest` now 401s on the registerRoutes surface — safe, zero callers); the middleware-order note (auth-before-limiter is intentional and safe — HS256 HMAC + global 60/min limiter at `app.ts:141`); local verification output; BOTH negative-control red proofs (Step 1 and Step 2); diff scope; and the gap-pending 12->11 note. Non-goals: no auto-merge, no unrelated cleanup, no docs/session artifacts, no dependency changes.

- [ ] **Step 6: Publication proof (do NOT arm auto-merge)**

Run:
```bash
gh pr view <new-pr> --json statusCheckRollup,headRefOid,baseRefOid,mergeStateStatus,reviewDecision,state
```
Because this PR touches only `server/**` + `tests/**` (no `migrations/**` or `shared/schema/**`), the new integration/contract tests are NOT auto-run on the PR — dispatch a full run and cite it:
```bash
gh workflow run ci-unified.yml --ref feat/1036-burndown-timeline-makeapp-mount -f run_full_suite=true
```
R6 CI proof must show: no `test:quick` fallback header/path, the server glob executed, `--bail=1`, unit-fast green, and a live `statusCheckRollup`. Do not claim dot-reporter logs contain specific test filenames.

---

## Notes / risks (not tasks)

- **REFL-010 (trust proxy):** timeline's `timelineReadLimiter`/`timelineWriteLimiter` key on `req.ip`. This is pre-existing infra shared with `flagsRouter` etc. already on makeApp; no change needed here, but if prod rate-limiting misbehaves post-deploy, verify `app.set('trust proxy', ...)` on the makeApp surface.
- **REFL-037 (eager service):** `timeline.ts` instantiates its default service at import (lines 334-343). That is why the "admin 200 + calls `getLatestEvents`" assertion lives in `timeline.contract.test.ts` via `createTimelineRouter(mockService)`, and the makeApp-surface test asserts only reachability + the DB-free auth boundary. Do NOT try to assert a service call through `makeApp`. (The eager service constructor only stores `db`/`cache` refs — `time-travel-analytics.ts:123-128` — so the import itself is cold-start-safe; DB access happens when a handler runs.)
- **Middleware order (debate finding, adjudicated):** the admin guard runs BEFORE `timelineReadLimiter` on `/events/latest`. Intentional (authz wins over a 429; no rate-limit-state leak to unauthorized callers) and safe — HS256 tokens verify via a cheap synchronous HMAC (`server/lib/auth/jwt.ts:72-74,303`), and makeApp already throttles unauthenticated floods at the global 60/min limiter (`server/app.ts:141`) before `/api` auth runs. The `agy` lane argued for limiter-first on an RS256/JWKS CPU-exhaustion premise; that premise does not hold for this HS256 codebase (the RS256 path is conditional, key-cached, and self-caps at `jwksRequestsPerMinute: 10`), so the order is kept. Full scrutiny: `.claude/artifacts/timeline-makeapp-debate.md`.
- **Docs governance:** this plan file lives under `docs/superpowers/plans/` (tracked). If committed, run `npm run docs:routing:generate` after `git add` so "Validate Discovery Routing" does not fail on a new `docs/**/*.md`. It is not required for the code change.
- **`any` in tests:** the `jwt` mock in `time-travel-api.test.ts` uses `any` to match that file's existing quarantined mock style; `timeline.contract.test.ts` uses typed `Request`/`Response` to match its style.
