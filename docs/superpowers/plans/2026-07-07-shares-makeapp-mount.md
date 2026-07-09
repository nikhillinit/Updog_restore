# Shares makeApp Mount (issue #1036 burn-down) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount BOTH `shares` routers on the `makeApp`/Vercel production surface so `/api/shares` (management) and `/api/public/shares` (anonymous public snapshot) stop 404-ing in prod — with the public boundary staying anonymous by construction.

**Architecture:** `server/routes.ts` (Docker-only) already mounts BOTH `./routes/shares.js` routers (`app.use('/api/shares', sharesRouter)` + `app.use('/api/public/shares', publicSharesRouter)`, routes.ts:145-148); `server/app.ts` (the live Vercel `makeApp` surface) mounts neither, so the client's share calls 404 in prod (real callers: `client/src/pages/dashboard-modern.tsx:161` mgmt; `client/src/pages/shared-dashboard.tsx:88,115` public). We add a single import + both mounts to `app.ts`. NO router modification and NO new middleware gate is needed:
- **Management** (`sharesRouter`) self-gates per-handler via `requireAuthenticatedUser` (shares.ts:146, reads `req.context?.userId ?? req.user?.id`) + `canManageFund` (shares.ts:155, checks `req.context` OR `req.user.fundIds`). On makeApp the global `/api` auth (app.ts:188-194) 401s unauthenticated callers first; `requireAuth` populates `req.user` (`userFromClaims`, jwt.ts:160-180: `id=sub`, `fundIds` from claims), so the handler auth clears. Cross-surface-safe.
- **Public** (`publicSharesRouter`) MUST stay anonymous. The global `/api` auth middleware calls `isPublicApiPath(req.method, req.path)` (app.ts:189) and, when true, bypasses `requireAuth`. `isPublicApiPath` (public-api-boundary.ts:19-36) already whitelists exactly `GET /public/shares/:id` (line 27) and `POST /public/shares/:id/verify` (line 31) on the `/api`-stripped path — so mounting at `/api/public/shares` lets those two routes bypass auth. This bypass is the load-bearing risk and is PROVEN in the surface test, not assumed.

The route-mount-parity guard's ledger and the D6 migrations inventory are updated in the same PR.

**Tech Stack:** TypeScript, Express, Zod, Vitest (server project, Node env), supertest, `jsonwebtoken` (HS256 via `signToken`).

