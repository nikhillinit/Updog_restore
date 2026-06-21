---
status: DRAFT (red-team hardened 2026-06-21)
last_updated: 2026-06-21
supersedes_planning: docs/superpowers/plans/2026-06-18-secondary-surface-trust-slim.md (PR-6 stub)
authority: docs/adr/ADR-023-investment-event-persistence.md (ACCEPTED) — REQUIRES amendment to decision 5 (see § ADR amendment)
---

# Investment-Round Persistence Backbone (ADR-023 L3b) — Design Spec

**Goal:** Flip `POST /api/investments/:id/rounds` (501) into a backed,
fund-scoped, idempotent create+list+read **with an append-only supersede
correction path**, so the feature can ship enable-able (not blocked
flag-off). `enable_investment_rounds` still defaults OFF; enabling is a soak/ops
gate, no longer an architectural block.

**Authority:** Architecture is fixed by
[ADR-023](../../adr/ADR-023-investment-event-persistence.md) (architect +
`phoenix-precision-guardian` sign-off 2026-06-17), **with one amendment**:
decision 5 (append-only, no correction, flag-off-until-a-separate-tranche) is
changed to **append-only WITH supersede correction in tranche 1** (see
§ ADR amendment). All other ADR decisions stand unchanged.

---

## Red-team revisions (2026-06-21)

This spec was stress-tested via the RedTeam ParallelAnalysis workflow. The
panel's grounded findings (one agent; the rest of the panel failed to execute
and is discarded — see § Process note) plus a direct adversarial pass changed
four things from the first draft:

1. **Precondition migration split out as a standalone precursor PR-0.** It is the
   only atom that mutates existing rows / can fail at deploy with the flag off;
   it must not be coupled to flaky feature CI. (Was bundled.)
2. **Supersede correction folded INTO the feature PR** (user decision) so M1
   delivers a real, enable-able capability instead of dormant flag-off plumbing
   that strands behind an unscheduled tranche. (Reverses ADR decision 5 — see
   amendment.)
3. **Hygiene scope cut to reversible items only** (user decision): worktree
   prune + merged-branch delete + doc archive fold in; the 136-entry **stash
   pile is left untouched** (irreversible `git stash drop`, no reflog net,
   heterogeneous real-WIP-vs-backup contents — no safe automation).
4. **Test-isolation + idempotency-scope notes added** (append-only test rows
   accumulate; `UNIQUE (fund_id, idempotency_key)` interaction with
   investment-scoped routes documented).

---

## Roadmap context (why this is the lead milestone)

The two prior planning docs have **substantially shipped**. Reconciled against
main `c27499f4`:

| Plan item | Status | Evidence |
|---|---|---|
| PR-1 firebreaks (quarantine + dead-nav + Branch A) | DONE | #881 |
| Mock-surface pages full delete | DONE | #884 |
| MOIC live-primary + provenance (Phase 7 / PR-3) | DONE | #888 |
| LP dashboard mount on makeApp | DONE | #889 |
| Release-gate teardown hygiene | DONE | #890 |
| Snapshot/version archive + orphan cleanup (PR-5/6) | DONE | #885/#886/#887 |

