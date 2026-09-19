# HANDOFF PROMPT: bug-prospector proactive error hunt (post-w9 audit)

You are picking up a **proactive bug hunt** on `Updog_restore` using the
**bug-prospector** skill (v1.1.0, Coffee & Code LLC; seven analysis lenses:
assumptions, state machines, boundary conditions, data lifecycle, error paths,
time-dependent behavior, platform divergence). The skill is **not** committed in
this repository. Its `SKILL.md` is attached to the kickoff message that pointed
you here; read it in full before Step 0 and execute its workflow, do not
summarize it. If the attachment is missing, stop and ask for it; do not
reconstruct the skill from memory.

This document exists so the fresh session does not re-derive what the previous
session (2026-09-19, session `session_01CYDH7gafR9atXfRTw6VNbD`) already
established, and so the skill's interactive prompts have answers ready. Every
fact below was read from the tree at `main @ d9f32c0c` and is tagged with the
file it came from; grep before trusting, because plans drift within hours.

---

## Mission

Find the bugs that pattern scanners miss: code that compiles, passes lint and
typecheck, and still fails a real user under a realistic condition. The previous
session already ran two pattern-shaped passes (a TRIP-review audit and a
bug-echo sweep); their findings are listed under "Already tracked" so you can
skip them. Your output is one bug-prospector report per scope tier under
`.agents/research/`, each BUG and FRAGILE row rated on all six dimensions, with
a phased implementation plan at the end. Fixing is a separate decision for the
owner; this session reports.

---

## Pre-answered skill prompts

The skill asks these through `AskUserQuestion`. The owner has pre-answered them
here; do not block on them. If a later answer conflicts with what you find in
the tree, say so in the report and proceed with the tree.

| Skill prompt                    | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-flight: uncommitted changes | The tree must be clean. If `git status --porcelain` is non-empty on a fresh clone, something is wrong; stop and report rather than commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Step 0: platform                | "Other / multi-platform". TypeScript monorepo. Server: Node 22.x Express on **two assemblies**, Vercel serverless via `makeApp()` (`server/app.ts`) and Docker/Railway via `createServer()` (`server/server.ts`, entry `server/bootstrap.ts`). Workers: BullMQ processes under `workers/` on Railway. Browser: React 18 in dev, **Preact 10 in the production bundle** (`npm run build:web` runs `vite build --mode preact`, `vite.config.ts:211,292`). Database: PostgreSQL, Neon WebSocket pool on Vercel and node-postgres elsewhere (`server/db.ts:27-80`). There are no `#if os(...)` blocks; the platform axes are listed under Lens 7 below. |
| Step 1.1: scope                 | "Specific file or feature": the Tier A list below, then Tier B if budget remains. Do not choose "Full codebase" (439,555 lines of TypeScript across 1,735 source files; the full scan does not fit one session).                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Step 1.2: lenses                | Tier A: all 7. Tier B: Quick 3 (Assumptions, Error Paths, Boundaries) plus State Machine and Time. The per-file lens hints below say which lenses matter most for each file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Step 4.1: terminal width        | Remote session; assume under 160 columns inline and always write the full 8-column table to the report file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Step 5: follow-up               | "Create implementation plan". Do not apply fixes in this session. If a finding is CRITICAL (crash, data loss, auth bypass, money wrong), say so in the final message so the owner can pull it forward.                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Rating glyphs.** This repository forbids emoji in committed files (`CLAUDE.md`
"No emoji in code, docs, or logs"; the pre-commit hook scans staged `.md`
files). Use the text labels only: Urgency CRITICAL / HIGH / MEDIUM / LOW; Risk
Low / High / Critical; ROI Excellent / Good / Marginal / Poor; Blast Radius as
"N files". Semantics are unchanged. This also means the skill's own `SKILL.md`
cannot be committed verbatim under `.claude/skills/`; keep it as an attachment.

---

## Lens translation for this stack

The skill's search accelerators are written for Swift. Use these equivalents.
Counts are from `main @ d9f32c0c` (non-test files) so you can tell a dense file
from a sparse one before reading it.