**Decision record (from the multi-model debate scrutiny — codex/kimi/agy + claude, 2026-07-07; synthesis: `.claude/artifacts/shares-makeapp-debate.md`):**
- **[Crux] The naive public assertion `GET /api/public/shares/<id> -> NOT 401` is VACUOUS.** Trace unmounted: no token -> `isPublicApiPath` true -> auth bypass (app.ts:189) -> falls through every `/api` router -> makeApp catch-all `404 { error: 'not_found' }` (app.ts:283). 404 != 401, so "NOT 401" is GREEN even when the public router is NEVER mounted. All four debate lanes converged on this. It MUST be replaced.
- **The public proof is `POST /api/public/shares/<id>/verify` `.send({})` -> `400 { error: 'Validation error' }`.** `.send({})` sets Content-Type application/json (clears the 415 guard, app.ts:119-130) -> bypass (boundary.ts:31) -> `VerifyPasskeySchema.parse({})` throws a ZodError BEFORE `findShare` (shares.ts:706 precedes 707) -> `400 { error: 'Validation error' }` (shares.ts:721-724). Deterministic and DB-INDEPENDENT. `expect(status).toBe(400)` discriminates BOTH failure modes: unmounted -> 404 (400!=404); broken `isPublicApiPath` -> 401 (400!=401). Assert the BODY (`error: 'Validation error'`), not only the status, so a 400 from another path cannot pass.
- **Keep the GET assertion too** (agy): (d) proves only the POST route exists; the GET route could be missing from the router. (c) `GET /api/public/shares/<id>` no token -> `status !== 401` (bypass worked) AND `body` not `{ error: 'not_found' }` (mount worked). Robust to BOTH mounted outcomes: 404 `{ error: 'Share not found' }` (shares.ts:683) OR a DB-stub 500 (REFL-037 — `findShare` hits the real `db` under ALLOW_MEMORY_STORAGE). Do NOT hard-pin 404.
- **Mgmt reachability (a):** `GET /api/shares?fundId=1` with a fund-1 token (role:user, fundIds:[1]) -> `expect([401,404]).not.toContain(status)`. Mounted: `requireAuthenticatedUser` passes (id from sub) + `canManageFund` true (fundIds.includes(1), shares.ts:160) -> 200 or DB-stub 500; unmounted -> catch-all 404. Discriminates the mgmt mount.
- **Mgmt auth boundary (b):** `GET /api/shares` no token -> 401. This is the PRE-EXISTING global `/api` boundary (app.ts:188-194; `res.sendStatus(401)` jwt.ts:230) — it returns 401 whether or not shares is mounted. LABEL it as a boundary sanity check, NOT proof of the mount (mirrors timeline's 401-honesty note).
- **No new cross-fund exposure** (unlike timeline's `/events/latest`): management is fund-scoped via `canManageFund`; public is snapshot-only with its own rate limiters (shares.ts:63-87) + passkey. The mount is additive; no gate to add.
- **Parity is by MODULE PATH:** the route-mount-parity guard scans `./routes/shares.js` (one import line satisfies it regardless of the two named exports). The D6 inventory scans IMPORT IDENTIFIERS (`parseImportClauseIdentifiers`, migrations.test.ts:156-182), so BOTH `sharesRouter` and `publicSharesRouter` need entries. The import MUST be single-line (D6 regex has no `s` flag, migrations.test.ts:142).

---

## Preconditions

- [ ] **Step 0: Baseline re-verified (DONE this session)**

Clean tree; `HEAD` at `45d8269b` (timeline #1039 squash) or later; branch `feat/1036-burndown-shares-makeapp-mount` created. `GAP_PENDING_COUNT = 11`; canary = `shares` (still Docker-only). All shares touchpoints re-verified against current main.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `server/app.ts` | makeApp prod surface; import + mount BOTH shares routers | Modify |
| `tests/unit/routes/shares-makeapp-surface.contract.test.ts` | makeApp mount proof: mgmt reachability (a) + boundary (b) + public GET bypass (c) + public verify 400 (d) | Create |
| `tests/unit/server/route-mount-parity.test.ts` | Parity ledger; drop shares exemption, 11->10, retarget canary to capital-allocation | Modify |
| `tests/unit/mount-parity-migrations.test.ts` | D6 inventory; classify `sharesRouter` + `publicSharesRouter` as `other-table` | Modify |

Commit boundaries:
- **Commit 1** = Task 1 (surface test + both mounts + parity ledger + D6 inventory, atomic; suite green).
- Task 2 = negative controls + verification + PR (Claude-owned, no code changes).

---

## Task 1: Mount both shares routers on makeApp + surface proof + parity ledger

**Files:**
- Create: `tests/unit/routes/shares-makeapp-surface.contract.test.ts`
- Modify: `server/app.ts` (import after `import timelineRouter from './routes/timeline.js';`; mount after `app.use('/api/timeline', timelineRouter);`)
- Modify: `tests/unit/server/route-mount-parity.test.ts` (exemption block, `GAP_PENDING_COUNT`, canary `it`)
- Modify: `tests/unit/mount-parity-migrations.test.ts` (`MAKEAPP_ROUTE_INVENTORY`)

- [ ] **Step 1: Create the makeApp surface contract test (RED first)**

Create `tests/unit/routes/shares-makeapp-surface.contract.test.ts`. Copy the env/auth harness VERBATIM from `tests/unit/routes/timeline-makeapp-surface.contract.test.ts` lines 1-104 (the imports, `ENV_KEYS`, `saveEnv`, `restoreEnv`, `configureTestAuthEnv`, `makeAppWithTestAuth`, `authorizationHeader`, `nonAdminAuthorizationHeader` — all local functions, copy them). Then replace the `describe(...)` body with:

```typescript
describe('shares makeApp surface', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  // (a) Management mount + reachability. A fund-1 token clears the global /api auth
  // boundary AND the handler's own requireAuthenticatedUser + canManageFund into the
  // service. Mounted -> 200 (empty list) or a DB-stub 500 (REFL-037); never 401/404.
  // When NOT mounted the same request falls to the makeApp catch-all 404 { error:
  // 'not_found' } -> 404 is the mount RED.
  it('mounts the shares management router on the production makeApp API surface', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/shares?fundId=1')
      .set('Authorization', await nonAdminAuthorizationHeader());

    expect([401, 404]).not.toContain(res.status);
  }, 30_000);

  // (b) Management auth boundary. NOTE: this 401 comes from the PRE-EXISTING global
  // /api auth boundary (app.ts:188-194), NOT from the mount -- GET /api/shares returns
  // 401 with no token whether or not shares is mounted. It is a boundary sanity check,
  // not proof of the mount. (a)/(c)/(d) are the mount proofs.
  it('401s an unauthenticated GET /api/shares at the pre-existing global /api boundary', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).get('/api/shares?fundId=1');
    expect(res.status).toBe(401);
  }, 30_000);

  // (c) Public GET mount + anonymous bypass. isPublicApiPath whitelists GET
  // /public/shares/:id (public-api-boundary.ts:27) so the global /api auth bypasses
  // (status !== 401 proves the bypass). Mounted -> the router's own 404 { error:
  // 'Share not found' } (shares.ts:683) or a DB-stub 500 -- NEITHER is the catch-all
  // { error: 'not_found' }. When NOT mounted the bypassed request falls to the catch-all
  // 404 { error: 'not_found' } -> body.error === 'not_found' is the mount RED. Do NOT
  // hard-pin 404: the mounted outcome may be 404 OR 500.
  it('reaches the public shares GET handler anonymously (mount + isPublicApiPath bypass)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).get('/api/public/shares/nonexistent-share-id');

    expect(res.status).not.toBe(401);
    expect(res.body).not.toMatchObject({ error: 'not_found' });
  }, 30_000);

  // (d) PRIMARY public proof. POST .send({}) sets application/json (clears the 415
  // guard at app.ts:119-130). isPublicApiPath whitelists POST /public/shares/:id/verify
  // (public-api-boundary.ts:31) -> auth bypass -> VerifyPasskeySchema.parse({}) throws a
  // ZodError BEFORE findShare (shares.ts:706 precedes 707) -> 400 { error: 'Validation
  // error' } (shares.ts:721-724). Deterministic + DB-INDEPENDENT. expect(400) discriminates
  // BOTH failures: unmounted -> 404 not_found (400!=404); broken isPublicApiPath -> 401
  // (400!=401). The body assertion pins it to the Zod path (a 415 would be status 415
  // with error 'unsupported_media_type').
  it('reaches the public verify handler anonymously and 400s an empty body (load-bearing public proof)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .post('/api/public/shares/nonexistent-share-id/verify')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation error' });
  }, 30_000);
});
```

- [ ] **Step 2: Run the surface test to verify it FAILS (negative control #1 — mount RED)**

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/shares-makeapp-surface.contract.test.ts
```
Expected: FAIL — (a) gets `404 { error: 'not_found' }` (shares not mounted) so `[401,404]` contains it; (c) `body.error === 'not_found'`; (d) gets `404`, not `400`. (b) passes vacuously (global `/api` boundary 401 regardless) — which is exactly why (b) is a boundary check, not mount proof. PASTE the failing output; a missing RED here => BLOCKED.

- [ ] **Step 3: Import and mount BOTH routers in app.ts**

In `server/app.ts`, add the import immediately after `import timelineRouter from './routes/timeline.js';` (keep it SINGLE-LINE — the D6 identifier regex has no `s` flag):

```typescript
import { sharesRouter, publicSharesRouter } from './routes/shares.js';
```

Add both mounts immediately after `app.use('/api/timeline', timelineRouter);`, matching the Docker mount paths and placed AFTER the global `/api` auth boundary (app.ts:188-194) so the public bypass works:

```typescript
  // Shares API (#1036 burn-down). Mounted here so the Vercel/makeApp surface matches
  // the Docker routes.ts mount; without it /api/shares and /api/public/shares 404 in
  // prod. Management self-gates per-handler (requireAuthenticatedUser + canManageFund);
  // the public routes stay anonymous via isPublicApiPath (GET /public/shares/:id and
  // POST /public/shares/:id/verify bypass the global /api auth).
  app.use('/api/shares', sharesRouter);
  app.use('/api/public/shares', publicSharesRouter);
```

- [ ] **Step 4: Run the surface test to verify it PASSES**

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/shares-makeapp-surface.contract.test.ts
```
Expected: PASS — 4 tests. PASTE the green output.

- [ ] **Step 5: Run the parity guards to observe the expected failures**

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/server/route-mount-parity.test.ts tests/unit/mount-parity-migrations.test.ts
```
Expected: FAIL — `route-mount-parity`: the canary "shares is Docker-only today" now fails (`makeApp.has('./routes/shares.js')` is `true`) and the stale-exemption check flags `./routes/shares.js`; `mount-parity-migrations`: the D6 inventory guard fails on the unclassified `sharesRouter` and `publicSharesRouter`. PASTE the output.

- [ ] **Step 6: Update the parity ledger**

In `tests/unit/server/route-mount-parity.test.ts`:

(a) DELETE the shares exemption block:
```typescript
  './routes/shares.js': {
    kind: 'gap-pending',
    reason: 'client dashboard-modern.tsx hits /api/shares',
  },
```

(b) Change the gap-pending pin from `11` to `10`:
```typescript
const GAP_PENDING_COUNT = 10;
```

(c) Retarget the Docker-only canary from `shares` to `capital-allocation` (the `it('a known gap-pending router (shares) is Docker-only today', ...)` block):
```typescript
  it('a known gap-pending router (capital-allocation) is Docker-only today', () => {
    const docker = extractRouteModulePaths(routesSrc);
    const makeApp = extractRouteModulePaths(appSrc);
    expect(docker.has('./routes/capital-allocation.js')).toBe(true);
    expect(makeApp.has('./routes/capital-allocation.js')).toBe(false);
  });
```

- [ ] **Step 7: Classify BOTH routers in the migrations inventory**

In `tests/unit/mount-parity-migrations.test.ts`, add to `MAKEAPP_ROUTE_INVENTORY` (alongside the other `other-table` entries, e.g. after the `timelineRouter: { kind: 'other-table' }` block):

```typescript
  // Shares management + anonymous public snapshot. Reads/writes shares, shareAnalytics,
  // and share snapshots -- none are in C1_MOUNTED_TABLES.
  sharesRouter: { kind: 'other-table' },
  publicSharesRouter: { kind: 'other-table' },
```

- [ ] **Step 8: Run the parity guards to verify they PASS**

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/server/route-mount-parity.test.ts tests/unit/mount-parity-migrations.test.ts
```
Expected: PASS — all parity assertions green; gap-pending count is 10. PASTE the output. DO NOT COMMIT (Claude reviews + commits).

---

## Task 2: Negative controls, full verification, and PR (Claude-owned)

**Files:** none modified (verification only). Reverts via Edit, NEVER `git checkout --` (uncommitted Task 1 work is present).

- [ ] **Step 1: Negative control A — drop only the public mount (keep isPublicApiPath)**

Comment out `app.use('/api/public/shares', publicSharesRouter);` only (Edit). Run the surface test.
Expected: FAIL — (d) returns `404 { error: 'not_found' }` (400!=404) and (c) `body.error === 'not_found'`. Proves the test catches a MISSING public mount. Restore; re-run -> PASS.

- [ ] **Step 2: Negative control B — break the public boundary (keep the mount)**

Temporarily make `isPublicApiPath` NOT match public shares (Edit `server/lib/public-api-boundary.ts` — e.g. change the GET regex to `/^\/public\/shares-BROKEN\/[^/]+$/` and the POST regex likewise). Run the surface test.
Expected: FAIL — (d) returns `401` (400!=401) and (c) `status === 401`. Proves the test catches a BROKEN public boundary (a mount alone is not enough). Restore both regexes; re-run -> PASS. NOTE: dropping the mount does NOT yield 401 (bypass intact -> 404); breaking the boundary is a DIFFERENT failure requiring this separate control.

- [ ] **Step 3: Negative control C — drop the management mount**

Comment out `app.use('/api/shares', sharesRouter);` only (Edit). Run the surface test.
Expected: FAIL — (a) returns `404 { error: 'not_found' }`. Proves the mgmt-mount coverage. Restore; re-run -> PASS.

- [ ] **Step 4: Negative control D — remove the import (parity RED)**

Temporarily remove the `import { sharesRouter, publicSharesRouter } ...` line AND both mounts (Edit). Run `route-mount-parity.test.ts`.
Expected: FAIL — `findUnexemptedDockerOnly` flags `./routes/shares.js` (Docker-only, exemption already deleted). Restore all lines; re-run -> PASS.

- [ ] **Step 5: Typecheck and lint**

```powershell
npm run check
npm run lint
```
Expected: both PASS with no new errors.

- [ ] **Step 6: Run the full affected server suite once**

```powershell
$env:TZ='UTC'; npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/shares-makeapp-surface.contract.test.ts tests/unit/routes/shares.contract.test.ts tests/unit/server/route-mount-parity.test.ts tests/unit/mount-parity-migrations.test.ts
```
Expected: PASS — all four files green (the pre-existing `shares.contract.test.ts` still passes — it constructs the router directly, unaffected by the mount).

- [ ] **Step 7: Commit, push (BACKGROUND), open PR (NO auto-merge)**

```bash
git add server/app.ts tests/unit/routes/shares-makeapp-surface.contract.test.ts tests/unit/server/route-mount-parity.test.ts tests/unit/mount-parity-migrations.test.ts
git commit -m "feat(routes): mount shares routers on makeApp; burn down gap-pending 11->10 (#1036)"
```
Push in the background (the pre-push doc-freshness hook scans ~645 md files and blows the 2-min foreground cap). Then `gh pr create --base main` (see PR body below). Do NOT arm auto-merge.

PR body MUST include: route inventory (TWO mounts: `/api/shares` mgmt + `/api/public/shares` anonymous); real client callers (`dashboard-modern.tsx:161`, `shared-dashboard.tsx:88,115`); the auth model (mgmt self-gates via `requireAuthenticatedUser`+`canManageFund`, cross-surface-safe; public stays anonymous via `isPublicApiPath` whitelist — no new gate); the discrimination note (the load-bearing public proof is the `/verify` 400 — DB-independent — plus the GET body check; the `GET /api/shares` 401 only exercises the pre-existing global `/api` boundary and is NOT cited as mount proof); local verification output; ALL FOUR negative-control RED proofs (A public-mount, B broken-boundary, C mgmt-mount, D parity-import); diff scope; gap-pending 11->10 + canary retargeted shares->capital-allocation. Non-goals: no auto-merge, no unrelated cleanup, no docs/session artifacts, no dependency changes.

- [ ] **Step 8: Publication proof (do NOT arm auto-merge)**

```bash
gh pr view <new-pr> --json statusCheckRollup,headRefOid,baseRefOid,mergeStateStatus,reviewDecision,state
gh workflow run ci-unified.yml --ref feat/1036-burndown-shares-makeapp-mount -f run_full_suite=true
```
This PR touches only `server/**` + `tests/**` (no `migrations/**` or `shared/schema/**`), so the new contract tests are NOT auto-run on the PR — dispatch the full suite and cite it. R6 CI proof from the unit-fast job log: `test:unit` primary ran, `--project=server`, `--bail=1`, no `test:quick` fallback, unit-fast green, live `statusCheckRollup`. Do not claim dot-reporter logs contain specific test filenames.

---

## Notes / risks (not tasks)

- **REFL-037 (DB on makeApp surface):** the public GET and mgmt GET reach the real `db` under ALLOW_MEMORY_STORAGE, so their status may be 404/200 OR a DB-driven 500. That is why (c)/(a) assert NON-membership of failure statuses / NON-`not_found` body rather than a hard 200/404. Only (d) is fully deterministic (Zod 400 before any DB).
- **REFL-001 (frozen config):** the surface harness sets JWT/env BEFORE importing `makeApp` and calls `vi.resetModules()` in `beforeEach` (copied from the timeline harness). Do not reorder.
- **415 guard interaction:** `.send({})` in supertest sets Content-Type application/json, so the makeApp 415 guard (app.ts:119-130) passes and the request reaches the Zod parse. A body-less `.post(...)` with no `.send` would 415 instead — always `.send({})`.
- **Rate limiters:** `publicShareReadLimiter`/`publicShareVerifyLimiter` (shares.ts:63-87) key on `req.params.shareId`; first request per id passes (max 60 / max 5). Pre-existing infra, shared with routes already on makeApp; no change needed.
- **Docs governance:** this plan lives under `docs/superpowers/plans/` but is LEFT UNTRACKED (matching the timeline plan) to avoid the "Validate Discovery Routing" gate on new `docs/**/*.md`. Do not `git add` it.
