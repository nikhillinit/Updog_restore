# Debate synthesis — Prod schema-drift reconciliation: the 6 contested questions

Run inline (Claude acting as the three comparator voices + synthesis) rather
than via the Hermes CLI debate. Each position is grounded in code read this
session (file:line cited). Voices: **A** = correctness/systems lens, **B** =
pragmatic/implementer lens, **C** = adversarial skeptic (defects from locked
decisions). Brief: `.hermes-debate-brief.md`.

Verified substrate (this session):

- `fund-moic.ts:114-142,177` + `rounds-to-model-evidence-service.ts:506-524` +
  `fund-calculation-mode-service.ts:304-324` — the rounds degrade path.
- `scripts/db-push-core.mjs` — `findMissingSentinels` diffs constraint/index
  NAMES vs `pg_constraint.conname` / `pg_indexes.indexname`.
- `drizzle.config.ts:8-14` — `out: './migrations'`,
  `schema: ['./shared/schema.ts', ...]` → `./migrations` is GENERATED FROM
  `shared/schema`.

---

## M1 — Bundle vs split

- **A:** Bundle defensible — the guardrails (mount-parity test,
  `./migrations`-vs-schema differ) are what prevent recurrence; shipping the fix
  without them re-opens the hole. But Lane E (`testcontainers-migration.ts`
  rewire) must be an isolated commit with its own proof gate, never interleaved
  with the fix.
- **B:** Split. The prod-fix (runner + M1–M4 manifests + shape audit +
  mount-parity test) is independently shippable and clone-verifiable. Lane E
  touches the test-DB creation path for the WHOLE repo — different blast radius,
  different reviewers (M4 domain-locked).
- **C (defect from Decision-1):** "One PR" optimizes for narrative, not rollback
  cost. The prod apply is the only irreversible step; bundling repo/CI churn
  with it means a CI-only revert also reverts your guardrails. R11 already split
  deletions out — the bundle is already not "one."
- **VERDICT — SPLIT along the existing R11 seam:**
  - **PR-1 (the fix + recurrence guard):** runner + 4 manifests + shape-aware
    audit + mount-parity regression test + `./migrations`-vs-`shared/schema`
    differ. Land GREEN. Prod apply happens OFF PR-1 (operator-gated step).
  - **PR-2 (canonicalize):** fold `server/migrations`, Lane E rewire, `db:push`
    prod-guard — after PR-1 is proven, Lane E as its own commit + independent
    green-clone proof.
  - Honors user intent (fix+guards still bundled — the recurrence-prevention
    pair) while removing test-infra blast radius from the prod-fix critical
    path. If user holds one PR: mandate Lane E as an isolated commit with its
    own proof gate.

## M2 — Exact shape-aware idempotency predicate

- **A:** SHAPE = {table present} ∧ {all expected `conname` present} ∧ {all
  expected `indexname` present} ∧ {all expected columns present,
  type+nullability match}.
- **B:** Don't gold-plate. The load-bearing failure is 42830 = a missing
  FK/unique constraint and the CREATE INDEX silently skipped after it —
  `findMissingSentinels` ALREADY catches exactly that by name. `CREATE TABLE` is
  atomic; columns rarely partially-apply. Column diff is phase-2, not a blocker.
- **C:** Both miss R13. "Populated" is NOT the refuse trigger — "missing DDL is
  non-additive-safe" is. Missing index → `CREATE INDEX [CONCURRENTLY]` (safe on
  populated). Missing FK → `ADD CONSTRAINT ... NOT VALID` then `VALIDATE`
  (safe). Missing nullable column → `ADD COLUMN` (safe). Only type-change /
  `NOT NULL`-with-violating-rows / drop-rename require refuse.
- **VERDICT — implementable predicate, reuses `findMissingSentinels`:**
  1. SHAPE = {table exists?} + {missing constraints/indexes via
     `findMissingSentinels`} + {missing columns via `information_schema.columns`
     diff}.
  2. **SKIP** iff table exists ∧ no missing sentinels ∧ no missing columns.
  3. **APPLY-MISSING-DDL** iff every delta is additive-safe (`CREATE INDEX`,
     `ADD CONSTRAINT NOT VALID`+`VALIDATE`, `ADD` nullable column) — regardless
     of row count.
  4. **REFUSE-FOR-HUMAN** iff any delta is non-additive (type change, `NOT NULL`
     on a column with violating rows, drop/rename) ∧ table is populated.
  - Manifest "expected objects" must enumerate constraint names + index names +
    column specs (R8). Makes R2's "absent-OR-malformed" concrete without a new
    differ.

