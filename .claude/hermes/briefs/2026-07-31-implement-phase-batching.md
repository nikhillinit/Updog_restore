# Brief: IMPLEMENT-phase batching mechanic in orchestrate.js

Read `.claude/hermes/generalized-workflow-template.md` in full first — it is the
accepted spec. This brief is the exact, already-designed implementation plan
derived from it; do not redesign, just build it.

Baseline: HEAD `aa94ad3b90ebab2fc961670ae9ac0b57178df224`, `orchestrate.js`
sha256 `2352011ef368e44423ec6ba9d2a3d4e693720f4cef861486f229a66de0f3be73` (1950
lines). Confirm via `shasum -a 256 orchestrate.js` before editing. If it
differs, STOP and report the divergence instead of guessing.

Scope: edit only `orchestrate.js` and tests under `tests/unit/routing/` (a new
file `tests/unit/routing/hermes-batched-workflow.test.ts` is preferred to avoid
growing the existing 1893-line `hermes-routing.test.ts` further, but reuse its
mocking patterns — see "Test requirements" below). Do not touch
`shared/lib/internal-economics/**`, `tests/unit/internal-economics/**`,
`docs/superpowers/**`, or anything under the `debate`/`moa-review` step guard in
`createWorkflowPlan` (out of scope — a separate, unrelated plan).

No emoji anywhere (code, tests, commit messages, output) per repo policy. Plain
ESM JavaScript, no new dependencies, Node >= 20.19.

## Step 1 — Extract `runOwnerReviewRepairRound`

Current `executeWorkflow` (`orchestrate.js:1329`, ends `:1534`) does, in its
single-artifact branch (`orchestrate.js:1393-1487`):

1. `ownerStep` runs once with `input=null` -> `artifact`.
2. `specialistStep(artifact)` -> `specialistNotes` (used by all later
   `runRecorded` calls via closure — do not disturb this ordering).
3. A review-repair loop over `moaStep`/`reviewerStep`, bounded by `maxRepairs`,
   repairing via `ownerStep`.
4. `auditStep(artifact, repairs)`.

Extract ONLY step 3 (the review-repair loop) into a new function:

```js
async function runOwnerReviewRepairRound({
  ownerStep,
  moaStep,
  reviewerStep,
  runRecorded, // same runRecorded closure executeWorkflow already builds
  records, // the same records array executeWorkflow/executeBatchedWorkflow owns
  moaRunner,
  initialArtifact = null, // pass an already-produced artifact to skip the initial owner run
  initialOwnerInput = null, // input for the initial owner run when initialArtifact is null
  task,
  routing,
  env,
  moaConfig,
  maxRepairs,
}) {
  // returns { artifact, approved, repairs, moaResult }
}
```

Behavior, byte-for-byte equivalent to today's inline logic:

- If `initialArtifact === null` and `ownerStep` exists:
  `artifact = (await runRecorded(ownerStep, initialOwnerInput, 0)).output ?? ''`.
  Otherwise `artifact = initialArtifact`.
- `runReviewRound(attempt)` closure: identical to today's
  (`orchestrate.js:1406-1452`) — `moaRunner` call, `records.push` for the
  `moa-review` entry (same shape, same degraded-stderr-warning write), then
  `reviewerStep` via `runRecorded`. Reference the CURRENT `artifact` variable
  (this function's own local, not executeWorkflow's).
- If neither `moaStep` nor `reviewerStep` exists: `approved` stays `true`,
  `repairs` stays `0`, return immediately after producing the initial artifact
  (no loop).
- Otherwise: run `runReviewRound(0)`, then the same
  `while (!approved && repairs < maxRepairs && ownerStep)` loop as today
  (`orchestrate.js:1458-1481`), including BOTH break conditions (degraded
  transport-failure break, and the dry-loop break when MOA repeats known
  findings with no other rejector) and the `previousFindingKeys` tracking — copy
  this logic verbatim, only renaming closure variables as needed.
- Return `{ artifact, approved, repairs, moaResult }`.

Then rewrite `executeWorkflow`'s single-artifact branch to:

```js
if (ownerStep) {
  const owner = await runRecorded(ownerStep, null, 0);
  artifact = owner.output ?? '';
}
if (specialistStep) {
  const specialist = await runRecorded(specialistStep, artifact, 0);
  specialistNotes = specialist.output ?? null;
}
if (moaStep || reviewerStep) {
  const round = await runOwnerReviewRepairRound({
    ownerStep,
    moaStep,
    reviewerStep,
    runRecorded,
    records,
    moaRunner,
    initialArtifact: artifact,
    task: plan.task,
    routing,
    env,
    moaConfig: deps.moaConfig || routing?.moaReview || {},
    maxRepairs,
  });
  artifact = round.artifact;
  approved = round.approved;
  repairs = round.repairs;
  moaResult = round.moaResult;
}
if (auditStep) {
  await runRecorded(auditStep, artifact, repairs);
}
```

Note: the initial owner run and specialist run STAY INLINE in `executeWorkflow`
(they are not part of the extracted helper) — only the review-repair loop moves
out. This preserves the exact ordering dependency (specialistNotes must be set
before the loop's `runRecorded` calls read it via closure).

**Verification gate for this step**: run the existing (unmodified)
`hermes-routing.test.ts` suite and confirm it passes with ZERO test changes
before proceeding to step 2. If anything fails, the extraction has a bug — fix
it before adding any new behavior.

## Step 2 — `executeBatchedWorkflow`

Add a new function, called from `executeWorkflow` when batches are present:

```js
async function executeWorkflow(plan, deps = {}) {
  const workflow = plan.workflow;
  if (!workflow || !Array.isArray(workflow.steps)) {
    throw new Error(
      'executeWorkflow requires a plan with a workflow.steps array.'
    );
  }
  if (Array.isArray(plan.batches) && plan.batches.length > 0) {
    return executeBatchedWorkflow(plan, deps);
  }
  // ...rest of today's function body, unchanged except step 1's refactor...
}
```

`executeBatchedWorkflow(plan, deps = {})` mirrors `executeWorkflow`'s dep
resolution (`maxRepairs`, `runStep`/`defaultRunStep`, `gateRunner`,
`assertFinancialGate`, `ledgerWriter`, `clock`, `runId`, role lookups via
`stepByRole`, `moaRunner`, `routing`, `env`) and the same `runRecorded` closure
pattern (tracks `stepFailureCode` — first nonzero exit from ANY step — and
`specialistNotes`).

Logic:

```js
let accumulatedArtifact = '';
const batchResults = [];
let haltedAt = null;
let totalRepairs = 0;

for (let i = 0; i < plan.batches.length; i += 1) {
  const batchDescription = plan.batches[i];
  const round = await runOwnerReviewRepairRound({
    ownerStep,
    moaStep,
    reviewerStep,
    runRecorded,
    records,
    moaRunner,
    initialArtifact: null,
    initialOwnerInput: [accumulatedArtifact, batchDescription],
    task: plan.task,
    routing,
    env,
    moaConfig: deps.moaConfig || routing?.moaReview || {},
    maxRepairs,
  });
  batchResults.push({
    index: i,
    description: batchDescription,
    approved: round.approved,
    repairs: round.repairs,
  });
  totalRepairs += round.repairs;
  accumulatedArtifact = round.artifact;
  if (!round.approved) {
    haltedAt = i;
    break; // HARD STOP: do not run remaining batches, the final pass, or the gate
  }
}

let finalPass = null;
let gate = { command: plan.gate || null, skipped: true, status: 0 };
let exitCode = 0;

if (haltedAt !== null) {
  exitCode = 1;
} else {
  if (specialistStep) {
    const specialist = await runRecorded(
      specialistStep,
      accumulatedArtifact,
      0
    );
    specialistNotes = specialist.output ?? null;
  }

  finalPass = await runOwnerReviewRepairRound({
    ownerStep,
    moaStep,
    reviewerStep,
    runRecorded,
    records,
    moaRunner,
    initialArtifact: accumulatedArtifact,
    task: plan.task,
    routing,
    env,
    moaConfig: deps.moaConfig || routing?.moaReview || {},
    maxRepairs,
  });
  accumulatedArtifact = finalPass.artifact;
  totalRepairs += finalPass.repairs;

  if (auditStep) {
    await runRecorded(auditStep, accumulatedArtifact, totalRepairs);
  }

  // IMPORTANT deviation from the single-artifact path (intentional, spec-mandated):
  // the gate runs ONLY when the final full-artifact pass approves. The
  // single-artifact path runs the gate unconditionally whenever plan.gate is
  // set (see orchestrate.js:1489-1495 today); batching is stricter per the
  // template ("the phase gate runs only after the final pass approves").
  if (finalPass.approved && plan.gate) {
    if (isProductionFinancial(plan)) {
      assertGate(plan);
    }
    gate = runGate(plan.gate, { runner: gateRunner, throwOnFailure: false });
  }

  if (gate.status && gate.status !== 0) {
    exitCode = gate.status;
  } else if (stepFailureCode !== 0) {
    exitCode = stepFailureCode;
  } else if (!finalPass.approved) {
    exitCode = 1;
  }
}

const record = {
  runId,
  workflow: workflow.selected,
  phase: plan.phase,
  risk: plan.risk,
  approved: haltedAt === null && Boolean(finalPass?.approved),
  moa: finalPass ? finalPass.moaResult : null,
  repairs: totalRepairs,
  steps: records,
  batches: { total: plan.batches.length, results: batchResults, haltedAt },
  gate: {
    command: gate.command ?? null,
    status: gate.status ?? 0,
    skipped: gate.skipped ?? false,
  },
  exitCode,
};

if (ledgerWriter) {
  try {
    ledgerWriter(record);
  } catch {
    /* best-effort, same as executeWorkflow */
  }
}

return record;
```

Key invariants this must satisfy (test them explicitly, see below):

- Batch N+1's owner step never runs before batch N is `approved` — the `for`
  loop is sequential `await`, and the `break` on `!round.approved` guarantees
  this structurally. Do not parallelize this loop.
- Each batch's owner step receives `[accumulatedArtifact, batchDescription]` as
  `input` (via `initialOwnerInput`) — i.e. the FULL accumulated artifact from
  all prior APPROVED batches, not just its own to-do text.
- A batch that exhausts `maxRepairs` without approval sets `haltedAt` and stops
  the whole run before: any later batch's owner step runs, the final
  full-artifact pass runs, or the gate runs.
- The final full-artifact pass is a distinct `runOwnerReviewRepairRound` call
  scoped to the WHOLE accumulated artifact
  (`initialArtifact: accumulatedArtifact` — not `initialOwnerInput`, so no fresh
  owner run happens at the start of the final pass; it reviews what's there and
  only invokes the owner for repairs if rejected).
- The gate runs only when `haltedAt === null && finalPass.approved`.
- `maxRepairs` is shared (same ceiling) across every per-batch round and the
  final pass — do not give the final pass a separate ceiling.

## Step 3 — CLI flag, plan wiring, `main` dispatch

**`parseArgs`** (`orchestrate.js:59`): add `batchesFile: null` to the `options`
object, and a new branch in the arg-parsing loop:

```js
} else if (arg === '--batches-file') {
  options.batchesFile = argv[index + 1] || null;
  index += 1;
}
```

(`--batches-file` does not collide with any existing flag — confirmed by reading
the full flag list.)

**`createRoutingPlan`** (`orchestrate.js:433`): add a `batches = null`
parameter. After building the `plan` object, before `return plan`:

```js
if (Array.isArray(batches) && batches.length > 0) {
  plan.batches = batches;
}
```

**`main`** (`orchestrate.js:1682`): add `isAbsolute` to the `node:path` import
at the top of the file (alongside `dirname, join`). After computing
`routingPath`/`brainPath`/`soulPath` and before the first `createRoutingPlan`
call, load and validate the batches file (unconditionally — so it shows up in
`--dry-run --json` output too, same as routing/brain/soul are loaded
unconditionally today):

```js
let batches = null;
if (options.batchesFile) {
  const batchesPath = isAbsolute(options.batchesFile)
    ? options.batchesFile
    : join(ROOT, options.batchesFile);
  const parsed = (deps.loadJSON || loadJSON)(batchesPath);
  const isValid =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every(
      (entry) => typeof entry === 'string' && entry.trim().length > 0
    );
  if (!isValid) {
    throw new Error(
      `--batches-file must point to a JSON array of one or more non-empty strings (got: ${batchesPath}).`
    );
  }
  batches = parsed;
}
```

Pass `batches` into BOTH `createRoutingPlan` calls in `main` (the initial one
around `orchestrate.js:1733` and the `autoWorkflow` re-creation one around
`orchestrate.js:1751`) — both must carry batches through identically.

Backward compatibility: when `--batches-file` is never passed, `batches` stays
`null`, `plan.batches` is never set, `executeWorkflow`'s
`Array.isArray(plan.batches)` check is false, and every existing `--workflow`
mode behaves exactly as it does today. This must hold for every existing test in
`hermes-routing.test.ts` unmodified.

## Test requirements

Add tests (new file `tests/unit/routing/hermes-batched-workflow.test.ts`
preferred) covering all four acceptance points, following the mocking pattern
already established in `hermes-routing.test.ts`'s `executeWorkflow` describe
block (`makeRunner` helper building a `runStep` that records calls and replies
per role; `pairPlan`/`financialPairPlan`-shaped fixtures with `workflow.steps`
arrays). Import `executeWorkflow` (and anything else needed) from
`../../../orchestrate.js` the same way the existing file does (check its import
block at the top for the exact relative path and named exports it already pulls
in — add `executeWorkflow` batching coverage alongside, don't reinvent the
import style).

Required test cases:

1. **Sequential batches with accumulated-artifact context**: a plan with
   `batches: ['do X', 'do Y']` and a `runStep` mock where the owner step returns
   a distinguishable output per attempt/batch (e.g. include the batch index in
   the fake artifact). Assert: (a) batch 2's owner call does not fire until
   batch 1's reviewer/moa approves — order of `calls` proves this; (b) batch 2's
   owner-step `input` (as recorded by the mock) contains batch 1's approved
   output (e.g. `input[0]` equals batch 1's final artifact, `input[1]` equals
   the batch-2 description string).

2. **Hard-stop on a stuck batch**: 2+ batches where batch 1's reviewer never
   approves (mock always returns `approved: false`) so `maxRepairs` is
   exhausted. Assert: batch 2's owner step never runs (no matching entry in
   `calls`), the gate runner is never invoked (spy/counter stays at 0), and
   `record.exitCode !== 0` with `record.batches.haltedAt === 0`.

