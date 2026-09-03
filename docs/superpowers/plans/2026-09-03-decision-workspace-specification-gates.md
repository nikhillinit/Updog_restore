---
status: PROPOSED
audience: agents
last_updated: 2026-09-03
owner: Repository Owner
categories: [product-specification, decision-workspace]
keywords: [forecast-variance, scenario-comparison, reserve-decision, ADR-033]
---

# Decision Workspace Specification-Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce five owner-approved, source-pinned product specifications and
five separate implementation plans for forecast variance, scenario comparison,
marginal reserve admission, deployed-reserve MOIC, and reserve evidence-linked
decisions.

**Architecture:** This plan implements specification resolution, not Program C
product code. Each task maps existing contracts and persistence, writes one
normative specification with no open product decision, binds approval to exact
source plus exact spec-body bytes, and then invokes `superpowers:writing-plans`
for the resulting product implementation plan.

**Tech Stack:** TypeScript, React, Express, PostgreSQL/Drizzle, existing
analysis-reference and operating-object services, Vitest, Playwright,
Testcontainers, and Phoenix truth cases.

**Spec:** `docs/superpowers/plans/2026-09-03-updog-reconciled-program-plan.md`,
existing dual-forecast/scenario/reserve contracts, and
`docs/adr/ADR-033-marginal-next-dollar-reserve-moic.md`.

## Global Constraints

- Specification work may proceed before Program A activation. Program C product
  implementation, merge, deployment, and serving admission wait for Program A
  A4 GO, verified activation/containment, and final bound runtime identity.
- C3b implementation also waits for Program B's admitted exact-routing or typed-
  refusal contract.
- This plan creates specifications and implementation plans only. It authorizes
  no product-code change, migration, flag change, merge, provider action,
  deployment, promotion, or production mutation.
- A plan, review, approval, or evidence record is not implementation or
  production authority.
- All mutations require idempotency. All updates require optimistic locking.
  All cursors require validation. All queue jobs require timeouts.
- Every future test command runs with `TZ=UTC`. Financial implementation plans
  require `npm run phoenix:truth` and a named expected-output assertion.
- Node/npm contract is Node 22.23.2 and npm 10.9.2.
- Financial deltas, MOIC, and IRR are server-owned. The client renders typed,
  source-versioned results and never recomputes them.
- Every evidence target is fund-scoped, access-checked, immutable, and hash-
  verified before link creation.
- Tactyc is a product reference only. It supplies no economic truth or parity
  requirement.
- Reuse existing engines, routes, contracts, analysis references, decisions,
  tasks, and evidence links before adding a new surface.

## Common Approval Contract

Each specification file starts with:

```yaml
---
status: DRAFT
source_sha: <40 lowercase hex characters>
body_sha256: <64 lowercase hex characters>
approval_sha256: <64 lowercase hex characters>
scope: <one exact capability identifier>
source_paths:
  - <first inspected product path>
reviewed_by: <reviewer identity>
reviewed_at: <UTC timestamp>
approved_by: <repository owner identity>
approved_at: <UTC timestamp>
approval:
  state: approved
---
```

The body digest is SHA-256 of every byte after the closing `---` line and its
newline, exactly the second capture of the Task 6 validator regex
`^---\n([\s\S]*?)\n---\n([\s\S]*)$`. `approval_sha256` is SHA-256 of
`JSON.stringify` over an object whose keys are inserted in this exact order
with no whitespace: `source_sha`, `source_paths`, `scope`, `body_sha256`,
`reviewed_by`, `reviewed_at`, `approved_by`, `approved_at`, `approval_state`.
Generation and validation share that one algorithm; the digest field itself is
excluded, so it is not self-referential. Any body, source, scope, reviewer,
owner, or timestamp edit invalidates approval.

At approval time:

1. `source_sha` equals the exact product-source baseline used for inspection;
2. every `source_paths` entry is a unique, lexicographically sorted,
   placeholder-free repository-relative tracked file that exists at both
   `source_sha` and the approval head;
3. every path is byte-identical between `source_sha` and the approval head;
4. `reviewed_at` and `approved_at` are real UTC instants in canonical
   `YYYY-MM-DDTHH:mm:ssZ` form;
5. a fresh reviewer approves the exact body digest;
6. the repository owner records approval fields;
7. if any inspected product path changed since `source_sha`, the spec returns to
   `DRAFT` and is re-reviewed.

Before Task 1 writes the first `docs/specs/*.md`, confirm
`TZ=UTC npm run docs:routing:generate` and `docs:routing:check` accept these
frontmatter keys under `docs/specs/`; if the router schema rejects
`source_sha`, `body_sha256`, `approval_sha256`, `scope`, `source_paths`,
`reviewed_by`, `reviewed_at`, `approved_by`, `approved_at`, or `approval`,
extend the router schema in the same specification's implementation plan so
Task 6 validation and routing agree.

Every specification body contains these sections in order:

```markdown
## Goal
## Non-Goals
## Existing Surfaces and Actual Consumers
## Normative Product Decisions
## Request and Response Contracts
## Authoritative Inputs and Source Versions
## Persistence and Hash Semantics
## Idempotency, Concurrency, and Recovery
## Refusal Matrix
## Authorization and Fund Ownership
## UI States and Accessibility
## Exact File Manifest
## Exact Test Manifest
## Admission and Rollout Gates
```

## Shared Evidence-Linked Decision Command

C1 introduces one atomic command reused by C2 and C3c:

```http
POST /api/funds/:fundId/evidence-linked-decisions
Idempotency-Key: <required>
Content-Type: application/json
```

```ts
type EvidenceLinkedDecisionCreate = {
  title: string;
  recommendation: string;
  followUpOwnerId?: number;
  followUpDate?: string;
  target:
    | { kind: 'analysis_reference'; id: number }
    | { kind: 'internal_economics_run'; id: number };
};
```

One database transaction validates same-fund ownership/access, creates the
decision, creates its evidence link, and stores one durable idempotent response.
Any validation or insert failure rolls back both rows. Same-key/same-material
replays; same-key/different-material conflicts. Creation has no
`expectedVersion`; later decision transitions retain existing
`If-Match`/PostgreSQL `xmin` tokens.

The C1 implementation plan must create the shared contract/service, add the
route to the existing decisions router, and update the repository's route
manifest, mount/policy registry, the idempotency regex registry
`server/lib/database-backed-idempotency-routes.ts`, and tests. C2 and C3c
reuse the command without adding another route.

---