## M3 — Is "`./migrations` canonical" coherent?

- **A:** Reframe: `shared/schema` = declarative SHAPE target; `./migrations` =
  imperative APPLY LEDGER to reach it on a drifted DB. Not competing sources.
  Binding invariant: "apply all `./migrations` to empty ⇒ catalog ==
  `shared/schema`."
- **B:** As written, "canonical = ./migrations" will mislead the next operator.
  Blessed PROD-APPLY artifact = `./migrations` (via runner); blessed AUTHORING
  source = `shared/schema`; `db:push` FROZEN for prod (R9). Say exactly that in
  the runbook.
- **C:** The synthetic-clone test does NOT fully close it — `./migrations`
  contains hand-authored drift files (0013/0014/0019) drizzle generate would
  never emit, so file-equivalence fails forever. Need the WEAKER invariant
  (shape-equivalence, not file-equivalence) + a header marker (`-- @generated`
  vs `-- @drift-patch`) so the R3 differ and a "don't hand-edit generated files"
  lint can both function.
- **VERDICT:** `shared/schema` = SHAPE source of truth; `./migrations` =
  applied-SQL ledger; runner = blessed prod-apply path; `db:push` frozen for
  prod. Coherence enforced by a **shape-equivalence** clone test (apply
  `./migrations` to empty ⇒ introspected catalog == `shared/schema` target), NOT
  file-equivalence. Add `-- @generated` / `-- @drift-patch` header markers so
  the R3 differ + a no-hand-edit-generated lint work. This is the one rule + one
  command Decision-2/R3 were missing.

## M4 — Rounds silent-degrade contract (DOMAIN-LOCKED: investment-rounds sign-off)

- **EMPIRICAL CORRECTION to R1 (verified this session):** absent rounds tables
  do NOT serve a wrong number. Catch (`rounds-to-model-evidence-service.ts:506`)
  → degraded evidence → `resolveMoicActionability` = `non_actionable`
  (`fund-calculation-mode-service.ts:322-324`) → `usingCandidateRankings=false`
  (`fund-moic.ts:141`) → response serves `sources.legacy` (`fund-moic.ts:142`).
  The response ALSO carries
  `roundEvidenceSummary.warningCodes = ['ROUND_ADAPTER_FAILED']`
  (`fund-moic.ts:94-102,177`). So it FAIL-SAFES to the conservative legacy
  answer WITH a surfaced warning — not a fabricated candidate number.
- **A:** Server contract is already correct and defensible (fail-safe +
  warning). Keep the degraded-200; the runtime contract test pins
  `provenance.mode='legacy'` + `warningCodes` contains `ROUND_ADAPTER_FAILED` on
  empty DB.
- **B:** The narrow real risk is CLIENT-side: does `use-moic.ts` read/display
  `roundEvidenceSummary.warningCodes`, or drop it? If dropped, the user sees
  legacy numbers with no signal the rounds feature degraded. Verify the client
  consumes the warning — that is the actual silent surface, not the server 200.
- **C:** Even fail-safe-to-legacy is wrong if the operator BELIEVES rounds are
  live. A degraded-200 that the client ignores is operationally identical to a
  silent failure. Argue for a loud typed error when `?contract=v2` is requested
  but rounds tables are absent/malformed — "you asked for v2, v2 is unavailable"
  — rather than a quiet downgrade.
- **CLIENT CLOSED (verified this session):** the warning IS rendered end-to-end
  — `client/src/pages/fund-model-results-moic-analysis.tsx:67` reads
  `warningCodes`, and `:114-118` maps each (incl. `ROUND_ADAPTER_FAILED`) to a
  visible `Badge`. So absent rounds tables → user sees LEGACY rankings + a
  visible warning badge. NOT silent at any layer.
- **VERDICT (advisory — needs investment-rounds specialist sign-off):** KEEP the
  server's fail-safe-to-legacy + warning (correct, not a bug); the client
  already surfaces it. R1's "live silent wrong answer" is REFUTED — it is
  observable end-to-end. Residual is UX only: the badge shows the raw code
  `ROUND_ADAPTER_FAILED`, not a plain-language "rounds feature unavailable;
  showing legacy" — low severity. M4 work reduces to: (1) runtime contract test
  pinning the degraded payload on empty DB; (2) optional friendlier badge copy.
  Feed back to the handoff: **re-rank #17–18 from "C1-SILENT/LIVE" to "C2 —
  observable graceful degrade"** (still domain-locked, but NOT a latent-failure
  priority).

