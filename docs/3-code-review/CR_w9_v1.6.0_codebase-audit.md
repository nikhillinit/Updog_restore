---
status: ACTIVE
audience: both
last_updated: 2026-09-19
owner: '@nikhillinit'
---

# Code Review: Codebase Audit for Priority Tasks (main at d9f32c0)

**Review Date**: 2026-09-19

**Version**: 1.6.0 (package.json unchanged; the audit target is protected `main`
head `d9f32c0c1b8474da42e42b22f729d45cd56fc8e0`, 46 commits after the w8 record
at `c936124`)

**Files Reviewed**: the whole tree was scanned; findings anchor in

- `package.json` (`validate:core` and `calc-gate:full` scripts)
- `.github/workflows/ci-unified.yml`
- `server/server.ts`, `server/app.ts`, `server/lib/idempotency.ts`,
  `server/shared/idempotency-instance.ts`, `server/middleware/idempotency.ts`,
  `server/lib/database-backed-idempotency-routes.ts`
- `server/routes/mount-common-routes.ts`,
  `server/routes/portfolio-companies.ts`,
  `server/routes/allocation-scenarios.ts`,
  `server/routes/lp-reporting/metric-runs.ts`, `server/routes/sensitivity.ts`,
  `server/routes/timeline.ts`, `server/routes/deal-pipeline.ts`,
  `server/services/deal-pipeline-service.ts`,
  `server/services/variance-tracking/baseline-service.ts`
- `server/compass/routes.ts`, `server/routes/v1/reserve-approvals.ts`,
  `server/routes/simulations-guarded.example.ts`
- `client/src/components/portfolio/tabs/AddCompanyDialog.tsx`,
  `client/src/lib/queryClient.ts`
- `tests/integration/portfolio-activity-routes.test.ts`
- `docs/ARCHI.md`, `CHANGELOG.md`, `docs/INDEX.md`,
  `docs/STABILIZATION-ROADMAP.md`, `docs/ARCHITECTURAL-DEBT.md`, `TODOS.md`
- sixteen tracked root-level scripts (listed under Minor 2)

**Plan**: no plan — unplanned change. This is the manual audit path of the
TRIP-review skill; the criteria come from `checklist.md` and the skeleton from
`cr-template.md` as supplied for this session, because
`.claude/skills/TRIP-review/` is not in the repository (Minor 4).

---

## Executive Summary

Protected `main` has failed `CI Gate Status` on 12 consecutive pushes since
#1535 (2026-09-17), for two deterministic causes that the pull-request gate
never exercises, and one of them is a shipped client break: the Add Company
dialog posts without the `Idempotency-Key` header the server now requires. Local
static gates are green (typecheck baseline 0, lint plus 11 guardrails, 363 of
363 Phoenix truth cases, 0 production audit findings) and no auth or secret
exposure was found. Verdict: **NEEDS REVISION**.

---

## Changes Overview