**Strictness changes what "assumption" looks like.** `tsconfig.json` enables
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`. So `arr[0]` is already typed as possibly
undefined; the Swift `.first!` smell moves to the non-null assertion `x!` and to
`as` casts. Money is Decimal.js under `guard:decimal-string-laundering:check`;
the `|| 0` and `|| 1` numeric coercions are exactly the class that #1548 (`|| 1`
turned a 0x write-off into 1x MOIC) and #1549 (missing valuation treated as 0)
just fixed, so they are the highest-yield Lens 1 and Lens 3 target.

| Lens                  | Grep for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Where it is dense (count)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Assumptions         | `[A-Za-z0-9_)\]]!(\.\|;\|\)\|,\| )` (non-null assertion), `as unknown as`, `JSON.parse(` outside try, `process.env[...]!`, `\|\| 0\b`, `\|\| 1\b`, `?? 0\b`                                                                                                                                                                                                                                                                                                                                                                                              | 265 assertions total; `server/services/lp-reporting/actuals-pilot-preview-service.ts` (28), `client/src/components/scenarios/CreateCapitalPlanScenarioModal.tsx` (14), `shared/lib/capital-planning/source-materialization-core.ts` (13). 444 numeric fallbacks; `client/src/core/reserves/computeReservesFromGraduation.ts` (21), `shared/lib/economics/economics-engine.ts` (12), `shared/core/capitalAllocation/*` (25 across three files) |
| 2 State machines      | XState: `client/src/machines/modeling-wizard.machine.ts` (the only machine). Zustand: `client/src/stores/{fundStore,useFund,useFundSelector,useFundStore}.ts`. Server status enums and transitions: metric-run lifecycle, decisions, tasks, actuals publication commands, calc runs, current-forecast latch and claims. `isLoading\|isSubmitting\|isSaving\|isPending` flags in components                                                                                                                                                               | See Tier A items 1, 6 and Tier B items 8, 9, 11                                                                                                                                                                                                                                                                                                                                                                                               |
| 3 Boundaries          | `.slice(`, `.at(-1)`, `length - 1`, `Math.min(\|Math.max(`, Decimal `.div(` with a possibly-zero divisor, `toFixed(`, `.split(`, `parseInt(` without radix, cursor `limit` clamps                                                                                                                                                                                                                                                                                                                                                                        | Calculation paths under `shared/lib/`, `shared/core/`, `server/services/*calculator*.ts`                                                                                                                                                                                                                                                                                                                                                      |
| 4 Data lifecycle      | drizzle `.insert(\|.update(\|.delete(` outside `db.transaction(` (67 transaction sites), `onConflict`, `onDelete` in `shared/schema*` (189 cascades), react-query `invalidateQueries` after mutations, `onMutate` optimistic updates without `onError` rollback                                                                                                                                                                                                                                                                                          | `server/services/lp-reporting/*`, `server/services/financial-facts*`, `server/services/fund-persistence-service.ts`                                                                                                                                                                                                                                                                                                                           |
| 5 Error paths         | `.catch(() => null\|undefined\|{}\|false)` (25 sites), `void somePromise(` fire-and-forget (67 sites), `catch` blocks that log and continue, `Promise.allSettled` results ignored, react-query mutations without `onError`, `finally` missing a loading reset                                                                                                                                                                                                                                                                                            | `server/services/current-forecast-shadow-trigger.ts` (4), `workers/fund-scenario-calc-worker.ts` (3), `workers/capital-call-status-worker.ts` (3)                                                                                                                                                                                                                                                                                             |
| 6 Time                | `new Date(` (439 in `shared/lib` and `server/services`), `Date.now()`, `toLocale(Date\|Time)?String(` (123 in the client; `TZ=UTC` is mandatory for tests, so local-time rendering is a divergence source), `setTimeout\|setInterval` (137) without clear, BullMQ `delay`/`lockDuration`, `statement_timeout`, double-submit without an `isPending` guard                                                                                                                                                                                                | Workers, current-forecast services, `server/lib/idempotency.ts` (already tracked), client mutation buttons                                                                                                                                                                                                                                                                                                                                    |
| 7 Platform divergence | The two server assemblies: routes mounted only on one surface (ARCHI.md "Routes that exist only on the Docker/Railway surface"), middleware order differences between `server/app.ts:242-262` and `server/server.ts:225-260`. Neon WebSocket pool versus node-postgres (`server/db.ts:27-80`): transaction and timeout semantics differ. Preact versus React: components relying on React-only behavior. Browser `crypto.randomUUID()` (32 client sites) exists only in secure contexts. Node 22 runtime pins (`package.json` engines, `.nvmrc` 22.23.2) | `server/app.ts`, `server/server.ts`, `server/routes/mount-common-routes.ts`, `server/db.ts`, `vite.config.ts`                                                                                                                                                                                                                                                                                                                                 |

---

## Prioritized scope (paths verified on `main @ d9f32c0c`)

Ordered by churn since the last review record (46 PRs, 607 files) and by lens
density. Read each file completely before classifying; the skill's Step 3 rule
(30-line window, guard check, reachability, blast radius by grepping callers)
applies to every candidate.

**Tier A (all 7 lenses; produce report
`bug-prospector-tier-a-money-and-publication`)**

1. `server/services/lp-reporting/actuals-pilot-publish-service.ts` (3,427 lines,
   +2,210 in the window). SERIALIZABLE publication transaction, ambiguous-COMMIT
   reconciliation, `idle_in_transaction_session_timeout` at `:668`, receipt
   replay. Lenses 4, 5, 6, 2.
2. `server/services/lp-reporting/actuals-pilot-preview-service.ts` (1,747 lines;
   densest non-null-assertion file in the tree). Lenses 1, 3.
3. `shared/lib/capital-planning/source-materialization-core.ts` (1,836, new),
   `shared/lib/capital-planning/capital-planning-v1.ts` (1,279, new),
   `shared/lib/capital-planning/capital-planning-v2.ts` (811, new). Pure
   calculators that landed in #1505 and #1511; 32 assertions between them.
   Lenses 1, 3, 4. Run `npm run phoenix:truth` after reading so you know the
   truth-case coverage boundary (363 cases; capital planning has its own
   contract tests under
   `tests/unit/contract/capital-planning-v*.contract.test.ts`).
4. `client/src/components/scenarios/CreateCapitalPlanScenarioModal.tsx` (1,780,
   new) and `client/src/components/scenarios/capital-plan-draft.ts` (686, new).
   Multi-step modal state, draft persistence. Lenses 2, 3, 5.
5. `server/services/position-value.ts`,
   `server/services/fund-metrics-calculator.ts`,
   `server/services/performance-calculator.ts`,
   `server/services/portfolio-overview-service.ts`. #1549 (merged 2026-09-19)
   made valuation-derived metrics nullable; every consumer that still treats
   `null` as `0`, sorts on it, or sums it is a Lens 1 and Lens 3 candidate. Also
   trace the PDF templates and alert automation the PR description names.
6. `server/routes/deal-pipeline.ts` (797 lines, +514 churn) and
   `server/services/deal-pipeline-service.ts`. Bulk status and archive
   operations, import with `skip_duplicates`, stage transitions. Lenses 2, 5.
7. `workers/fund-scenario-calc-worker.ts`,
   `workers/fund-scenario-calc-handler.ts`,
   `workers/capital-call-status-worker.ts`,
   `server/services/current-forecast-shadow-trigger.ts`. Fire-and-forget
   clusters, `lockDuration: 300_000`, hard timeouts, retry and backoff
   semantics. Lenses 5, 6. The governing policy's queue row applies to any fix
   here (duplicate-safe behavior, bounds, failure semantics).

**Tier B (Quick 3 plus State and Time; report
`bug-prospector-tier-b-client-state`)**

8. `client/src/machines/modeling-wizard.machine.ts` (1,390). The only XState
   machine; Lens 2 is built for it: dead-end states, simultaneous flags,
   interrupted transitions on navigation, error reset paths.
9. `client/src/pages/variance-tracking.tsx` (2,511) and
   `client/src/hooks/useVarianceData.ts`. Lenses 2, 5.
10. `client/src/core/reserves/computeReservesFromGraduation.ts`,
    `shared/lib/economics/economics-engine.ts`, `shared/lib/jcurve.ts`,
    `shared/core/capitalAllocation/{invariants,periodLoop,CapitalAllocationEngine}.ts`.
    Densest `|| 0` fallbacks in calculation code. Lens 3, then Lens 1.
11. `server/services/current-forecast-*.ts` (nine files: calc-mode resolver,
    fund lock, held, reference, resume command, serving seam, shadow service,
    shadow trigger, v2 service). One-way activation latch, claim-first commands
    with 90-second stale recovery, per-fund advisory locks. Lenses 2, 6.

**Skip.** `server/compass/**` and `server/routes/v1/reserve-approvals.ts` are
mounted on neither assembly (dead code; already recorded).
`server/routes/simulations-guarded.example.ts` is an example file. Tests,
`docs/`, and generated files are out of scope for the lenses (but see "Test
blind spots" below).

---

## Already tracked: do not re-report

These were found and recorded on 2026-09-19. If a lens re-surfaces one, classify
it as OK (tracked) with the citation instead of writing a new finding. Do not
read these records as a source of findings (the skill's Freshness rule); this
list is the only carry-over.

From `docs/3-code-review/CR_w9_v1.6.0_codebase-audit.md` (on branch
`claude/cool-edison-8nj70s` until merged):

- C1: Add Company dialog posts without the `Idempotency-Key` that
  `POST /portfolio-companies` requires since #1535.
- M1: `CI Gate Status` red on `main` since #1535 (integration test at
  `tests/integration/portfolio-activity-routes.test.ts:103`; `validate:core`
  still lints CohortEngine paths deleted in #1544).
- M2: the pull-request gate never runs the integration or validate-core lanes.
- M3: `server/server.ts:256` instantiates `withIdempotency()` per request (inert
  layer, timer leak per keyed request).
- M4: allocation-scenarios, metric-runs, sensitivity and timeline mutation
  routers carry no idempotency handling on the `makeApp` surface.
- M5: `PUT /api/deals/:id` and the variance baseline flags are last-writer-wins
  (no version or `If-Match`).
- m3: `server/compass/routes.ts` and `server/routes/v1/reserve-approvals.ts` are
  unmounted TODO stubs.

From `.agents/research/2026-09-19-bug-echo-missing-idempotency-key-header.md`:

- Add Deal modal (`AddDealModal.tsx:131`) and Import Deals confirm
  (`ImportDealsModal.tsx:159`) post without the key their routes require.
- Seven local `crypto.randomUUID()` key generators drifted from the shared
  `client/src/hooks/useIdempotencyKey.ts` hook.
- The Playwright `pipeline` project is not part of the CI e2e job.

**Test blind spots worth knowing while you read:** component unit tests mock
`apiRequest` and assert only method, URL and body
(`tests/unit/components/pipeline/add-deal-modal.test.tsx:100`), so request
headers and server contracts are invisible to them. Treat "there is a unit test"
as weak evidence of a guard for anything that crosses the client-server
boundary.

---

## Execution recipe

1. **Setup.** `git fetch origin main`; work on the branch your harness assigned,
   cut from `origin/main`. `npm ci` (about 40 seconds; `preinstall` enforces the
   package manager, `postinstall` patches vitest). Node 22.x. Every test command
   needs `TZ=UTC` (the npm scripts set it through `cross-env`).
2. **Gates you may run for orientation, not as findings.** `npm run check`
   (typecheck baseline, about 3 minutes), `npm run lint` (ESLint plus 11
   guardrails, about 3.5 minutes), `npm run phoenix:truth` (5 seconds). On
   2026-09-19 all three were green on `d9f32c0c`; the full unit suite was green
   except one IPv6-loopback test the sandbox cannot run. Integration tests need
   Postgres and Redis containers and are red on `main` for the tracked reason
   above; do not chase that.
3. **Run the skill** exactly as its `SKILL.md` says: Step 0 platform (answer
   above), Step 1 scope and lenses (answers above), Step 2 per-file reading
   (read the whole file, never classify from a grep hit), Step 3 verification
   rule (30-line window, guard check, reachability, blast radius via `grep -rn`
   for callers), Step 4 report, Step 5 implementation plan.
4. **Report location and naming.**
   `.agents/research/YYYY-MM-DD-bug-prospector-<scope>.md` (the directory is
   tracked in git and already holds prior reports; do not read them). One file
   per tier. Text rating labels only.
5. **Verification before you write a BUG row.** Reproduce the violation scenario
   in your head against the actual code path, name the caller that makes it
   reachable, and grep for an existing guard elsewhere (the skill's rule:
   handled in a different function still counts as handled). When you cannot
   decide, use REVIEW, not BUG.
6. **Commit and push.** `npx prettier --write` on each report (repo config:
   80-column prose wrap), then a conventional commit such as
   `docs(research): add bug-prospector tier A report`, then
   `git push -u origin <branch>`. The pre-commit hook runs prettier, the emoji
   scan and the archive guard; if it is not executable in your checkout, run
   prettier and the emoji grep yourself.
7. **Close out.** End with the compact table inline, the report paths, and the
   phased implementation plan. If any finding is CRITICAL, lead with it.

**Budget guidance.** Tier A items 1 to 3 alone are about 8,000 lines of dense
code. If the session cannot finish Tier A, stop at a tier boundary, write the
report for what was fully verified, and record the unread files under "Not yet
analyzed" so the next session starts there. A partial report with verified rows
beats a complete report with guessed ones.

---

## Definition of done

- One report per completed tier under `.agents/research/`, committed and pushed,
  each BUG and FRAGILE row carrying Urgency, Risk of Fixing, Risk of Not Fixing,
  ROI, Blast Radius and Fix Effort.
- Every BUG row cites `file:line`, names the violation scenario a real user can
  trigger, and shows the current code and a suggested fix.
- "Already Guarded" and "Needs Human Review" sections populated; the
  already-tracked list above is not re-reported.
- A phased implementation plan (grouped by file proximity, ordered by urgency)
  at the end of the last report.
- Final message: compact table, report paths, CRITICAL findings first, and a
  one-line offer to run bug-echo on any fix the owner chooses to ship.

---

## Anchors (grep or read before trusting)

- Runtime surfaces: `docs/ARCHI.md` sections 3 and 5 (Vercel `makeApp` versus
  Docker `createServer`; routes only on one surface);
  `server/routes/mount-common-routes.ts:120-230` (per-surface route order).
- Mandates every finding must respect: `CLAUDE.md` "Non-Negotiable Rules"
  (idempotency, optimistic locking, cursor validation, queue timeouts, no emoji,
  `TZ=UTC`, Phoenix truth cases); `AGENT-SAFETY.md` (financial allocation and
  Git-state rules).
- Consequence-specific proof for any fix that follows this report:
  `docs/governance/solo-internal-change-and-production-policy.md`, read from
  `origin/main`, table "Consequence-specific proof".
- Idempotency reference implementation:
  `client/src/hooks/useIdempotencyKey.ts:20`.
- Truth cases and calc gates: `npm run phoenix:truth`, `npm run calc-gate` (note
  `calc-gate:full` still names a deleted test path; tracked as M1).
- Prior review and sweep records (context only, not finding sources):
  `docs/3-code-review/CR_w9_v1.6.0_codebase-audit.md`,
  `.agents/research/2026-09-19-bug-echo-missing-idempotency-key-header.md`.
  Until `claude/cool-edison-8nj70s` merges, read them with
  `git show origin/claude/cool-edison-8nj70s:<path>`.

---

## Kickoff prompt (paste into the fresh session with `SKILL.md` attached)

```text
Read docs/superpowers/plans/2026-09-19-bug-prospector-proactive-error-hunt-handoff.md
in full, then read the attached bug-prospector SKILL.md in full. Execute the
skill on the Tier A scope from the handoff with all 7 lenses, using the
pre-answered prompts in the handoff instead of asking. Write the report to
.agents/research/, commit and push it, then continue to Tier B if budget
remains. Report only; create the implementation plan, do not apply fixes.
```

If the handoff file is not on the branch you were given, fetch it with
`git fetch origin claude/cool-edison-8nj70s` and
`git show origin/claude/cool-edison-8nj70s:docs/superpowers/plans/2026-09-19-bug-prospector-proactive-error-hunt-handoff.md`.