## M5 — Prod-apply transaction & recovery model

- **A:** Per-manifest txn beats single-mega-txn: one txn across M1–M4 holds DDL
  locks on live `funds`/`investments`/`portfolio_companies` (R7) for the whole
  run and rolls back ALL on any failure, discarding progress you'd want to keep.
- **B:** Ledger is the resume source of truth: (manifest name, ordered file
  checksums, per-statement hashes, started_at, committed_at, applied_by,
  target_db identity). Resume: skip manifests with a matching committed row,
  re-run from first uncommitted; M2 idempotency makes re-running a
  never-committed manifest safe.
- **C:** The FK topological order WITHIN M4 (vehicles →
  cash_flow_events/valuation_marks → lp_metric_runs → ...) means a mid-M4
  partial leaves a broken LP graph — UNLESS each manifest is ONE atomic txn
  (failure rolls the whole manifest back). Then forward-only resume = manifest
  granularity; no partial graph possible.
- **VERDICT:** ONE txn PER MANIFEST (atomic; FK order lives inside the txn so
  failure rolls the whole manifest back — no partial LP graph). Ledger records
  the fields above. `pg_advisory_lock` around the run +
  `lock_timeout`/`statement_timeout`, fail-fast on contention. Forward-only
  resume skips committed manifests, resumes from first uncommitted. No rollback
  after a manifest commits. Low-traffic window (R7). "Reversible-by-design"
  becomes honest: forward-recoverable, not reversible.

## M6 — Open completeness (adversarial sweep)

1. **OBSERVABILITY GAP (biggest miss):** no evidence anyone can tell a
   latent-500 fired in prod today — triage is static (reading `makeApp`), not
   "we saw N 5xx on /api/cohorts." Pull prod/Vercel 5xx logs for the 14 affected
   routes as a PRE-apply baseline, re-query POST-apply. Without it you prove
   pg_catalog, never the symptom.
2. **M4 client-consumption** (above): verify `use-moic.ts` surfaces the warning.
3. **R12 extension privilege:** confirm precheck covers `CREATE EXTENSION` —
   Neon restricts extensions; a manifest needing pgcrypto/uuid fails at apply
   with no precheck signal.
4. **Post-apply smoke must use a fund WITH rounds data** + `?contract=v2`; an
   empty fund takes the same degraded branch whether tables exist or not (tests
   nothing).
5. **Re-validate FK graph AFTER the R2 shape-shrink:** if the shape audit drops
   already-present tables from a manifest, re-check that no later statement
   depends on a skipped table's missing index/constraint.

### Strongest single objection per voice

- **A:** The plan proves the fix in `pg_catalog` but never proves the SYMPTOM
  existed or cleared in prod — instrument first.
- **B:** Lane E's test-infra rewire can turn the suite green against a migration
  world prod doesn't use — false confidence worse than the original bug. Isolate
  it.
- **C:** "Reversible-by-design" and "`./migrations` canonical" are asserted, not
  enforced; until a failing CI command backs each, they are documentation, not
  guarantees.

---

## Net deltas to the locked plan

1. **SPLIT** into PR-1 (fix+recurrence-guard) / PR-2 (canonicalize+Lane E) along
   the R11 seam.
2. **M2 predicate** keyed on additive-safe-vs-not (not populated-vs-empty),
   reusing `findMissingSentinels`.
3. **M3** reframed: `shared/schema` = shape source; `./migrations` = ledger;
   enforce shape-equivalence (not file-equivalence) +
   `@generated`/`@drift-patch` markers.
4. **M4** R1 REFUTED: degrade is observable end-to-end (server fail-safes to
   legacy + warning; `fund-model-results-moic-analysis.tsx:67,114-118` renders
   it as a Badge). Re-rank #17–18 from C1-SILENT/LIVE to **C2 — observable
   graceful degrade** (still domain-locked). Residual is UX-copy only.
5. **M5** one-txn-per-manifest with FK order inside the txn; ledger-driven
   forward-only resume.
6. **M6** add a prod 5xx log baseline/post-check; fix the smoke to use a
   rounds-populated fund.