Scope is the full tree at HEAD: 439,555 lines of TypeScript across server (544
files), shared (357), client (822) and workers (12), with 1,471 test files.
Since the w8 record, 46 squash-merged PRs changed 607 files (+174,310 /
-72,831), notably F_1.12.0 phases 1-5a (#1540), versioned capital planning
(#1505, #1511), the persisted Cashflow tab (#1521), server authorization and
idempotency guards (#1535, #1536), and unreachable-code deletions (#1529 to
#1531, #1544). The audit combined the local toolchain gates, the GitHub Actions
history for `main`, static scans for the CLAUDE.md mandates, and a source read
of every candidate finding before it was recorded.

---

## Findings

### Critical Issues

#### C1. Add Company flow returns 400 since #1535 (breaking API contract change)

- **Where**: `server/routes/portfolio-companies.ts:293` (`requireIdempotencyKey`
  on `POST /portfolio-companies`, added in `08cf1e8`);
  `client/src/components/portfolio/tabs/AddCompanyDialog.tsx:89` (posts through
  `apiRequest` with no `Idempotency-Key`);
  `client/src/lib/queryClient.ts:94-107` (`apiRequest` injects only
  `Content-Type` plus caller headers).
- **Description**: `requireIdempotencyKey`
  (`server/middleware/idempotency.ts:481-494`) rejects any request without the
  header with `400 IDEMPOTENCY_KEY_REQUIRED`. The dialog never sends one, so
  creating a portfolio company from the UI fails on any deployment of `main` at
  or after `08cf1e8`. `portfolio-companies` is in the common manifest
  (`shared/routes/api-route-manifest.ts:231`), so both the Vercel `makeApp`
  surface and the Docker `createServer` surface are affected. The failing
  integration test in Major 1 reports exactly this contract. Other client call
  sites hardened in the same PR do send the header (for example
  `client/src/components/portfolio/company-metadata-drawer.tsx:135`); this one
  was missed, and `tests/unit/components/portfolio/add-company-dialog.test.tsx`
  cannot catch it because it does not assert request headers.
- **Verification limits**: proven from source and from the CI failure signature;
  the deployed production build was not exercised by this audit.
- **Disposition**: open. Fix shape: generate a key in the dialog mutation using
  the existing drawer pattern, and add either a client test asserting the header
  or a contract test that every client caller of a `requireIdempotencyKey` route
  sends it.

### Major Issues

#### M1. `CI Gate Status` red on main for 12 consecutive pushes

- **Where**: CI Unified push runs from `08cf1e8` (#1535, 2026-09-17 08:38 UTC)
  through `d9f32c0` (#1549, run `35412719212`); last green push `6ff1c23`
  (#1534, 2026-09-17 04:14 UTC).
- **Failure A ("Test integration")**:
  `tests/integration/portfolio-activity-routes.test.ts:103` expects 201 and
  receives 400 on `POST /api/portfolio-companies` without an `Idempotency-Key`.
  Same root cause as C1; failing on every push since `08cf1e8`.
- **Failure B ("Test validate-core")**: the `validate:core` script in
  `package.json` still lints `shared/core/cohorts/CohortEngine.ts` and
  `client/src/core/cohorts/CohortEngine.ts` and runs
  `tests/unit/engines/cohort-engine.test.ts`; all three were deleted in
  `6240d22` (#1544). ESLint exits 2 with "No files matching the pattern".
  `calc-gate:full` carries the same stale test path (silent, because a vitest
  filter that matches nothing does not fail).
- **Consequence**: `docs/STABILIZATION-ROADMAP.md` Global Rule 1 ("do not start
  milestone N+1 until ... `npm run validate:core` is green") is violated on
  `main`, and the required aggregate merge authority named by the governing
  policy is red on the protected branch.
- **Disposition**: open. Fix shape: remove the three deleted paths from both
  scripts; fix C1 (which repairs Failure A); add the script-path guard in
  Suggestion 2.

#### M2. Pull-request gate does not run the integration suite, so both regressions merged green

- **Where**: `.github/workflows/ci-unified.yml:289-300` (`test-full` runs only
  on `main` pushes, schema changes, or a manual full-suite dispatch) and
  `:935-945` (the PR gate expects only `test-affected`).
- **Description**: #1535 changed route behavior under `server/routes/**` and
  #1544 changed `package.json` scripts; neither path class triggers the
  integration or `validate-core` lanes on a pull request. The gate therefore
  admits changes that immediately turn `main` red, which is the observed
  history.
- **Disposition**: open. Fix shape: run `test-full` (or at least the integration
  group and `validate-core`) on PRs that touch `server/routes/**`,
  `server/middleware/**`, `server/app.ts`, `server/server.ts`, or `package.json`
  scripts, via `.github/path-filters.yml`.

#### M3. Generic idempotency layer on the `createServer` surface is inert and leaks a timer per keyed request

- **Where**: `server/server.ts:256` (`return withIdempotency()(req, res, next)`
  inside the per-request handler); `server/lib/idempotency.ts:48-50` (each
  `withIdempotency()` call allocates a fresh `memoryStore()`); `:26`
  (`setInterval(gc, 10_000).unref()` per store, never cleared).
- **Description**: because the factory runs per request, every request sees an
  empty store, so this layer can never return a replay or a 409 for an in-flight
  duplicate. On this surface the mandate "all mutations MUST have idempotency"
  is satisfied only by routers that carry their own middleware or
  database-backed keys. Each keyed mutation also leaves a `Map` plus an interval
  alive for the process lifetime. The surface is the Docker/Railway and
  local-dev assembly (`server/bootstrap.ts` -> `createServer`).
  `tests/unit/server/common-route-manifest.test.ts:316` checks only bypass
  ordering, not replay. A shared store already exists
  (`server/shared/idempotency-instance.ts`) and is used by `funds.ts` and
  `operations.ts`.
- **Disposition**: open. Fix shape: hoist one `withIdempotency({ store: idem })`
  instance to module scope; add a replay test on the `createServer` surface;
  route the logging through pino (Minor 5).

#### M4. Durable mutation routers with no idempotency handling on the production (`makeApp`) surface

- **Where**: `server/app.ts:242-262` mounts CSRF, RLS and the common routes but
  no generic idempotency middleware (the only generic layer is the inert one in
  `server.ts`, M3). Routers whose mutations neither import
  `server/middleware/idempotency` nor implement a key or request hash at service
  level: `server/routes/allocation-scenarios.ts:459-620` (create scenario,
  create decision, two PATCH updates, sync, apply);
  `server/routes/lp-reporting/metric-runs.ts:400-870` (approve, lock,
  report-package, exports, evidence-records, narrative-runs, review, approve;
  `dry-run` and `commit` are hash-deduped in `metric-run-commit-service.ts`);
  `server/routes/sensitivity.ts` (three run-creating POSTs persisted by
  `sensitivity-run-service.ts`); `server/routes/timeline.ts:198` (POST
  snapshot).
- **Description**: a client retry after a network error creates duplicate
  scenarios, decisions, runs or snapshots. The route policy registry
  (`server/route-policy/api-route-policy-registry.ts`) records idempotency in
  `workflowRequirement` for 31 entries and classifies 93 routes as
  `durable_crud`, but nothing executable proves coverage across the manifest.
  Some transitions (approve, lock) may be naturally idempotent; that property is
  undocumented.
- **Disposition**: open. Fix shape: the executable invariant in Suggestion 1,
  then per-router remediation (Idempotency-Key with request hash for create
  endpoints; documented natural-key semantics for state transitions).

#### M5. Optimistic-locking mandate not met on user-editable durable updates

- **Where**: `server/routes/deal-pipeline.ts:313` (`PUT /:id`) ->
  `server/services/deal-pipeline-service.ts:345-359` (`updateDeal`) writes
  `toDealUpdateValues(data)` with a `where` on id and fund only, no version or
  `If-Match`; `server/services/variance-tracking/baseline-service.ts:336-366`
  (default and deactivate flags) has the same shape. A static scan found 120
  drizzle `update(...)` calls across 55 files, of which 55 sites have no
  concurrency predicate within 20 lines; six were read in full, two confirmed as
  last-writer-wins on user-facing rows, the rest are internal state machines
  keyed by request id.
- **Description**: concurrent edits of the same deal by two users silently drop
  the first write. Routes that do implement the mandate
  (`server/routes/cash-flow-events.ts`, `operating-object-decisions.ts`,
  `fund-moic.ts`, `reallocation.ts`) show the expected shape (`If-Match` -> 428,
  expected version -> 409).
- **Disposition**: open. Fix shape: triage the 55 scanned sites into
  user-editable rows (add a version column and `If-Match` or `expectedVersion`
  per the ADR-011 convention) versus internal state transitions (document as
  exempt).

### Minor Issues

#### m1. Documentation drift after the September merges

- `CHANGELOG.md` `[Unreleased]` stops at 2026-09-16 and has no entry for 12 of
  the 13 PRs merged 2026-09-14 to 2026-09-19 (#1511, #1517, #1521, #1535, #1536,
  #1540 to #1544, #1548, #1549); only #1505 is mentioned.
- `docs/2-changelog/` has no week-9 entry for F_1.12.0 phases 1-5a (#1540)
  although
  `docs/1-plans/F_1.12.0_fixed-template-financial-facts-publication.plan.md`
  exists.
- `docs/ARCHI.md` (refreshed 2026-08-05) says 9 guardrail scripts (there are 11
  in `guardrails:check`), "Nine vitest configs" (8 on disk), and has no coverage
  of F_1.12.0, capital planning, or the Cashflow tab.
- `docs/INDEX.md` cites a test baseline of 72.3% from 2025-12-15; the current
  suite result is in the Verdict.
- `docs/ARCHITECTURAL-DEBT.md` (2026-04-03) still lists
  `client/src/core/selectors/xirr.ts`, which no longer exists.
- **Disposition**: open.

#### m2. Sixteen tracked root-level scratch scripts with no references

`test_debug.mjs`, `test-xirr-manual.mjs`, `test-ai.mjs`, `test-navigation.js`,
`test-step3-navigation.js`, `analyze-lint.js`, `fix-lint.js`, `check-db.js`,
`count-any-errors.cjs`, `count-new-errors.cjs`, `analyze-undef.js`,
`analyze-bundle.cjs`, `validate-phase0.mjs`, `rollback-async.sh` and
`docker-setup.sh` have zero references from `package.json`, `.github`, `scripts`
or `docs`; `analyze-packages.mjs` has two. **Disposition**: open (delete, or
move under `scripts/` with an ADR-102 style disposition).

#### m3. Unmounted server modules carrying TODO stubs

`server/compass/routes.ts` (11 TODOs; `userId ... || 'system'` at `:252` and
`:292`; no persistence) and `server/routes/v1/reserve-approvals.ts` ("TODO:
Execute the actual reserve strategy change" at `:381`) are mounted on neither
surface (no import in `server/app.ts`, `server/server.ts`, `server/routes.ts` or
`mount-common-routes.ts`). `server/routes/simulations-guarded.example.ts` is an
example file inside the routes directory. Not reachable, so not a security
finding; dead code that needs a disposition. **Disposition**: open.

#### m4. TRIP-review skill assets are not in the repository

Prior records (`CR_w4_v1.5.0.md:93`, `CR_w6_v2.0.1.md:19`, `CR_w6_v2.0.4.md:85`)
cite `.claude/skills/TRIP-review/checklist.md`, but the directory has never been
committed (`git log --all` shows no history). This audit applied the checklist
and template supplied out-of-band. **Disposition**: open (commit `SKILL.md`,
`checklist.md` and `cr-template.md` under `.claude/skills/TRIP-review/` and
register them in `.claude/skills/INDEX.md`).

#### m5. Idempotency wrapper degrades silently through `console.error`

`server/lib/idempotency.ts:107` and `:115` log with `console.error` and continue
without idempotency when the store fails. Production code is under a console
ratchet (baseline 39). **Disposition**: open (bundle with M3).

#### m6. Oversized modules

Thirty source files exceed 1,279 lines; the largest are
`server/services/lp-reporting/actuals-pilot-publish-service.ts` (3,427),
`shared/schema.ts` (2,722), `server/route-policy/api-route-policy-registry.ts`
(2,603), `client/src/pages/variance-tracking.tsx` (2,511) and
`server/services/internal-analysis/analysis-checkpoint-service.ts` (2,221).
**Disposition**: open (no change requested by this audit; split when next
touched).

#### m7. Dependabot backlog with failing checks

Seven Dependabot PRs are open (#1445, #1446, #1504, #1513, #1514, #1519, #1547).
The grouped bumps #1513 (19 dev packages) and #1514 (22 production packages)
fail typecheck, lint, unit-fast, dependency validation, governance guards,
surface projection audit, license allowlist, SBOM and Trivy container checks;
issue #1373 tracks the lockfile-only surface-contract gate. **Disposition**:
open.

### Suggestions

1. Executable idempotency invariant: a contract test over
   `COMMON_API_ROUTE_MANIFEST` asserting that every `durable_crud` POST, PUT,
   PATCH or DELETE is database-backed (`isDatabaseBackedIdempotencyRoute`),
   wrapped by `server/middleware/idempotency`, or declares a natural-key
   `workflowRequirement` in the policy registry.
2. Script-path guard: a unit test that every file path literal inside
   `package.json` scripts exists, so deletions like #1544 fail locally before
   CI.
3. Skip clusters: 79 `skip` and `todo` markers overall (9 static `describe.skip`
   files against the threshold of 25; quarantine report 30 of 30 documented on
   2026-09-17). The 19 `it.skip` in `tests/unit/api/time-travel-api.test.ts` and
   2 in `tests/unit/services/lp-reporting/xirr-diagnostic-service.test.ts` sit
   on API and XIRR surfaces and deserve either restoration or formal quarantine
   entries.
4. TODO triage: 57 `TODO`/`FIXME` markers in server, client and scripts; the
   four `TODO(13)` entries in `api-route-policy-registry.ts:1717-1792`,
   `performance-prediction.ts:855` and `lp-queries.ts:484` describe schema gaps
   and belong in `TODOS.md` or issues.
5. Typing and suppressions are contained but worth ratcheting: 55 `: any`
   outside tests (51 in server), 8 `as any`, 49 inline `eslint-disable` (13
   `require-atomic-updates`), 4 `@ts-ignore` or `@ts-expect-error`; file-level
   disable baseline 28.

---

## Checklist

- [ ] 1. Functional Requirements — passed with caveats: C1 and M1 Failure A show
      a server contract change shipped without its client; all other sampled
      flows match their contracts.
- [ ] 2. Code Quality — passed with caveats: typecheck baseline 0 errors and
      lint clean; m2 (scratch scripts), m3 (dead modules), m6 (module size),
      Suggestion 5 (suppressions).
- [ ] 3. Architectural Compliance — passed with caveats: manifest and mount
      parity hold on both surfaces, the policy registry covers 102 entries and
      the discovery map is in sync; M2 (gate design), M3 and M4 (idempotency
      mandate), M5 (optimistic-locking mandate), m1 (ARCHI and CHANGELOG drift),
      m4 (skill assets).
- [ ] 4. Error Handling — passed with caveats: sampled routes fail closed with
      typed refusals (cursor validation at
      `server/routes/sensitivity.ts:245-283`, `lp-documents.ts:160`,
      `deal-pipeline.ts:226`); m5 (silent degradation in the idempotency
      wrapper).
- [x] 5. Security — passed: CodeQL, Security Deep Scan, Gitleaks history scan,
      Trivy filesystem and container scans green on `d9f32c0`; `npm audit` 0
      production findings (1 low in dev); no hardcoded secret fallbacks in
      `server/`; every `sql.raw` site reads constants (`lp-health.ts:107`,
      `canary-residue-service.ts:58-70`, `fund-lock.ts:24`); all 102 policy
      entries declare an auth boundary; the only `|| 'system'` actor fallback is
      in unmounted code (m3).
- [ ] 6. Performance — passed with caveats: bundle size check green in CI; all 8
      BullMQ workers set `lockDuration` and 4 enforce hard timeouts; M3 leaks a
      `Map` and an interval per keyed request on the `createServer` surface.

---

## Verdict

**NEEDS REVISION**

Local gates on `d9f32c0` (Node 22.22.2, `TZ=UTC`): `npm run check` reported 0
baseline and 0 new TypeScript errors across client, server and shared (2m54s);
`npm run lint` passed ESLint with zero warnings and all 11 guardrails (3m21s);
`npm run phoenix:truth` passed 20 files and 363 of 363 truth cases;
`npm run docs:routing:check` reported the discovery map in sync; `npm audit`
reported 0 production and 1 low development finding. `npm test` (the full unit
suite, server and client projects) ran 1,203 files and 16,552 tests in 10m32s:
1,196 files and 16,461 tests passed, 90 tests were skipped, and one test failed
for an environment reason only, because
`tests/unit/setup/supertest-loopback.test.ts` needs an IPv6 loopback listener
that this sandbox does not provide (`EAFNOSUPPORT` on `::1`); the same suite is
green in the `Check unit-fast` job on `d9f32c0`.

The approval gate in `checklist.md` is not met: the build gate on `main` is red
(M1) and Critical and Major findings remain open. No overrides were applied.
This record is a defect-finding observation under the governing policy; it
authorizes nothing. The deployed production build was not exercised, so C1 is
proven from source and CI, not from production traffic.

### Priority tasks

Effort scale: S is under half a day, M is one to three days, L is more.

| #    | Priority | Task                                                                                                                                                              | Anchors                                                                   | Effort |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| P0-1 | P0       | Send `Idempotency-Key` from the Add Company dialog and assert it in a client test; confirm no other `requireIdempotencyKey` route has a header-less client caller | C1, `AddCompanyDialog.tsx:89`, `portfolio-companies.ts:293`               | S      |
| P0-2 | P0       | Remove the three deleted CohortEngine paths from `validate:core` and `calc-gate:full`                                                                             | M1 Failure B, `package.json`                                              | S      |
| P0-3 | P0       | Re-run CI Unified on `main` after P0-1 and P0-2; record the green run in `docs/STABILIZATION-ROADMAP.md` against Global Rule 1                                    | M1                                                                        | S      |
| P1-1 | P1       | Run the integration group and `validate-core` on PRs touching routes, middleware, app assemblies or `package.json` scripts                                        | M2, `ci-unified.yml:289-300`, `.github/path-filters.yml`                  | S-M    |
| P1-2 | P1       | Hoist the `createServer` idempotency wrapper to one shared-store instance, clear the interval on shutdown, add a replay test, route logs through pino             | M3, m5, `server/server.ts:256`, `server/lib/idempotency.ts:26,50,107,115` | S-M    |
| P1-3 | P1       | Add the manifest-wide idempotency coverage invariant, then close the gaps in allocation-scenarios, metric-runs, sensitivity and timeline                          | M4, Suggestion 1                                                          | M      |
| P1-4 | P1       | Add version or `If-Match` handling to deal updates; triage the other 53 scanned update sites into governed versus exempt                                          | M5, `deal-pipeline.ts:313`, `deal-pipeline-service.ts:345-359`            | M      |
| P1-5 | P1       | Triage the Dependabot backlog: split #1513 and #1514, resolve #1373, land the action bumps                                                                        | m7                                                                        | M      |
| P2-1 | P2       | Documentation sync: CHANGELOG entries for #1511 to #1549, week-9 changelog for F_1.12.0, ARCHI.md counts and sections, INDEX.md baseline, debt register paths     | m1                                                                        | S-M    |
| P2-2 | P2       | Dead-code disposition for `server/compass/`, `server/routes/v1/reserve-approvals.ts`, the example route and the 16 root scripts                                   | m2, m3                                                                    | S      |
| P2-3 | P2       | Commit the TRIP-review skill assets under `.claude/skills/TRIP-review/` and register them                                                                         | m4                                                                        | S      |
| P2-4 | P2       | Add the script-path guard test; triage skip clusters and TODO markers; ratchet `: any` in server                                                                  | Suggestions 2 to 5                                                        | S each |

### Evidence basis (bias-audit)

**Who this is for**: the repository owner and any agent picking up the P0 and P1
tasks, assuming familiarity with the CLAUDE.md mandates and the CI Unified
workflow. **Who this is not for**: LP-facing or product-readiness decisions; it
is not production-readiness evidence and not a deployment authorization, which
the governing policy reserves to the canonical production route.

**Claims**: every count and failure attribution above is `inference_allowed`,
derived from repository state at `d9f32c0`, local gate runs on 2026-09-19, and
GitHub Actions run, job and log records cited by id; no `citation_required`
external claim is made. `opinion_only`: the severity classes, the task ordering
and the effort estimates. **Disconfirming checks performed**: the Add Company
break was checked against the client request helper and the route manifest
before classification; both CI failures were confirmed on the oldest and the
newest red run; each idempotency and locking gap was read at the service level,
not only at the route; unmounted modules were verified against all four mount
points before being downgraded from security findings.