### Task 1: Specify Forecast Variance Explanation to Decision

**Files:**

- Create: `docs/specs/C1-forecast-variance-decision-workflow.md`
- Create later with `superpowers:writing-plans`:
  `docs/superpowers/plans/2026-09-03-forecast-variance-decision-workflow.md`
- Inspect and list as future implementation surfaces:
  `server/routes/dual-forecast.ts`,
  `shared/contracts/dual-forecast/dual-forecast-response.contract.ts`,
  `client/src/components/dashboard/dual-forecast-dashboard.tsx`,
  `client/src/pages/forecasting.tsx`, `client/src/app/app-routes.tsx`,
  `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts`,
  `shared/schema/internal-analysis.ts`,
  `server/services/internal-analysis/analysis-checkpoint-service.ts`,
  `server/routes/internal-analysis.ts`,
  `server/services/operating-objects/decision-service.ts`,
  `server/services/operating-objects/decision-evidence-link-service.ts`,
  `shared/contracts/operating-objects/evidence-linked-decision.contract.ts`,
  `server/services/operating-objects/evidence-linked-decision-service.ts`,
  `server/routes/operating-object-decisions.ts`,
  `client/src/hooks/useDecisions.ts`

- [ ] **Step 1: Record exact current source behavior**

Document that the dual-forecast V2 block is absent while Current Forecast is
off/shadow. When present, serving status is `live | held`; engine status is
`available | indicative | unavailable | failed | held`.
`AnalysisBasis.forecastFundSnapshotId` already points to
`fund_snapshots.type = CURRENT_FORECAST_V2`.

- [ ] **Step 2: Lock the C1 status and refusal mapping**

Keep the contract axes separate:

```ts
type ForecastVarianceState = {
  servingStatus: 'live' | 'held';
  engineStatus:
    | 'available'
    | 'indicative'
    | 'unavailable'
    | 'failed'
    | 'held';
  basisStatus: 'current' | 'stale' | 'mixed_basis';
};
```

Mapping rules:

1. preserve server serving and engine status independently;
2. `mixedBasisAtSave` -> `basisStatus = mixed_basis`, no decision action;
3. stale source/hash -> `basisStatus = stale`, no decision action;
4. otherwise `basisStatus = current`;
5. absent V2 block -> no variance object, not a fabricated `off` status.

- [ ] **Step 3: Lock the authoritative driver contract**

The server may emit only drivers backed by pinned source data: check size,
entry valuation, ownership, pace, allocation mix, graduation/exit assumptions,
follow-on participation, deployed/remaining reserves, fees/expenses, recycling,
and blockers. Each driver includes source reference, source version, before,
after, delta, unit, and explanation. Unavailable drivers are omitted with a
top-level typed omission list; the client never estimates a delta.

- [ ] **Step 4: Lock forecast evidence persistence**

Reuse `forecastFundSnapshotId`. The analysis checkpoint service must load the
same-fund `CURRENT_FORECAST_V2` snapshot and verify `inputHash`, `resultHash`,
and `assumptionsHash` before save. Do not introduce another forecast-reference
table.

- [ ] **Step 5: Specify decision creation and recovery**

Use the shared atomic evidence-linked decision command. The target is the saved
`analysis_reference`. Decision title/recommendation and optional follow-up fields
remain existing contract fields. Any evidence validation or link insert failure
returns zero decision/link rows.

- [ ] **Step 6: Write exact C1 tests in the spec**

Name unit/integration/Playwright files for serving/engine/basis mapping,
source/hash verification, same-key replay, different-material conflict,
cross-fund denial, inaccessible evidence denial, transactional rollback,
client no-calculation assertion, and keyboard/screen-reader states.

- [ ] **Step 7: Review, approve, and generate the implementation plan**

Run the common approval process. Then invoke `superpowers:writing-plans` to
create the named C1 implementation plan with exact files, TDD steps, commands,
and commits.

---

### Task 2: Specify Scenario Comparison to Decision

**Files:**

- Create: `docs/specs/C2-scenario-comparison-decision-workflow.md`
- Modify in the specification:
  `docs/adr/ADR-022-fund-scenario-architecture.md`
- Create later with `superpowers:writing-plans`:
  `docs/superpowers/plans/2026-09-03-scenario-comparison-decision-workflow.md`
- Inspect and list as future implementation surfaces:
  `shared/contracts/fund-scenario-comparison-v1.contract.ts`,
  `shared/contracts/fund-scenario-sets-v1.contract.ts`,
  `shared/schema/fund.ts`,
  `server/services/fund-scenario-comparison-service.ts`,
  `server/services/fund-scenario-comparison-lineage-service.ts`,
  `client/src/pages/fund-scenario-workspace.tsx`,
  `client/src/components/fund-results/scenario-comparison-evidence.ts`,
  `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts`,
  `shared/schema/internal-analysis.ts`,
  `server/services/internal-analysis/analysis-checkpoint-service.ts`,
  `server/routes/internal-analysis.ts`, `shared/schema/operating-objects.ts`,
  decision/task evidence services and routes, and exact client hooks

- [ ] **Step 1: Lock V1 comparison scope**

V1 scope is `economics_v1` only. It compares metrics already supplied by the
current comparison service. Deployment, reserve, capital-call, concentration,
and blocker effects are omitted until an existing authoritative result supplies
them. Do not add a requested-dimension parameter or a new
`UNSUPPORTED_COMPARISON_DIMENSION` code. Preserve existing
`UNSUPPORTED_OVERRIDE_TYPE` behavior.

- [ ] **Step 2: Lock exact source identity**

Use scenario-set ID, source-config ID/version, comparison variant IDs,
snapshot/run IDs, scenario snapshot state hash, input hash, and result hash.
The baseline object has no variant ID in the current contract; identify it only
as the comparison's `baseline` field. Do not invent a baseline ID or a
scenario-set version column.

Reconcile `docs/adr/ADR-022-fund-scenario-architecture.md` with actual supported
override types: `fee_profile`, `allocation`, `sector_profile`, and
`methodology`. Resolve the current
`shared/schema/fund.ts` TypeScript union omission for `methodology` explicitly
in the future implementation file manifest.

- [ ] **Step 3: Lock scenario comparison evidence persistence**

Extend the existing analysis-reference contract/schema with one nullable,
versioned scenario-comparison basis object:

```ts
type ScenarioComparisonBasisV1 = {
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  variantIds: string[];
  economicsSnapshotId: number;
  economicsRunId: number;
  scenarioSnapshotId: number;
  scenarioRunId: string;
  modelInputsAsOfDate: string;
  source: 'fund_scenario_calculation_runs';
  comparisonLineageVersion: 'comparison-lineage-v1';
  hashKind: 'scenario-input-hash-v2';
  scenarioSnapshotStateHash: string;
  inputHash: string;
  comparisonResultHash: string;
};
```

The implementation plan must include a migration, contract version bump,
Drizzle schema, analysis checkpoint/service/route changes, and real-PostgreSQL
ownership/hash tests. Wire the existing lineage service into production code;
it must not remain test-only. Define `comparisonResultHash` as the canonical hash
of ordered variant IDs plus the server-owned economics comparison response.
Require `scenarioSnapshotStateHash === inputHash`, matching the lineage service's
existing `snapshot_hash_mismatch` refusal. Persist the exact literal source,
lineage version, and hash kind already exported by
`fund-scenario-comparison-lineage-service.ts` and
`shared/lib/scenarios/scenario-input-envelope.ts`.

- [ ] **Step 4: Specify decision/task recovery semantics**

Use the shared atomic evidence-linked decision command with the saved analysis
reference. V1 creates a decision only. A task is a separate later user action
through the existing task API. This avoids a decision-plus-task command.

- [ ] **Step 5: Write exact C2 tests in the spec**

Name tests for source identity, result-hash definition, override-type union,
same-key replay, different-material conflict, cross-fund denial, inaccessible
run/reference denial, transactional rollback, supersession history, zero-
mutation refusal, and client display of only economics V1 metrics.

- [ ] **Step 6: Review, approve, and generate the implementation plan**

Run the common approval process. Generate the C2 implementation plan only after
the spec body has one normative evidence design and no open decision.

---

### Task 3: Specify Marginal Reserve Metric Admission

**Files:**

- Create: `docs/specs/C3a-marginal-reserve-metric-admission.md`
- Create later with `superpowers:writing-plans`:
  `docs/superpowers/plans/2026-09-03-marginal-reserve-metric-admission.md`
- Define in the approved specification for later implementation:
  `shared/contracts/reserve-intelligence-admission-v1.contract.ts`,
  `server/lib/database-backed-idempotency-routes.ts`,
  `server/config/reserve-intelligence-admission-identity.ts`,
  `config/reserve-corpus-manifest.json`,
  `scripts/build-server.mjs`,
  `scripts/build-vercel-api.mjs`,
  `shared/schema/reserve-intelligence-admission.ts`,
  `shared/schema.ts`,
  `server/services/reserves/reserve-intelligence-admission-service.ts`,
  `tests/unit/contracts/reserve-intelligence-admission-v1.contract.test.ts`,
  `tests/integration/reserve-intelligence-admission.pg.test.ts`, and one
  additive journal migration whose exact next number is discovered at branch
  cut and collision-checked again immediately before commit
- Inspect and list as future implementation surfaces:
  `shared/core/moic/MarginalReserveMoic.ts`,
  `shared/contracts/marginal-reserve-moic-v1.contract.ts`,
  `shared/contracts/marginal-reserve-moic-v2.contract.ts`,
  `shared/contracts/dynamic-reserve-intelligence-v1.contract.ts`,
  create `shared/contracts/dynamic-reserve-intelligence-v2.contract.ts`,
  `server/services/moic/marginal-reserve-moic-input-service.ts`,
  `server/services/reserves/dynamic-reserve-intelligence-service.ts`,
  `server/services/reserves/ranked-reserve-orchestrator.ts`,
  `server/services/fund-moic-ranking-service.ts`,
  `server/routes/fund-moic.ts`,
  `server/config/features.ts`, `flags/registry.yaml`,
  `docs/runbooks/marginal-moic-nonproduction-shadow-soak.md`,
  `client/src/hooks/useReserveIntelligence.ts`,
  `client/src/components/fund-results/ReserveIntelligencePanel.tsx`,
  `client/src/pages/fund-model-results-moic-analysis.tsx`, and ADR-033 tests

- [ ] **Step 1: Lock metric meaning and state vocabulary**

Marginal next-dollar MOIC is paired counterfactual delta proceeds divided by
delta capital. Marginal IRR is nullable when no defensible unique solution
exists. Runtime/config states are `off | shadow | on`; output states retain the
existing actionable/indicative/unavailable vocabulary. Do not use Current
Forecast's `held` state.

- [ ] **Step 2: Lock provenance admission rule**

Audit the input builder at `source_sha`. If explicit instrument type and
conversion evidence are not carried end-to-end, the approved specification
must require SAFE/note cases to return unavailable and remain excluded from
authoritative ranking. Only source-proven conversion price, ownership, FX,
timing, and partial-sale allocation may enter a counterfactual.

This deterministic rule resolves the audit; it does not leave an open product
choice.

- [ ] **Step 3: Lock rollout and receipt contract**

Feature remains default off. Introduce the exact payload/engine versions
`dynamic-reserve-intelligence-v2` and `reserve-intel-v2` in the existing
`RESERVE_INTELLIGENCE` snapshot family. Keep calculation output in
`fund_snapshots`; persist serving admission separately in the one append-only
`reserve_intelligence_admission_receipts` table defined below. V2 contains the
existing planned-reserve section plus the admitted
marginal section. Persist source/config hashes, paired-run IDs/hashes, delta
capital/proceeds, nullable IRR reason, source/refusal fields, and output state.

`server/services/reserves/dynamic-reserve-intelligence-service.ts` is the only
producer. It computes both sections from one pinned financial-facts/config basis
and atomically writes the completed run plus one immutable snapshot. It never
patches an earlier snapshot.

The V2 spec must define one exact deterministic hash projection:

```ts
const resultHashProjection = {
  schemaVersion: payload.schemaVersion,
  engineVersion: payload.engineVersion,
  financialFactsSnapshotId: payload.financialFactsSnapshotId,
  sourceConfigId: payload.sourceConfigId,
  sourceConfigVersion: payload.sourceConfigVersion,
  modelInputAsOfDate: payload.modelInputAsOfDate,
  inputHash: payload.inputHash,
  configHash: payload.configHash,
  planned: payload.planned,
  marginal: payload.marginal,
};
```

`resultHash` is `sha256CanonicalJson(resultHashProjection)`. Snapshot/run IDs,
creation or supply timestamps, actor/operator IDs, `suppliedBy`, `suppliedAt`,
idempotency key, request/correlation metadata, and `resultHash` itself remain
outside this projection. Tests must prove fresh commands over identical pinned
inputs produce the same projection and hash. Shadow soak must prove stable
paired replay before any `on` admission.