3. **Final full-artifact pass runs only after all batches approve**: a plan with
   2 batches, both approved on first try, plus a distinct final reviewer/moa
   response for the full-artifact pass. Assert the review step fires one extra
   time beyond the per-batch reviews (2 batches + 1 final = 3 reviewer
   invocations for a 2-batch plan), and that the final pass's
   `input`/artifact-under-review is the FULL accumulated artifact (both batches'
   content), not just batch 2's.

4. **Gate runs only after the final pass approves, not after each batch**:
   assert the `gateRunner` mock is invoked exactly once, and only after the
   final-pass reviewer/moa call recorded in (3) — not after batch 1's or batch
   2's individual approval. Also add the inverse: if the final pass never
   approves (exhausts repairs), assert the gate is NOT invoked at all (this is
   the intentional deviation from the single-artifact path's always-run-gate
   behavior — see the comment in step 2 above).

5. **Refactor-safety**: confirm (by running, not just reading) that every
   existing test in `hermes-routing.test.ts` passes UNMODIFIED after step 1 and
   step 2 land — this is the backward-compatibility proof, not a new test to
   write.

6. At least one `parseArgs`/`createRoutingPlan` test (can live in either file)
   proving: `--batches-file <path>` populates `options.batchesFile`; an invalid
   batches file (empty array, non-string entries, missing file) throws a clear
   error; `--dry-run --json` output includes `plan.batches` when the flag is
   supplied and omits it entirely when not.