**Genuinely remaining:** the product backbone (investment-event persistence —
ADR written #877, nothing built), operating objects `assumption`/`comment`,
generalized provenance (PR-2/PR-4, MOIC point-solved only), and the route-mount
parity CI guard (PR-5 completion). Investment-event is the lead per the user's
prioritization (highest leverage: upstream of reserves/valuation/cap-table).

**Adversarial caveat (recorded, accepted by the user):** leading with this means
deferring **M4 (route-mount parity guard)**, which would give *immediate*
recurrence-prevention for the makeApp/registerRoutes split-brain class that
caused the real LP-404. Folding supersede into M1 (so it ships enable-able)
mitigates the "no value" objection that motivated reconsidering the lead.

**Stale-worktree consequence:** worktree
`C:/dev/Updog_restore_lp_dashboard_runtime`
(`codex/lp-dashboard-runtime-route-gap` @ `a15b6cbc`) shares its commit title
with merged #889 — **superseded**, pruned in this milestone's hygiene **after**
verifying containment (see hygiene step).

### Roadmap tail (separate future milestones)
- **M2** — operating objects `assumption` + `comment` (backend-first; red-team
  JSONB-conflict / polymorphic-target first).
- **M3** — generalized `data-provenance-v1.contract.ts` + `ProvenanceBoundary`
  + reports/cashflow/forecast trust migration (PR-2/PR-4).
- **M4** — route-mount parity CI guard: promote
  `tests/unit/server/route-surface-inventory.test.ts` into a CI gate with an
  `ALLOWED_UNMOUNTED` allowlist. **Pull-forward candidate** if investment-rounds
  slips — it is cheap and prevents a known prod-bug class.

(The standalone "supersede tranche" is no longer a tail item — it is folded into
M1.)

---

## ADR amendment (decision 5)

**Before:** append-only, NO update/delete and NO correction route in tranche 1;
`enable_investment_rounds` MUST stay OFF in prod until a separate supersede
tranche ships.

**After (this spec):** append-only **with a supersede correction edge in tranche
1** — a recorded round is still immutable, but an erroneous round is corrected by
appending a *superseding* round (mirroring `cashFlowEvents.supersedesEventId`),
never by mutation. Because a correction path now exists, the
flag-off-until-separate-tranche guardrail is satisfied within M1;
`enable_investment_rounds` still **defaults OFF** and enabling remains a
soak/ops decision, but is no longer architecturally blocked.

**Required before implementation:** record this as an amendment in ADR-023 with
architect re-sign-off on decision 5. `phoenix-precision-guardian` §8 (money/
precision) sign-off is **unaffected** — supersede adds a self-FK and reuses the
existing `NUMERIC(20,6)` money columns; no new money semantics.

---

## Preconditions (verified on head `c27499f4`, 2026-06-21)

- `investments.fund_id` **nullable** — `shared/schema/portfolio.ts:65`. Composite
  FK target `UNIQUE (id, fund_id)` is valid even with nullable `fund_id` (`id` is
  unique → the pair is always distinct); a NOT-NULL round `fund_id` can never
  match a NULL-fund investment, so round-create also rejects NULL-fund parents
  (400) as belt-and-suspenders.
- 501 routes intact — `server/routes/investments.ts:143` (`/rounds`), `:181`
  (`/cases`).
- 501 asserted — `tests/integration/investment-scenario-capability.test.ts:15-25`
  (rounds), `:27-37` (cases).
- `enable_investment_rounds` flag absent; `useCreateRound` / `investment_rounds`
  table / contract / service absent. Client scaffolding present
  (`new-round-dialog.tsx` + `lib/investment-round-{defaults,utils}.ts` +
  `types/investment-rounds.ts`).
- Migration template — `server/migrations/20260616_operating_object_tasks_v1.{up,down}.sql`.

---

## PR-0 — Precondition migration (standalone precursor, tiny)

Land and green **before** the feature PR. Journaled `up`/`down`.
- Add `UNIQUE (id, fund_id)` on `investments` (cheap; `id` already unique).
- **No** `fund_id NOT NULL` backfill — round-create rejects NULL-fund parents
  with 400 instead (lower-risk than mutating existing rows).
- `down` drops the unique constraint only.
- Acceptance: migration applies + reverts clean against Testcontainers Postgres;
  no existing investment delete path breaks.

---

## PR-1 — Feature PR (investment rounds + supersede + safe hygiene)

### Step 1 — `investment_rounds` table (ADR decisions 2/3/7; findings B/C)
Columns per the ADR column table: `NUMERIC(20,6)` money cols; `currency
varchar(3) DEFAULT 'USD'`; `security_type varchar(32)` CHECK; `idempotency_key`,
`request_hash varchar(64)`, `created_by` FK→`users.id` nullable, timestamps.
**Plus (amendment):** `supersedes_round_id integer NULL REFERENCES
investment_rounds(id) ON DELETE RESTRICT`.
Constraints: indexes `(fund_id, investment_id)`, `(investment_id, round_date
DESC)`; `UNIQUE (fund_id, idempotency_key)`; composite FK `(investment_id,
fund_id) → investments(id, fund_id)` ON UPDATE/DELETE RESTRICT; **partial
`UNIQUE (supersedes_round_id) WHERE supersedes_round_id IS NOT NULL`** (a round
may be superseded at most once — no correction fork). `graduation_rate` +
share-mechanics deferred (ADR 5a). Schema test proves
delete-of-investment-with-rounds is blocked.

### Step 2 — Shared Zod contract (ADR decision 8)
`shared/contracts/investments/investment-round.contract.ts`. **Imports**
`DecimalStringSchema`/`MoneyStringSchema` (never redeclares). Create body adds
optional `supersedesRoundId: z.number().int().positive().optional()`.

### Step 3 — Service seam (ADR decision 4; finding A)
`server/services/investments/investment-round-service.ts` (route must not import
`../db`/`../storage`). Idempotency: required `Idempotency-Key` → 428 if missing;
on `UNIQUE (fund_id, idempotency_key)` conflict, compare stored `request_hash`
(sha256 of canonical body via `import-reconciliation-service.ts`): equal →
replay stored row; differ → 409. **Supersede:** when `supersedesRoundId` is set,
load the referent → 404 if absent, 400 if different investment, 409 if already
superseded (partial unique) → then insert the correction row pointing at it.
"Current" rounds = rows not referenced by any `supersedes_round_id`.

### Step 4 — Routes (ADR decision 6; finding D)
`/api/investments/:investmentId/rounds` — **create + list + read** (create
accepts `supersedesRoundId` for correction). Every route (read AND write):
load investment → 404 → derive `investment.fund_id` →
`enforceProvidedFundScope(req, res, fundId)` → 403 → act. Body-supplied
`fund_id` (if any) must match derived or 400. List returns current
(non-superseded) rounds by default. Mount on **both** `server/app.ts` +
`server/routes.ts`.

### Step 5 — Integration test rewrite (finding E)
Rewrite `tests/integration/investment-scenario-capability.test.ts`: rounds
501→**201** with FULL valid payload + `Idempotency-Key`; add **403** cross-fund,
**404** unknown-investment, **428** missing-key, **409** key-reuse-different-body,
and a **supersede** case (create → supersede → list shows corrected, second
supersede of same round → 409). `cases` stays **501**.
**Test isolation:** append-only rows have no delete route → truncate
`investment_rounds` (or own-pool close) in teardown so rows don't accumulate
across files (apply the #890 release-gate teardown lesson).

### Step 6 — `useCreateRound` hook (ADR decision 8; finding F)
Client hook + serializer (currency label→ISO-4217, number→`DecimalString`,
mirror `cash-event-edit-model.ts`). Focused unit test. No live UI mount
(deferred). Test-only hook usage is lint-tolerated (L2a precedent).

### Step 7 — Flag (ADR Tier-3; R10)
`enable_investment_rounds` via the registry/generation path, **default OFF**,
with `expiresAt`. No longer architecturally blocked from enabling (correction
path exists).

### Step 8 — Folded hygiene (REVERSIBLE items only)
- **Worktree prune** — only after verifying containment: `git -C <wt> status
  --porcelain` is clean AND no commits ahead of the merged SHA. Prune
  `lp_dashboard_runtime` (vs #889), `pr864-ci-fix`, `pr881_ci`.
- **Delete merged local branches** (recoverable via reflog/remote).
- **Archive the 3 loose planning docs** —
  `docs/CRITICAL-REVIEW-secondary-surface-governance.md` + the two
  `docs/superpowers/plans/2026-06-1{7,8}-secondary-surface-*.md` — **only after**
  running the full CLAUDE.md Archive Gate **per file** (git-log landed/obsolete +
  grep feature-gone + not-an-active-handoff) and citing the three checks for each
  in the PR body. Apply the Derivability Test to CRITICAL-REVIEW specifically (it
  is a non-derivable critique — keep if it fails the test).
- **EXCLUDED:** the 136 stashes — left untouched (irreversible drop; no safe
  automation; revisit as a separate human-reviewed pass if ever).

---

## Explicitly deferred (named, NOT in M1)
- Live `/portfolio` round-dialog mounting behind `enable_investment_rounds`.
- Performance cases, valuation/ownership/liq-pref, cap-table, bulk ops — stay
  **501** with explicit unsupported tests.
- `graduation_rate` + share-mechanics columns (additive nullable later, 0..1
  ratio `numeric(5,4)`).
- Stash-pile triage (separate human-reviewed pass).

---

## Acceptance criteria
1. PR-0 lands first: `UNIQUE (id, fund_id)` on `investments`, applies+reverts clean.
2. `POST .../rounds` → **201** with valid payload + `Idempotency-Key`; missing
   key → **428**; conflicting reuse → **409**; benign retry replays stored row.
3. Supersede: create→supersede→list shows the correction; a second supersede of
   the same round → **409** (partial unique).
4. GET list/read enforce fund scope: cross-fund → **403**, unknown investment →
   **404** (no read-path IDOR).
5. `cases` stays **501**; its test stays green.
6. Schema test proves delete-of-investment-with-rounds is **blocked**.
7. Money columns `NUMERIC(20,6)`; contract imports (not redeclares)
   `DecimalStringSchema`; no JS-number money field.
8. Route imports no `../db`/`../storage` (`guard:route-imports` green); logic in
   the service.
9. `enable_investment_rounds` exists, **off**, with `expiresAt`.
10. `useCreateRound` + serializer unit-tested; integration teardown truncates
    `investment_rounds`; `npm run check` + targeted vitest + `npm run lint` green.
11. Hygiene: worktrees pruned **after** containment check; 3 docs archived **with
    per-file Archive-Gate evidence in the PR body**; stashes untouched.
12. ADR-023 amended (decision 5) with architect re-sign-off **before** merge.

---

## Process note
The RedTeam parallel dispatch under-performed: 6 of 8 general-purpose agents
narrated file reads without issuing tool calls, and one hallucinated a different
spec/ADR entirely. Only the hygiene/reversibility agent (grounded in the real
CLAUDE.md) produced usable output; the remaining adversarial angles were
completed by the orchestrator directly. Recorded so the "red-teamed" label is
not over-claimed.

## Self-review
- **Placeholders:** none — every step cites an ADR decision / verified file:line;
  M2–M4 are scoped stubs (separate milestones).
- **Consistency:** supersede fold is recorded as an explicit ADR amendment, not a
  silent contradiction; money rules unchanged; hygiene scope matches the
  reversible-only decision.
- **Scope:** PR-0 (tiny migration) + PR-1 (feature incl. supersede + safe
  hygiene). Larger than the first draft by the supersede edge — accepted to
  deliver enable-able value.
- **Userspace safety:** flag OFF by default; `cases` 501 preserved; no existing
  route behaviour changes until the flag flips.