The approved C3a specification must define one reusable admission surface for
both V2 and V3; V3 must not invent a second table:

```text
table: reserve_intelligence_admission_receipts
id serial primary key
fund_id integer not null
snapshot_id integer not null
snapshot_type varchar(50) not null = RESERVE_INTELLIGENCE
payload_version varchar(64) not null
engine_version varchar(64) not null
predecessor_receipt_id integer null
predecessor_receipt_hash char(64) null
financial_facts_snapshot_id integer not null
source_config_id integer not null
source_config_version integer not null
model_input_as_of_date date not null
source_sha varchar(40) not null
corpus_revision varchar(128) not null
equivalence_run_id varchar(128) null
input_hash char(64) not null
config_hash char(64) not null
result_hash char(64) not null
marginal_input_hash char(64) not null
marginal_config_hash char(64) not null
marginal_section_hash char(64) not null
receipt_hash char(64) not null
acceptance_state varchar(16) not null = accepted
accepted_by integer not null references users(id) on delete restrict
accepted_at timestamptz not null
idempotency_key varchar(128) not null
request_hash char(64) not null
```

The same additive migration must add
`fund_snapshots_id_fund_type_unique (id, fund_id, type)`, then enforce a
composite receipt FK `(snapshot_id, fund_id, snapshot_type)` to that key, a
composite financial-facts FK `(financial_facts_snapshot_id, fund_id)`, and a
same-fund self-FK `(predecessor_receipt_id, fund_id)`. Add unique constraints on
`(id, fund_id)`, `(fund_id, snapshot_id, payload_version)`,
`(fund_id, idempotency_key)`, and `receipt_hash`.

Database checks must enforce only these two variants:

- V2: payload `dynamic-reserve-intelligence-v2`, engine `reserve-intel-v2`,
  `predecessor_receipt_id`, `predecessor_receipt_hash`, and
  `equivalence_run_id` all null;
- V3: payload `dynamic-reserve-intelligence-v3`, engine `reserve-intel-v3`, all
  three predecessor/equivalence fields non-null.

`acceptance_state` has one admitted value, `accepted`. The service exposes
idempotent insert and fund/snapshot lookup only; no update or delete path.

The only writer is one guarded admin command,
`POST /api/funds/:fundId/moic/reserve-intelligence/admissions`
(`Idempotency-Key` required, `requireRole('admin')`, fund access checked,
registered per ARCHI section 9), dispatched by the repository owner after the
shadow-soak gate. The producer never self-admits. `request_hash` is SHA-256 of
canonical JSON over `{fundId, snapshotId, payloadVersion, engineVersion,
sourceSha, corpusRevision, predecessorReceiptId, equivalenceRunId, inputHash,
configHash, resultHash, marginalInputHash, marginalConfigHash,
marginalSectionHash}`; same key and same hash replays the stored receipt, same
key and different hash returns 409. The insert transaction loads and
strict-parses the same-fund snapshot by `(snapshot_id, fund_id, type)`, derives
`basis` from its payload, recomputes `inputHash`, `configHash`, `resultHash`,
and the three marginal hashes from that payload, requires each to equal the
request material, and for V3 validates the predecessor and equivalence
evidence exactly as specified below, all before inserting. `sourceSha` and
`corpusRevision` are not trusted from the request: the C3a implementation plan
adds one immutable identity module
`server/config/reserve-intelligence-admission-identity.ts` exporting the exact
`{ sourceSha, corpusRevision }` the running engine was built from, and both the
V2 and V3 admission transactions require the request pair to equal that module
before inserting. Both build entry scripts (`scripts/build-server.mjs`,
`scripts/build-vercel-api.mjs`, which do no identity injection today) stamp the
module at build time as esbuild `define` constants. `.git` is excluded from the
Docker build (`.dockerignore`, `Dockerfile.railway` `COPY . .`), so `sourceSha`
comes from the platform build variable, not `git`: `RAILWAY_GIT_COMMIT_SHA` in
`build-server.mjs` and `VERCEL_GIT_COMMIT_SHA` in `build-vercel-api.mjs`.
`corpusRevision` comes from a new tracked manifest
`config/reserve-corpus-manifest.json` (copied into the build) whose declared
`revision` string both scripts read. Validation is lazy, at admission-command
execution, not at import: the module exports whatever was stamped (a placeholder
in unbuilt `dev:api`/Vitest, which run TS directly and skip both scripts), and
the admission command refuses with a typed error when either value is absent or
still the placeholder, so a real unstamped deployment admits nothing while dev
and test startup do not crash. Dev and test set the pair through an explicit
environment-override seam the module reads before the stamped constant, so
admission tests can exercise both stamped and unstamped states. Any inequality
refuses with no row. The route regex joins
`server/lib/database-backed-idempotency-routes.ts` with registry tests and
cross-surface (`makeApp` and `registerRoutes`) concurrency coverage; otherwise
the Docker/Railway generic middleware intercepts the mutation with its own
cached/422 semantics.

Serving enforcement: `actionability: 'actionable'` and every ranking read
require the exact `(fund_id, snapshot_id, payload_version)` accepted receipt
joined at read time. Mode `on` alone no longer suffices; the C3a implementation
plan changes `dynamic-reserve-intelligence-service.ts:383` and
`fund-moic.ts:228` accordingly. An unreceipted snapshot is `non_actionable`,
and `GET .../reserve-intelligence/latest` labels it so.
`GET /funds/:fundId/moic/marginal-rankings` (`fund-moic.ts:304`) today builds
marginal inputs only (`buildMarginalReserveMoicInputs`) with no snapshot ID, so
"resolve the accepted receipt" is underdetermined while multiple accepted
receipts exist across snapshots. The C3a/C3b implementation plan routes ranking
through the one shared full-V2 projection producer
(`dynamic-reserve-intelligence-service.ts`, the same builder that writes the
snapshot), computes `financialFactsSnapshotId`, source config id/version,
model-input as-of date, and the `inputHash`/`configHash`/`resultHash` for the
current fund state, then selects the single accepted receipt whose bound
snapshot matches that exact basis tuple and all three hashes. Zero or more than
one match is `indicative`, never `actionable`; an exact-basis tie is broken by
the latest `acceptedAt` only after hash equality already holds. An old receipt
never authorizes new results.

The wire contract is exact. Each variant pins its literal pair and nullability,
mirroring the database checks; the Zod schema is a `z.union` of the two strict
variant objects:

```ts
type ReserveIntelligenceAdmissionReceiptBase = {
  receiptVersion: 'reserve-intelligence-admission/1.0.0';
  receiptId: number;
  fundId: number;
  snapshotId: number;
  snapshotType: 'RESERVE_INTELLIGENCE';
  basis: {
    financialFactsSnapshotId: number;
    sourceConfigId: number;
    sourceConfigVersion: number;
    modelInputAsOfDate: string;
  };
  hashes: {
    inputHash: string;
    configHash: string;
    resultHash: string;
    marginalInputHash: string;
    marginalConfigHash: string;
    marginalSectionHash: string;
  };
  acceptance: {
    state: 'accepted';
    acceptedBy: number;
    acceptedAt: string;
  };
  receiptHash: string;
};

type ReserveIntelligenceAdmissionReceiptV1 =
  | (ReserveIntelligenceAdmissionReceiptBase & {
      versions: {
        payloadVersion: 'dynamic-reserve-intelligence-v2';
        engineVersion: 'reserve-intel-v2';
        sourceSha: string;
        corpusRevision: string;
      };
      predecessor: null;
      equivalenceRunId: null;
    })
  | (ReserveIntelligenceAdmissionReceiptBase & {
      versions: {
        payloadVersion: 'dynamic-reserve-intelligence-v3';
        engineVersion: 'reserve-intel-v3';
        sourceSha: string;
        corpusRevision: string;
      };
      predecessor: { receiptId: number; receiptHash: string };
      equivalenceRunId: string;
    });
```

Compute `receiptHash = sha256CanonicalJson(receiptHashPreimage)` where the
preimage is exactly:

```ts
const receiptHashPreimage = {
  receiptVersion: receipt.receiptVersion,
  fundId: receipt.fundId,
  snapshotId: receipt.snapshotId,
  snapshotType: receipt.snapshotType,
  predecessor: receipt.predecessor,
  basis: receipt.basis,
  versions: receipt.versions,
  hashes: receipt.hashes,
  equivalenceRunId: receipt.equivalenceRunId,
  acceptanceState: receipt.acceptance.state,
  acceptedBy: receipt.acceptance.acceptedBy,
  acceptedAt: receipt.acceptance.acceptedAt,
};
```

Exclude `receiptId`, `receiptHash`, idempotency key,
request hash, command/run/correlation IDs, and request metadata. Never embed
admission receipt ID/hash/acceptance fields in the calculation `resultHash`.

- [ ] **Step 4: Write exact C3a tests in the spec**

Name expected-output cases for paired delta math, zero/negative delta capital,
non-unique IRR, SAFE/note missing provenance, FX missing, terminal liquidation
missing, partial-sale missing, feature off/shadow/on behavior, ranking exclusion,
receipt hash replay, a real-PostgreSQL concurrent same-key admission race
(two clients, one receipt row, one replay), and admission-identity cases: a
stamped module whose `sourceSha`/`corpusRevision` match the request admits, a
mismatch refuses, and an unstamped/placeholder identity refuses at command
execution without crashing import.

- [ ] **Step 5: Review, approve, and generate the implementation plan**

Run the common approval process. The implementation plan must include
`TZ=UTC npm run phoenix:truth`, the named changed cases, feature-flag validation,
and nonproduction shadow-soak gates.

---

### Task 4: Specify Current MOIC on Deployed Reserves

**Files:**

- Create: `docs/specs/C3b-deployed-reserve-moic.md`
- Create later with `superpowers:writing-plans`:
  `docs/superpowers/plans/2026-09-03-deployed-reserve-moic.md`
- Reuse the C3a admission surface:
  `shared/contracts/reserve-intelligence-admission-v1.contract.ts`,
  `shared/schema/reserve-intelligence-admission.ts`, and
  `server/services/reserves/reserve-intelligence-admission-service.ts`
- Inspect and list as future implementation surfaces:
  `shared/core/moic/MOICCalculator.ts`,
  `shared/schema/investment-positions.ts`,
  `shared/contracts/investment-ledger/position.contract.ts`,
  `shared/contracts/investment-ledger/current-position.contract.ts`,
  `server/services/investment-ledger/current-position-service.ts`,
  `server/services/investment-ledger/position-service.ts`,
  `server/services/investment-ledger/position-valuation-service.ts`,
  `server/services/investment-ledger/position-conversion-service.ts`,
  `server/services/investment-ledger/ledger-correction-service.ts`,
  `server/services/fund-moic-ranking-service.ts`,
  `server/routes/fund-moic.ts`,
  `client/src/components/fund-results/ReserveIntelligencePanel.tsx`,
  `client/src/pages/fund-model-results-moic-analysis.tsx`,
  `shared/contracts/internal-economics/internal-economics-input-v2.contract.ts`,
  `shared/contracts/dynamic-reserve-intelligence-v2.contract.ts`,
  create `shared/contracts/dynamic-reserve-intelligence-v3.contract.ts`,
  and Program B's admitted contract

- [ ] **Step 1: Lock denominator and provenance**

Current deployed-reserve MOIC denominator is attributable deployed follow-on
capital for one security. Weighted acquisition price is separate provenance and
output, calculated per security; never aggregate price across unlike
securities.

Security identity crosswalk: Program B's `securityId` is an opaque string with
no ledger producer today. C3b defines the canonical value as
`participation:<vehicle_financing_participations.id>`. The V2 input builder
derives every `InvestmentLot.securityId` from that rule, and
`current-position-service.ts` positions (grouped by vehicle and company) map to
securities through their participation IDs. A position whose participation has
no Program B lot, or a lot whose `securityId` does not follow the rule, returns
typed unavailable and cannot rank. Deployed follow-on capital is per
participation from the ledger event cost rows keyed by participation ID that
`buildPositions` already consumes. Attributable fair value, however, exists at
HEAD only as the vehicle/company aggregate
(`position-valuation-service.ts:184`); the event rows carry cost/proceeds only
and the terms carry security type only (`current-position-service.ts:14`). C3b
therefore uses that aggregate fair value only when the position maps to exactly
one eligible live participation; a position spanning more than one live
participation, or any participation with a correction successor, returns typed
unavailable and cannot rank. C3b introduces no new participation-valued source.

- [ ] **Step 2: Lock numerator and event treatment**

Numerator includes current attributable value plus exact realized proceeds for
the same security. Write-off, correction, and conversion events are supported
when exact security/source-lot lineage exists; otherwise return a typed
unavailable result. Do not categorically refuse sourced events.