7. At least one test exercising `main()` end-to-end with injected
   `deps.runStep`/`deps.gateRunner` (mirroring the existing "main executes a
   live workflow through executeWorkflow and returns its exit code" test) but
   WITH batches supplied via `deps` (inject batches directly into the
   plan-building path or via a temp JSON file + `--batches-file`, whichever is
   cleaner given `main`'s signature) — this is the "mocked --live run" proof for
   the batched path.

## Verification commands (run these yourself; report exact pass/fail)

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native --project=server \
  tests/unit/routing/hermes-routing.test.ts tests/unit/routing/hermes-batched-workflow.test.ts

node orchestrate.js --dry-run --json --phase production --task "sample task" --workflow pair
node orchestrate.js --dry-run --json --phase production --task "sample task" --workflow pair \
  --batches-file <path-to-a-temp-json-array-of-2-3-strings>
```

Confirm the second dry-run's JSON output includes `plan.batches` as the array
you supplied, and the first omits the `batches` key entirely.

## Completion report format

State: files changed (with line-count deltas), the exact final signature of
`runOwnerReviewRepairRound` (call out any deviation from this brief and why),
confirmation the CLI flag is exactly `--batches-file`, the exact commands run in
the Verification section above with their pass/fail results, and an explicit
yes/no for each of the four acceptance-criteria points with which test proves
it. Do not claim success without having run the tests — paste the actual pass
count / failure output.