- [ ] **Step 3: Lock Program B dependency behavior**

If Program B admits exact routing, consume exact security proceeds. If Program B
admits typed refusal for a case, C3b propagates unavailable and cannot rank that
security. No fallback to deal-level proceeds or first matching security is
allowed.

After C3a V2 is admitted, introduce exact payload/engine versions
`dynamic-reserve-intelligence-v3` and `reserve-intel-v3`. The same
`dynamic-reserve-intelligence-service.ts` producer computes planned, marginal,
and security-keyed deployed metrics before one atomic completed-run/snapshot
write. Do not patch or reinterpret V1/V2 snapshots.

All three V3 sections share one coherence envelope containing
`financialFactsSnapshotId`, source config ID/version, model-input as-of date,
`inputHash`, and `configHash`. Each section retains its own denominator,
provenance, availability, and refusal reason. Mixed-basis inputs refuse before
snapshot creation.

V3 extends the V2 deterministic projection exactly:

```ts
const resultHashProjection = {
  schemaVersion: payload.schemaVersion,
  engineVersion: payload.engineVersion,
  financialFactsSnapshotId: payload.financialFactsSnapshotId,
  sourceConfigId: payload.sourceConfigId,
  sourceConfigVersion: payload.sourceConfigVersion,
  modelInputAsOfDate: payload.modelInputAsOfDate,
  inputHash: payload.inputHash,
  configHash: payload.configHash,
  planned: payload.planned,
  marginal: payload.marginal,
  deployed: payload.deployed,
};
```

`resultHash` is `sha256CanonicalJson(resultHashProjection)` with the same
command/operator/timestamp/request exclusions as V2.

V3 receives no serving admission merely because V2 was admitted. Before C3b or
C3c can consume V3, run named `reserve-intel-v2-v3-marginal-equivalence` proof
over every committed V2 admission-corpus base. It must show identical marginal
input/config hashes, availability/refusal state, canonical marginal section,
and marginal section hash between admitted V2 and candidate V3. Publish a
V3-specific admission receipt binding source SHA, engine/payload versions,
V2 admission receipt ID, corpus revision, equivalence-run ID, and exact hashes.
Any mismatch blocks V3 admission and requires a separately approved fresh V3
admission plan; it cannot be waived inside C3b.

V3 admission uses the same table and contract. Before inserting the V3 row,
`reserve-intelligence-admission-service.ts` must load the same-fund accepted V2
receipt by `predecessorReceiptId`, validate its stored `receiptHash`, require
payload/engine versions `dynamic-reserve-intelligence-v2`/`reserve-intel-v2`,
and require the named equivalence run to prove equality of V2 and V3
`marginalInputHash`, `marginalConfigHash`, and `marginalSectionHash`. The V3 row
stores and hashes the predecessor receipt ID/hash, current V3 calculation
hashes, and `equivalenceRunId`. Missing predecessor, cross-fund predecessor,
hash mismatch, or marginal mismatch refuses before receipt insertion and grants
no V3 serving admission. V3 calculation `resultHash` remains the calculation-
only projection above.

- [ ] **Step 4: Write exact C3b tests in the spec**

Name expected-output cases for multiple securities in one deal, weighted
acquisition price by security, partial sale, write-off, correction, conversion,
missing lineage, global proceeds conservation, and ranking exclusion. Require
Phoenix truth and a changed-case manifest for any receipt/hash change. Prove
legacy pro-rata or indicative outputs remain distinctly labeled and excluded
from authoritative ranking.

- [ ] **Step 5: Review, approve, and generate the implementation plan**

Run the common approval process only after Program B's approved contract is
named by exact SHA/version. Generate the C3b implementation plan with that
dependency pinned.

---

### Task 5: Specify Reserve Evidence-Linked Decision Workflow

**Files:**

- Create: `docs/specs/C3c-reserve-evidence-decision-workflow.md`
- Create later with `superpowers:writing-plans`:
  `docs/superpowers/plans/2026-09-03-reserve-evidence-decision-workflow.md`
- Reuse for receipt lookup:
  `shared/contracts/reserve-intelligence-admission-v1.contract.ts`,
  `shared/schema/reserve-intelligence-admission.ts`, and
  `server/services/reserves/reserve-intelligence-admission-service.ts`
- Inspect and list as future implementation surfaces:
  `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts`,
  `shared/schema/internal-analysis.ts`, `shared/schema/fund.ts`,
  `shared/contracts/dynamic-reserve-intelligence-v3.contract.ts`,
  `server/services/reserves/dynamic-reserve-intelligence-service.ts`,
  `server/routes/fund-moic.ts`,
  `server/services/internal-analysis/analysis-checkpoint-service.ts`,
  `shared/schema/operating-objects.ts`, decision/task evidence services/routes,
  and `client/src/hooks/useDecisions.ts`, `client/src/hooks/useTasks.ts`

- [ ] **Step 1: Lock the evidence artifact**

Reuse a saved `analysis_reference`; do not add a reserve-specific decision
evidence target. Its `reserveReferenceId` must resolve to a same-fund
`fund_snapshots` row with type `RESERVE_INTELLIGENCE`. That one versioned
snapshot must parse as `dynamic-reserve-intelligence-v3` and contain the planned,
C3a marginal, and C3b deployed-reserve metric sections created atomically by
`dynamic-reserve-intelligence-service.ts`. Each section has independent
availability/refusal provenance but shares the V3 coherence envelope. The
checkpoint service verifies the immutable input/config/result hashes before
save; any absent section, mixed basis, or older payload version refuses.
It must also verify the V3-specific admission receipt from Task 4 binds the
exact snapshot payload/engine versions, source SHA, corpus revision, and named
V2-to-V3 marginal-equivalence run. A V2 admission receipt alone is insufficient.

The same ordered verification runs at two entry points. At analysis-reference
save, `analysis-checkpoint-service.ts` starts from the draft's
`reserveReferenceId` (`readPinnedComponentBases`, the existing pre-insert basis
check) and runs steps 2-7 before inserting the reference. At decision creation,
the shared evidence-linked decision command starts from the saved reference and
runs steps 1-7 inside the transaction that inserts the decision and its
evidence link. Every failure refuses with a typed reason before any analysis,
decision, or task mutation:

1. Take the per-fund advisory transaction lock
   (`pg_advisory_xact_lock(class, fund_id)`, the
   `current-forecast-fund-lock.ts` pattern with a new class constant), then
   load `internal_analysis_references` by `(id, fund_id)`. Refuse when the row
   is missing, belongs to another fund, has a null `reserve_reference_id`, or a
   successor exists:
   `EXISTS (SELECT 1 FROM internal_analysis_references s WHERE s.supersedes_reference_id = r.id)`.
   `supersedes_reference_id` lives on the successor and points backward; the
   loaded row's own field is not the staleness signal. The lock only serializes
   the successor `EXISTS` check with the decision insert against a concurrent
   correction save, so the decision cannot link a reference that gains a
   successor between check and insert. It does not forbid a later supersession:
   a decision links an immutable reference id as a point-in-time recommendation,
   and a correction that supersedes afterward does not mutate the decision. For
   the race protection to hold, the C3c implementation plan must make correction
   save with a non-null `sourceReferenceId`
   (`analysis-checkpoint-service.ts:790`, which today inserts the successor with
   no lock) acquire the same per-fund advisory lock before it rechecks terminal
   state and inserts the successor; the decision's successor `EXISTS` check and
   insert then serialize against it. The evidence FK only restricts deletion
   (`operating-objects.ts:201`), so the lock is the sole ordering mechanism.
2. Load `fund_snapshots` by `(reserve_reference_id, fund_id)`. Refuse unless
   `type` is `RESERVE_INTELLIGENCE` and the payload parses as
   `dynamic-reserve-intelligence-v3` with `engineVersion` `reserve-intel-v3`
   and all three sections present.
3. Load exactly one `reserve_intelligence_admission_receipts` row by
   `(fund_id, snapshot_id, payload_version = 'dynamic-reserve-intelligence-v3')`
   with `acceptance_state = 'accepted'`. Zero rows refuse. Two rows cannot
   exist under the unique constraint; treat that as an integrity refusal.
4. Recompute the V3 `receiptHash` from the stored columns and compare it to
   `receipt_hash`. Mismatch refuses.
5. Load the predecessor by `(predecessor_receipt_id, fund_id)`. Refuse when
   missing, cross-fund, not `accepted`, or not
   `dynamic-reserve-intelligence-v2`/`reserve-intel-v2`. Recompute its
   `receiptHash`; it must equal both its own `receipt_hash` and the V3 row's
   `predecessor_receipt_hash`.
6. Bind the V3 receipt to the snapshot: `financial_facts_snapshot_id`,
   `source_config_id`, `source_config_version`, `model_input_as_of_date`,
   `input_hash`, and `config_hash` must equal the payload coherence envelope,
   and `result_hash` must equal `resultHash` recomputed from the V3 projection
   over the stored payload.
7. Bind the V3 receipt to the admission: `equivalence_run_id` must be
   non-null; `source_sha` and `corpus_revision` must equal the admitted V3
   serving pair the running service is configured with (the V3 admission plan
   names that configuration surface); and `marginal_input_hash`,
   `marginal_config_hash`, and `marginal_section_hash` must equal the
   predecessor's stored values.

Any other outcome is `stale` or `mismatched` evidence and refuses. The lookup
reads only; it never inserts, updates, or repairs a receipt.

- [ ] **Step 2: Lock referential and refusal behavior**

The implementation plan must add service-level fund/type/hash checks and real-
PostgreSQL tests. Add a composite same-fund FK only when the inspected source
already exposes the required `(id, fund_id)` uniqueness and the migration is
additive; otherwise use service enforcement and explicit deletion/restriction
behavior. The approved spec records the inspected result as one final design,
not a conditional choice. Cross-fund, wrong-type, missing, stale, or hash-
mismatched reserve references refuse with zero analysis/decision mutation.

- [ ] **Step 3: Lock decision and task sequencing**

Use the shared atomic evidence-linked decision command. V1 creates the decision
and analysis-reference link in one transaction. The decision stores
recommendation, optional follow-up owner/date, and decision supersession through
existing fields. Optional task creation is a separate existing API action with
only title, owner, due date, description, and status; attach the same analysis
reference through the existing task evidence-link API. Do not claim a direct
decision-task or task-supersession field.

- [ ] **Step 4: Write exact C3c tests in the spec**

Name tests for same-fund `RESERVE_INTELLIGENCE` ownership/type/hash, wrong-type
refusal, cross-fund denial, inaccessible evidence, superseded reference
refusal, missing V3 receipt, V3 receipt hash mismatch, predecessor missing,
cross-fund, or hash mismatch, marginal hash mismatch, source/corpus mismatch,
same-key replay, different-material conflict, transactional rollback, optional
task evidence linking, decision supersession, zero-mutation refusal, and a
two-session real-PostgreSQL race of correction-draft save against decision
creation proving the decision never links a reference that already has a
committed successor (a supersession committing after the decision is allowed and
leaves the decision's linked reference id immutable).

- [ ] **Step 5: Review, approve, and generate the implementation plan**

Run the common approval process. The approved spec consumes only
`dynamic-reserve-intelligence-v3`, which already binds C3a marginal and C3b
deployed-reserve evidence into one atomic snapshot. A metric that is unavailable
remains explicitly nullable with its refusal reason; it is never synthesized.
C3c implementation and serving remain blocked until the exact V3 admission
receipt and equivalence proof are accepted.

---

### Task 6: Validate the Five Approved Specifications and Plans

**Files:**

- Modify only through generator:
  `docs/_generated/router-fast.json`, `docs/_generated/router-index.json`,
  `docs/_generated/staleness-report.md`

- [ ] **Step 1: Validate every file independently**

Run this Node/YAML validation from repository root:

```bash
node --input-type=module <<'NODE'
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const files = [
  'docs/specs/C1-forecast-variance-decision-workflow.md',
  'docs/specs/C2-scenario-comparison-decision-workflow.md',
  'docs/specs/C3a-marginal-reserve-metric-admission.md',
  'docs/specs/C3b-deployed-reserve-moic.md',
  'docs/specs/C3c-reserve-evidence-decision-workflow.md',
];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: invalid frontmatter`);
  const meta = YAML.parse(match[1]);
  const bodyHash = crypto.createHash('sha256').update(match[2]).digest('hex');
  if (meta.status !== 'APPROVED') throw new Error(`${file}: not approved`);
  if (meta.approval?.state !== 'approved') throw new Error(`${file}: bad state`);
  if (!/^[a-f0-9]{40}$/.test(meta.source_sha)) throw new Error(`${file}: bad source_sha`);
  if (!/^[a-f0-9]{64}$/.test(meta.body_sha256)) throw new Error(`${file}: bad body_sha256`);
  if (!/^[a-f0-9]{64}$/.test(meta.approval_sha256)) throw new Error(`${file}: bad approval_sha256`);
  if (meta.body_sha256 !== bodyHash) throw new Error(`${file}: body changed after approval`);
  if (!Array.isArray(meta.source_paths) || meta.source_paths.length === 0) {
    throw new Error(`${file}: missing source_paths`);
  }
  const normalizedPaths = meta.source_paths.map((sourcePath) => {
    if (
      typeof sourcePath !== 'string' ||
      sourcePath.trim() === '' ||
      /[<>]/.test(sourcePath) ||
      sourcePath.includes('\\') ||
      path.posix.isAbsolute(sourcePath) ||
      path.posix.normalize(sourcePath) !== sourcePath ||
      sourcePath.startsWith('../')
    ) {
      throw new Error(`${file}: invalid source path ${String(sourcePath)}`);
    }
    return sourcePath;
  });
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new Error(`${file}: duplicate source_paths`);
  }
  if (
    JSON.stringify(normalizedPaths) !==
    JSON.stringify([...normalizedPaths].sort((left, right) => left.localeCompare(right)))
  ) {
    throw new Error(`${file}: source_paths must be sorted`);
  }
  for (const key of ['scope', 'reviewed_by', 'reviewed_at', 'approved_by', 'approved_at']) {
    if (
      typeof meta[key] !== 'string' ||
      meta[key].trim() === '' ||
      /[<>]/.test(meta[key])
    ) {
      throw new Error(`${file}: missing ${key}`);
    }
  }
  for (const key of ['reviewed_at', 'approved_at']) {
    const value = meta[key];
    const parsed = new Date(value);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString() !== value.replace(/Z$/, '.000Z')
    ) {
      throw new Error(`${file}: ${key} must be UTC ISO-8601 seconds`);
    }
  }
  const approvalPreimage = {
    source_sha: meta.source_sha,
    source_paths: meta.source_paths,
    scope: meta.scope,
    body_sha256: meta.body_sha256,
    reviewed_by: meta.reviewed_by,
    reviewed_at: meta.reviewed_at,
    approved_by: meta.approved_by,
    approved_at: meta.approved_at,
    approval_state: meta.approval.state,
  };
  const approvalHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(approvalPreimage))
    .digest('hex');
  if (meta.approval_sha256 !== approvalHash) {
    throw new Error(`${file}: approval metadata changed`);
  }
  const git = (args) => spawnSync('git', args, { encoding: 'utf8' });
  if (git(['merge-base', '--is-ancestor', meta.source_sha, 'HEAD']).status !== 0) {
    throw new Error(`${file}: source_sha is not an ancestor of HEAD`);
  }
  for (const sourcePath of normalizedPaths) {
    if (git(['cat-file', '-e', `${meta.source_sha}:${sourcePath}`]).status !== 0) {
      throw new Error(`${file}: ${sourcePath} missing at source_sha`);
    }
    if (git(['ls-files', '--error-unmatch', '--', sourcePath]).status !== 0) {
      throw new Error(`${file}: ${sourcePath} is not tracked at approval head`);
    }
  }
  if (git(['diff', '--quiet', meta.source_sha, 'HEAD', '--', ...meta.source_paths]).status !== 0) {
    throw new Error(`${file}: committed inspected source drifted`);
  }
  if (git(['diff', '--cached', '--quiet', '--', ...meta.source_paths]).status !== 0) {
    throw new Error(`${file}: staged inspected source drifted`);
  }
  if (git(['diff', '--quiet', '--', ...meta.source_paths]).status !== 0) {
    throw new Error(`${file}: working-tree inspected source drifted`);
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...meta.source_paths]);
  if (untracked.status !== 0 || untracked.stdout.trim() !== '') {
    throw new Error(`${file}: untracked inspected source drifted`);
  }
}
NODE
```

- [ ] **Step 2: Verify source baselines have not drifted**

The Step 1 validator compares every declared `source_paths` entry to the approval
head. Any product-path diff returns that spec to `DRAFT` for re-inspection and
approval.

- [ ] **Step 3: Verify each implementation plan exists and is complete**

Each of the five named implementation plans must have valid frontmatter, the
required writing-plans header, exact file/line manifests, TDD steps, named test
commands, commit steps, and no unresolved product decision.

- [ ] **Step 4: Run documentation validation**

```bash
TZ=UTC npm run docs:routing:generate
TZ=UTC npm run docs:routing:check
TZ=UTC npm run docs:check-links
git diff --check
```

Stage exact Program C documents and generated routing files, then run:

```bash
git diff --cached --check
```

- [ ] **Step 5: Obtain fresh program-level review and commit**

Reviewer checks source/body binding, no open decision, contract/type names,
file/test completeness, atomic decision/link semantics, financial provenance, and
Program A/B entry gates. Resolve blockers and rerun Steps 1-4. Commit with one
conventional docs commit per approved specification plus its implementation
plan; do not combine five approvals into one ambiguous commit.

## Definition of Done

1. Five specifications are `APPROVED`, bound to exact source and exact body
   bytes, and contain no open normative decision.
2. Five separate implementation plans exist and pass the writing-plans
   self-review. Each plan that adds a route or persistence surface carries the
   `docs/ARCHI.md` section 9 rule verbatim (manifest, impl map, both group
   slices, route-policy entry, the `database-backed-idempotency-routes.ts`
   regex, and a journal-discovered additive migration number).
3. C1 reuses `forecastFundSnapshotId` and covers all current engine statuses.
4. C2 is economics-only V1, uses actual scenario identity fields, and makes its
   analysis-reference schema/migration work explicit.
5. C3a preserves paired-counterfactual meaning and refuses absent provenance.
6. C3b keeps denominator, weighted price, and security lineage distinct.
7. C3c reuses a verified reserve-backed analysis reference and existing
   decision/task evidence APIs.
8. Product implementation and serving remain blocked until applicable Program
   A and Program B gates are satisfied.

## Self-Review Record

- **Spec coverage:** Forecast status, scenario scope/identity, reserve metric
  semantics, evidence persistence, atomic decision/link behavior, approval binding, and
  rollout gates each have explicit tasks.
- **Placeholder boundary:** Audit-conditioned rules have deterministic fallback
  outcomes; approved specs cannot contain an unresolved normative choice.
- **Authority boundary:** Specification approval does not authorize product
  implementation, merge, deployment, flag change, or production action.
