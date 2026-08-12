# PR #1385 Surface-Projection Test and CI Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Check unit-fast` deterministically green on PR #1385 by removing every full 18-profile knowledge-graph build from unit tests, moving real-projection proof to a new required `surface-projection-audit` CI lane (one build per PR), and moving byte-repeatability proof to Full Release Proof (two fresh-process builds, byte-compared).

**Architecture:** Split `rebuild-knowledge-graph.mjs` into three layers: pure canonical serialization (unit-tested, deterministic by construction), independently testable discovery reducers, and an inspector runner with hard lifecycle bounds. A new verifier script (`verify-surface-projection.mjs`) wraps the generator CLI in `pr` mode (one build) and `release` mode (two fresh-process builds + byte compare). Unit-fast tests consume bounded in-memory inputs only.

**Tech Stack:** Node 20+/22, ESM `.mjs`, vitest 4 (`--configLoader native`, project `server`), tsx, GitHub Actions unified CI + `CI Gate Status` fail-closed aggregation.

## Global Constraints

- Repo work happens ONLY in worktree `/Users/nikhil/code/Updog_restore/.worktrees/child-f`, branch `feat/child-f-g4-readiness`. cwd resets between tool calls — prefix every command with the worktree path. Main checkout has stale copies.
- Owner pushes to the same branch without notice. `git fetch` + re-read head before every commit/push decision.
- Scoped `git add <paths>` only. NEVER `git add -A` (untracked codex state + owner body files at worktree root).
- `TZ=UTC` for all test runs. No new dependencies. No emoji anywhere. Conventional commits.
- Governing plan `docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md` is byte-frozen; edits ONLY via a codex-plan-review round (Task 0). This recovery doc itself stays untracked until Task 0 says otherwise.
- `plan-approval` label stays ABSENT until Task 10 evidence exists.
- Merge order: PR #1385 lands before #1388/#1391/#1392.
- No timeout-only commits. No retries on evidence-grade proofs. No uploading generated projection artifacts.
- Release-proof workflow changes (Task 11) are EXCLUDED until post-approval.
- Evidence wording rule (use everywhere): "outer Vitest timeout observed; byte mismatch not excluded by logs; remedy covers both."
- Lifecycle bounds (60s/profile, 330s aggregate) are PROVISIONAL — chosen without instrumentation data; tuning procedure = NDJSON phase logs from first lane runs.
- vitest global `retry: 2` masks evidence-grade flakes: every NEW test in this plan that asserts lifecycle, gate, or workflow-pin behavior uses per-test `{ retry: 0 }`.

## Context for a zero-context session

PR #1385 (`feat/child-f-g4-readiness`) is blocked by five consecutive `Check unit-fast` failures, all in `tests/unit/audit/rebuild-knowledge-graph.test.mjs`. Head at plan time: `40e1c664`. One repeated observation exists: the runs at heads `1840746c` and `4169510f` executed identical failing-test and generator bytes. Root cause class: the unit test file runs full knowledge-graph builds — each spawns up to 4 concurrent inspector child processes (18 profiles total) while up to three other vitest CI workers (`maxWorkers: 4`) run competing test files on the same ~4 vCPU runner; the build's children plus sibling-worker load oversubscribe the host, and cold start amplifies it. Outer Vitest timeout observed; byte mismatch not excluded by logs; the remedy below covers both. This document is INFORMATIVE and NON-GOVERNING: the sole governing contract is Task 1 Addendum 2 of `docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md`; where the two conflict, that plan governs. An interim timeout bump was REJECTED because it would instrument a configuration this plan deletes (the lane runs the generator as one standalone CLI process, max 4 children).

Key existing code facts (verified at `40e1c664`):

- Generator: `audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs` (~990 lines). Public export `buildRouteKnowledgeGraph({ repoRoot, outputDir, expectedSha, mode })` at line 895. CLI entrypoint already supports `--mode`, `--expected-sha`, `--output-dir` (parseArgs, line 961).
- Module-level `runtimeDocumentsCache = new Map()` at line 47, used in `runtimeApiProjection` (lines 644-653), keyed by resolved repoRoot only. Removed in Task 5 (after call-site migration; no regex ban — regex pins are brittle, rationale recorded here).
- Serialization core (lines 929-958): `snapshotId = snapshot:sha256(stableJson({commit_sha, commit_timestamp, source_hashes, node_type_counts}))`; three JSONL byte buffers with per-record `snapshot_id` appended; manifest schema `surface-route-projection-v1` with `artifacts` hash/length map; `manifestBytes = stableJson(manifest) + "\n"`; four sequential `writeFile` calls (no staging, no ordering guarantees) — replaced in Task 3.
- Helpers already in the file and reused as-is: `stableJson`, `sha256`, `jsonLine`, `addCommitBinding`, `validateRecords`, `structuralEdges`, `mapWithConcurrency`, `currentHead`, `commitTimestamp`, `readInventory`, `sourceHashes`, `assertCleanProjectionInputs`, `parseMode`, `testProjection`, `workerProjection`, `extractClientRouteProjection`, `runInspector`.
- `INSPECTOR_PROFILES` has 18 entries (NOT 19). `RUNTIME_INSPECTOR_CONCURRENCY = 4`.
- Test file: `tests/unit/audit/rebuild-knowledge-graph.test.mjs`, 936 lines, one describe at 452 with 21 `it` blocks (inventory in Task 6).
- Validator: `audit/surface-contract-matrix/scripts/validate-matrix.mjs` accepts `graphDir` programmatically (line ~246); no CLI flag yet.
- Gate: `tests/regressions/ci-fail-closed.test.ts` pins `GATE_FEEDING_JOBS` (line ~2283) and asserts gate `needs` equality (line ~4629). CI: `.github/workflows/ci-unified.yml` matrix `job: [typecheck, lint, unit-fast]`.
- Release proof: `.github/workflows/release-proof.yml` runs ONE build at line ~104 (`npx tsx ... --mode release --expected-sha "$CANDIDATE_SHA"`), validates manifest freshness fields, `rm -rf audit/knowledge-graph/out` on exit trap. Graph artifacts are gitignored (only `scripts/` tracked) — there is no committed-bytes comparison anywhere.
- `gh run view --log` truncates; use `gh api .../logs`. `gh pr checks` exit code lies while pending — read output.

Contract model after this plan:

1. **Unit (unit-fast):** deterministic canonical serialization + reducers + lifecycle + preflight rejection, all from bounded in-memory or small-fixture inputs. Zero full builds.
2. **PR (`surface-projection-audit` lane):** exactly ONE real build against the exact merged-result checkout; proves discovery, coverage, integrity, matrix reconciliation.
3. **Release (Full Release Proof, Task 11, post-approval):** exactly TWO fresh-process builds, four-file byte identity. Named accepted assumption: real-tree byte repeatability is release-time coverage, not per-PR; between Task 10 landing and Task 11 landing, no two-build compare exists anywhere (owner-accepted gap window).
4. Residual (accepted, one line in governing-plan amendment): release-flavored bytes (`valid_for_release_proof: true`) are byte-tested only by the release verifier, never in the unit layer (manifest differs from seed flavor by that one field).

---

### Task 0: Governance bootstrap (BLOCKING — no code before this completes)

**Files:**
- Modify (via codex-plan-review round only): `docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md`
- Read: this plan; `/tmp/handoff-pr1385-test-failure-strategy.md` if it still exists.

**Interfaces:**
- Produces: ratified amendment + extended Task 0 preapproval allowlist that later tasks rely on for commit authority.

- [ ] **Step 1: Fetch + verify head.** `cd /Users/nikhil/code/Updog_restore/.worktrees/child-f && git fetch origin && git log --oneline -3`. If head moved past `40e1c664`, re-verify the code facts above before proceeding (line numbers may shift; contracts should not).
- [ ] **Step 2: Confirm the two owner decisions are ratified** (they were accepted when this plan was commissioned; re-confirm only if the owner reopened them): (a) structural batch lands INSIDE PR #1385; (b) two-build byte-repeatability lives in Full Release Proof only, with the named gap window.
- [ ] **Step 3: Run a codex-plan-review round** (skill `codex-plan-review`) amending the governing plan with: repeated failure at `40e1c664` (five red runs); profile count correction (18, not 19); cache behavior facts; the corrected evidence wording (verbatim from Global Constraints); the three-contract model; the structural-batch scope; provisional lifecycle bounds + tuning procedure; the residual-risk line from Context item 4; Task 0 allowlist extension covering exactly: `audit/knowledge-graph/scripts/**`, `audit/surface-contract-matrix/scripts/validate-matrix.mjs`, `scripts/release/verify-surface-projection.mjs` (new), `tests/unit/audit/**`, `tests/unit/scripts/**`, `tests/regressions/ci-fail-closed.test.ts`, `.github/workflows/ci-unified.yml`, this plan file, regenerated routing outputs. EXCLUDE `.github/workflows/release-proof.yml`.
- [ ] **Step 4: Recalculate and record the governing plan digest** per its own procedure. Do not proceed to Task 1 until the round returns APPROVE.

### Task 1: Pure serialization boundary `serializeRouteKnowledgeGraph`

**Files:**
- Modify: `audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs` (extract lines 929-951 logic into a new exported function; `buildRouteKnowledgeGraph` becomes a caller)
- Test: `tests/unit/audit/rebuild-knowledge-graph.test.mjs` (new tests appended; existing tests untouched in this task)

**Interfaces:**
- Consumes: existing helpers `stableJson`, `sha256`, `jsonLine`, `validateRecords`.
- Produces (exact contract later tasks and tests rely on):

```js
export function serializeRouteKnowledgeGraph({ nodes, edges, tests, head, timestamp, sourceHashes }) {
  // Returns:
  // {
  //   manifest,                       // schema surface-route-projection-v1, valid_for_release_proof: false ALWAYS
  //   nodes, edges, tests,            // snapshot-bound deep copies, exactly equal to parsed serialized files
  //   manifestBytes, nodesBytes, edgesBytes, testsBytes,  // Buffers
  // }
}
// Private (NOT exported): assembleReleaseManifest(serialized) — flips valid_for_release_proof to true,
// re-serializes manifestBytes. Only buildRouteKnowledgeGraph may call it, after exact-SHA, clean-tree,
// inventory, and count checks pass.
```

Semantics (all mandatory): no `mode` argument, no release authority; deep-copy all inputs before touching them (structuredClone) — returned values share no mutable aliases with caller input; canonicalize before hashing: sort node/edge/test records by `id` (`localeCompare`), rebuild `source_hashes` as key-sorted object, sort nested set-like arrays; `node_type_counts` computed from the canonicalized nodes; snapshot id, per-record `snapshot_id`, artifact hash/length map, and `manifestBytes = stableJson(manifest) + "\n"` exactly as the current lines 932-952 compute them.

- [ ] **Step 1: Write failing tests** (append to the test file):

```js
describe('serializeRouteKnowledgeGraph (pure)', () => {
  const baseInput = () => ({
    head: 'a'.repeat(40),
    timestamp: '2026-08-12T00:00:00Z',
    sourceHashes: { 'b/file.ts': 'h2', 'a/file.ts': 'h1' },
    nodes: [
      { record: 'node', id: 'api:GET /b', type: 'APIEndpoint', method: 'GET', path: '/b', source: { path: 's.ts', line: 2 } },
      { record: 'node', id: 'api:GET /a', type: 'APIEndpoint', method: 'GET', path: '/a', source: { path: 's.ts', line: 1 } },
    ],
    edges: [],
    tests: [],
  });

  it('is byte-identical under reversed record order and varied source-hash insertion order', async () => {
    const { serializeRouteKnowledgeGraph } = await requireGenerator();
    const a = serializeRouteKnowledgeGraph(baseInput());
    const shuffled = baseInput();
    shuffled.nodes.reverse();
    shuffled.sourceHashes = { 'a/file.ts': 'h1', 'b/file.ts': 'h2' };
    const b = serializeRouteKnowledgeGraph(shuffled);
    expect(a.manifestBytes.equals(b.manifestBytes)).toBe(true);
    expect(a.nodesBytes.equals(b.nodesBytes)).toBe(true);
  });

  it('never emits release authority and does not alias caller input', async () => {
    const { serializeRouteKnowledgeGraph } = await requireGenerator();
    const input = baseInput();
    const result = serializeRouteKnowledgeGraph(input);
    expect(result.manifest.valid_for_release_proof).toBe(false);
    expect(result.nodes[0]).not.toBe(input.nodes[0]);
    result.nodes[0].id = 'mutated';
    expect(input.nodes.some((n) => n.id === 'mutated')).toBe(false);
  });

  it('returned records exactly equal parsed serialized files including snapshot_id', async () => {
    const { serializeRouteKnowledgeGraph } = await requireGenerator();
    const result = serializeRouteKnowledgeGraph(baseInput());
    const parsed = result.nodesBytes.toString('utf8').trim().split('\n').map(JSON.parse);
    expect(parsed).toEqual(result.nodes);
    expect(JSON.parse(result.manifestBytes.toString('utf8'))).toEqual(result.manifest);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `cd /Users/nikhil/code/Updog_restore/.worktrees/child-f && TZ=UTC npx vitest run tests/unit/audit/rebuild-knowledge-graph.test.mjs --config vitest.config.mjs --configLoader native --project=server -t 'serializeRouteKnowledgeGraph'` — expect FAIL (export missing).
- [ ] **Step 3: Implement.** Extract current lines 929-951 into `serializeRouteKnowledgeGraph` with the canonicalization + deep-copy semantics above; add private `assembleReleaseManifest`; rewrite the tail of `buildRouteKnowledgeGraph` to call the pure function, then (release mode only, after its existing checks) `assembleReleaseManifest`, then hand the four buffers to the existing write section (Task 3 replaces that section).
- [ ] **Step 4: Run the new tests (expect PASS) plus the full file warm** to prove no regression: same command without `-t`. Existing heavyweight tests still run here (~33s warm) — they are removed in Task 6, not now.
- [ ] **Step 5: Commit.** `git add audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs tests/unit/audit/rebuild-knowledge-graph.test.mjs && git commit -m "refactor(audit): extract pure serializeRouteKnowledgeGraph boundary"`

### Task 2: Discovery reducer seams

**Files:**
- Modify: `audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs`
- Test: `tests/unit/audit/rebuild-knowledge-graph.test.mjs`

**Interfaces:**
- Produces (exact exports later tasks/tests use):

```js
export function reduceRuntimeDocuments(documents)
// documents: array of inspector JSON documents ({ routes: [{ id, method, path, role, site, surface }] }).
// Returns APIEndpoint node records: dedupe by `api:<METHOD> <path>`, drop non-`api:`/shadowed/non-absolute
// paths, precedence guard(0) < handler(1) < shadowed(2) then site then surface tiebreak, source-site
// split into { path, line }, output sorted by id. This is EXACTLY the logic currently inlined at
// lines 654-690 of runtimeApiProjection — move it, do not rewrite it.

export function reduceWorkerFindings(findings)
// The grouping/filter/canonicalization currently inside workerProjection after its scan step.

export async function reduceTestProjection(root, nodes)
// Rename of existing testProjection: tracked test/spec discovery via git ls-files fixture root,
// alias resolution, row targets, earliest-line selection, stable ordering. Signature unchanged.
```

`runtimeApiProjection` becomes: gather documents (inspector calls) then `return reduceRuntimeDocuments(documents)`. `workerProjection` likewise. No behavior change — refactor only.

- [ ] **Step 1: Write failing tests** — one per reducer, bounded literal inputs:

```js
describe('discovery reducers (pure)', () => {
  it('reduceRuntimeDocuments dedupes across profiles with guard precedence and stable order', async () => {
    const { reduceRuntimeDocuments } = await requireGenerator();
    const docs = [
      { routes: [{ id: 'api:x', method: 'GET', path: '/b', role: 'handler', site: 's.ts:9', surface: 'p1' }] },
      { routes: [
        { id: 'api:x', method: 'GET', path: '/b', role: 'guard', site: 's.ts:3', surface: 'p2' },
        { id: 'api:x', method: 'GET', path: '/a', role: 'handler', site: 's.ts:5', surface: 'p2' },
        { id: 'client:x', method: 'GET', path: '/c', role: 'handler', site: 's.ts:1', surface: 'p2' },
        { id: 'api:x', method: 'GET', path: 'relative', role: 'handler', site: 's.ts:2', surface: 'p2' },
        { id: 'api:x', method: 'GET', path: '/d', role: 'shadowed', site: 's.ts:4', surface: 'p2' },
      ] },
    ];
    const records = reduceRuntimeDocuments(docs);
    expect(records.map((r) => r.id)).toEqual(['api:GET /a', 'api:GET /b']);
    const b = records.find((r) => r.id === 'api:GET /b');
    expect(b.source).toEqual({ path: 's.ts', line: 3 }); // guard wins over handler
  });
});
```

Add the equivalent bounded test for `reduceWorkerFindings` using two literal findings that group to one node, and for `reduceTestProjection` reuse the existing bounded git fixture helpers already in the file (`createDeterministicProjectionFixture` machinery gets simplified in Task 6; here target a minimal `git init` fixture with two tracked test files).

- [ ] **Step 2: Run, expect FAIL** (exports missing). Same vitest command as Task 1 with `-t 'discovery reducers'`.
- [ ] **Step 3: Implement** by moving code, exporting, and re-pointing the two projection functions.
- [ ] **Step 4: Run new tests PASS + full file warm PASS.**
- [ ] **Step 5: Commit.** `git commit -m "refactor(audit): expose pure discovery reducers"` (scoped add, same two files).

### Task 3: Writer hardening — validate, stage, rename, manifest last

**Files:**
- Modify: `audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs` (replace the four bare `writeFile` calls, lines ~953-957)
- Test: `tests/unit/audit/rebuild-knowledge-graph.test.mjs`

**Interfaces:**
- Produces:

```js
export async function writeRouteKnowledgeGraphArtifacts({ outputDir, serialized })
// serialized: the full return value of serializeRouteKnowledgeGraph (or the release-assembled variant).
// 1) Validate BEFORE touching destination: exactly the four named buffers present; manifest artifact
//    hashes/lengths recompute from the buffers; counts match records; every record carries the manifest
//    snapshot_id; resolved outputDir stays inside the caller-provided root (no path escape).
// 2) Write each buffer to a unique sibling staging file `<name>.<pid>.<random>.tmp` in outputDir.
// 3) rename() the three data files first, manifest.json LAST (manifest = commit point).
// 4) On any failure: unlink only the staging paths this call created. Never readdir()-sweep,
//    never delete outputDir.
```

- [ ] **Step 1: Write failing tests** with preconstructed artifacts (no build):

```js
describe('writeRouteKnowledgeGraphArtifacts', () => {
  it('rejects a tampered artifact set before any destination write', async () => {
    const { serializeRouteKnowledgeGraph, writeRouteKnowledgeGraphArtifacts } = await requireGenerator();
    const serialized = serializeRouteKnowledgeGraph(baseInput());
    serialized.manifest.artifacts['nodes-routes.jsonl'].sha256 = 'f'.repeat(64);
    await withOutputDir(async (outputDir) => {
      await expect(writeRouteKnowledgeGraphArtifacts({ outputDir, serialized })).rejects.toThrow(/hash/i);
      expect(await readdir(outputDir)).toEqual([]); // destination untouched
    });
  });

  it('publishes manifest.json last and rejects release-flavored manifests without authority', { retry: 0 }, async () => {
    const { serializeRouteKnowledgeGraph, writeRouteKnowledgeGraphArtifacts } = await requireGenerator();
    const fsPromises = await import('node:fs/promises');
    const renameSpy = vi.spyOn(fsPromises, 'rename');
    try {
      const serialized = serializeRouteKnowledgeGraph(baseInput());
      await withOutputDir(async (outputDir) => {
        await writeRouteKnowledgeGraphArtifacts({ outputDir, serialized });
        const renamed = renameSpy.mock.calls.map(([, dest]) => path.basename(dest));
        expect(renamed.at(-1)).toBe('manifest.json');
        expect(renamed.slice(0, -1).sort()).toEqual(['edges-routes.jsonl', 'nodes-routes.jsonl', 'tests.jsonl']);
      });
      const forged = serializeRouteKnowledgeGraph(baseInput());
      forged.manifest.valid_for_release_proof = true;
      forged.manifestBytes = Buffer.from(`${JSON.stringify(forged.manifest)}\n`);
      await withOutputDir(async (outputDir) => {
        await expect(writeRouteKnowledgeGraphArtifacts({ outputDir, serialized: forged })).rejects.toThrow(/authority/i);
      });
    } finally {
      renameSpy.mockRestore();
    }
  });
});
```

Authority rule (part of the writer contract): the exported writer rejects any set whose manifest carries `valid_for_release_proof: true` unless called with a private module-scope authority token (`{ authority: RELEASE_AUTHORITY }`, a Symbol NOT exported); only `buildRouteKnowledgeGraph`'s release path passes it. Public serialization/writing APIs therefore cannot mint release-valid output. (Note: if the generator imports `fs/promises` as a namespace this spy works; if it destructures at module top, inject an `fsImpl` option on the writer instead and assert on the fake — pick whichever matches the file, keep the same assertions.)

(`baseInput` from Task 1 — hoist it to file-level helper when implementing.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; `buildRouteKnowledgeGraph` now ends with `await writeRouteKnowledgeGraphArtifacts(...)` and returns the manifest as before (CLI stdout contract unchanged).
- [ ] **Step 4: Run new tests PASS + existing write-confinement test at line 841 still PASS** (it migrates to preconstructed artifacts in Task 6; must stay green both before and after).
- [ ] **Step 5: Commit.** `git commit -m "feat(audit): staged atomic artifact writer with manifest-last publish"`

### Task 4: Inspector runner with hard lifecycle bounds

**Files:**
- Create: `audit/knowledge-graph/scripts/inspector-runner.mjs`
- Test: `tests/unit/audit/knowledge-graph-inspector-runner.test.mjs` (new file)

**Interfaces:**
- Consumes: `runInspector(root, profile)` stays in the generator; the runner receives a spawn function so tests inject fakes.
- Produces:

```js
export async function runInspectorProfiles({
  profiles,            // string[] — production passes all 18
  concurrency = 4,
  spawnProfile,        // (profile, { signal }) => Promise<document> — production wraps runInspector's child spawn
  perProfileTimeoutMs = 60_000,   // PROVISIONAL bound
  aggregateTimeoutMs = 330_000,   // PROVISIONAL bound
  log,                 // (ndjsonObject) => void — runner emits phase/profile events; caller owns stderr
})
// Returns documents in profiles-list order.
// One execution per profile, no retries. First failure stops new scheduling and aborts active siblings
// concurrently via AbortSignal. Abort escalation for child-process spawners: SIGTERM, wait <=2s, SIGKILL,
// wait <=2s. Runner awaits every in-flight promise settling and reports { active_children: 0 } in a final
// NDJSON summary on EVERY exit path (success, failure, timeout, SIGINT/SIGTERM of the wrapper).
```

NDJSON event fields (bounded; no projection contents, no child stderr passthrough, no env dumps): `{ event, phase, profile, duration_ms, exit_code, signal, active_children }`.

- [ ] **Step 1: Write failing tests** (all with `{ retry: 0 }`), fake spawnProfile = plain promises/timers — no real children:

```js
import { describe, expect, it, vi } from 'vitest';
import { runInspectorProfiles } from '../../../audit/knowledge-graph/scripts/inspector-runner.mjs';

describe('runInspectorProfiles', () => {
  it('returns documents in profile-list order despite out-of-order completion', { retry: 0 }, async () => {
    const delays = { a: 30, b: 5, c: 15 };
    const docs = await runInspectorProfiles({
      profiles: ['a', 'b', 'c'],
      concurrency: 3,
      spawnProfile: (p) => new Promise((res) => setTimeout(() => res({ profile: p }), delays[p])),
      log: () => {},
    });
    expect(docs.map((d) => d.profile)).toEqual(['a', 'b', 'c']);
  });

  it('first failure aborts active siblings and schedules nothing new', { retry: 0 }, async () => {
    const aborted = [];
    const spawnProfile = (p, { signal }) => p === 'bad'
      ? Promise.reject(new Error('boom'))
      : new Promise((_res, rej) => signal.addEventListener('abort', () => { aborted.push(p); rej(new Error('aborted')); }));
    await expect(runInspectorProfiles({
      profiles: ['slow1', 'bad', 'slow2', 'never'], concurrency: 3, spawnProfile, log: () => {},
    })).rejects.toThrow('boom');
    expect(aborted.sort()).toEqual(['slow1', 'slow2']); // 'never' was never scheduled
  });

  it('enforces per-profile timeout and reports active_children 0 on every exit path', { retry: 0 }, async () => {
    const events = [];
    await expect(runInspectorProfiles({
      profiles: ['hang'], perProfileTimeoutMs: 20,
      spawnProfile: (_p, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))),
      log: (e) => events.push(e),
    })).rejects.toThrow(/timeout/i);
    expect(events.at(-1)).toMatchObject({ active_children: 0 });
  });
});
```

Add one test with `vi.useFakeTimers()` for the aggregate deadline; wrap timer advances in the documented act/await pattern and restore real timers in `finally`.

- [ ] **Step 2: Run, expect FAIL** (module missing): `TZ=UTC npx vitest run tests/unit/audit/knowledge-graph-inspector-runner.test.mjs --config vitest.config.mjs --configLoader native --project=server`
- [ ] **Step 3: Implement the runner.** Worker-pool over `mapWithConcurrency` pattern but with AbortController + deadline timers; TERM/KILL escalation lives in the production `spawnProfile` wrapper (Task 5), keyed off the abort signal — the runner itself is transport-agnostic. The existing inspector-side 45-second internal race (inside `inspect-runtime.mjs`) stays as-is and becomes diagnostic only: the parent per-profile deadline owns actual process termination.
- [ ] **Step 4: Run PASS.**
- [ ] **Step 5: Commit.** `git add audit/knowledge-graph/scripts/inspector-runner.mjs tests/unit/audit/knowledge-graph-inspector-runner.test.mjs && git commit -m "feat(audit): inspector runner with hard lifecycle bounds"`

### Task 5: Wire runner into generator; remove runtimeDocumentsCache

**Files:**
- Modify: `audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs`

**Interfaces:**
- Consumes: `runInspectorProfiles` (Task 4), `reduceRuntimeDocuments` (Task 2).
- Produces: `runtimeApiProjection(root)` = spawnProfile wrapper (child spawn + SIGTERM/2s/SIGKILL/2s escalation on abort + per-profile NDJSON to stderr) -> `runInspectorProfiles` -> `reduceRuntimeDocuments`. Delete line 47 cache and the `has/set/get` block at 646-653 entirely.

- [ ] **Step 1: Grep for cache dependents before deleting** (migration proof the plan requires): `grep -rn "runtimeDocumentsCache" audit/ tests/` — expect hits only inside `rebuild-knowledge-graph.mjs`. If a test matches, migrate it first.
- [ ] **Step 2: Implement wiring + deletion.** Also emit generator-level NDJSON phase events to stderr: `phase in {runtime-aggregate, client, worker, tests-projection, serialization, write, validation}` with `duration_ms`, plus checkout SHA and artifact hash/length summary. Reuse the runner's `log` callback.
- [ ] **Step 3: Warm full-file run PASS** (heavyweight tests still present until Task 6): `TZ=UTC npx vitest run tests/unit/audit/rebuild-knowledge-graph.test.mjs --config vitest.config.mjs --configLoader native --project=server`. Determinism test at line 668 now exercises TWO REAL BUILDS (cache gone) — if it fails here on byte diff, STOP: that is a live nondeterminism find; capture both output trees, diff, fix the generator before proceeding (evidence wording rule applies).
- [ ] **Step 4: Commit.** `git commit -m "feat(audit): route runtime inspection through bounded runner; drop module cache"`

### Task 6: Unit-fast test migration — zero full builds

**Files:**
- Modify: `tests/unit/audit/rebuild-knowledge-graph.test.mjs`

**Interfaces:**
- Consumes: `serializeRouteKnowledgeGraph`, `writeRouteKnowledgeGraphArtifacts`, `reduceRuntimeDocuments`, `reduceWorkerFindings`, `reduceTestProjection` (Tasks 1-4).
- Produces: a test file whose every case completes from bounded inputs; the `buildRealProjection` helper (line 89) is DELETED.

Migration table for the 21 existing `it` blocks in the describe at line 452 (line numbers at `40e1c664`). "Keep" = untouched; "Reduce" = rewrite against the named seam with equivalent assertions; "Delete" = covered elsewhere:

| Line | Test | Action |
|---|---|---|
| 453 | exports + CLI default output | Keep; extend export assertions to the five new exports |
| 465 | manifest source hashes -> seeded inventory | Reduce: pure serializer output vs literal inventory object |
| 484 | inventory self-path hash agreement | Reduce: same seam as 465 |
| 505 | tamper artifact after manifest write | Reduce: preconstructed `serializeRouteKnowledgeGraph` output + `writeRouteKnowledgeGraphArtifacts` + byte-flip on disk + validator-side check |
| 529 | JSONL snapshot identity edit | Reduce: same preconstructed-artifact pattern |
| 561 | manifest HEAD not repo HEAD | Keep (preflight; fails before discovery) |
| 579 | manifest/inventory hash disagreement | Reduce: serializer output + mutated literal inventory |
| 597 | one-commit matrix skew | Keep (matrix-file logic, no build) |
| 612 | release count drift + seed rebaseline | Reduce: pure count-check seam — call `buildRouteKnowledgeGraph` against a fixture whose inventory `kg_counts` disagree; primary assertion = thrown line-925 count-mismatch message. Do NOT try to spy `reduceTestProjection` via the namespace export (intra-module direct calls bypass namespace spies — same ESM limitation noted in Task 3); if no-TESTS-scan proof is needed beyond the error message, add an injectable projection seam to `buildRouteKnowledgeGraph` and assert on the fake |
| 643 | release HEAD mismatch + dirty tree | Keep (preflight rejection; bounded git fixture) |
| 668 | deterministic bytes, two full builds | Delete; replaced by Task 1 pure determinism tests + Task 11 release verifier |
| 728 | allowlisted edge records | Reduce: `structuralEdges` + reducers over literal nodes |
| 768 | TESTS edges for tracked tests | Reduce: minimal git fixture + `reduceTestProjection` direct |
| 802 | duplicate IDs / missing source / inspection failure | Reduce: `validateRecords` + `reduceRuntimeDocuments` literals; inspection-failure case moves to runner tests (Task 4) |
| 841 | write confinement to outputDir | Reduce: preconstructed artifacts + `writeRouteKnowledgeGraphArtifacts` |
| 854 | seed/validation input compatibility | Reduce: serializer output shape vs validator expectations |
| 877 | real client parity /login,/lp exceptions | Keep (static client extraction, no inspectors — verify wall time <5s; if slower, move to lane wrapper and note in commit body) |
| 898 | client governance record removal | Keep (same static extraction) |
| 916 | worker grouping 19 sites -> 10 nodes | Reduce: `reduceWorkerFindings` over the real scanner's findings IF scanner alone is <5s; otherwise literal findings fixture |

- [ ] **Step 1: Apply the table top-to-bottom.** Delete `buildRealProjection` helper and `createDeterministicProjectionFixture` (line 273) once no case references them. Delete the line-668 test. Rewrites keep assertion strength — byte assertions stay `.equals()`, never structural-diff fallback.
- [ ] **Step 2: Grep proof of the boundary:** `grep -n "buildRealProjection\|createDeterministicProjectionFixture" tests/unit/audit/rebuild-knowledge-graph.test.mjs` — expect zero hits. `grep -c "buildRouteKnowledgeGraph(" tests/unit/audit/rebuild-knowledge-graph.test.mjs` — remaining callers must all be preflight-rejection cases (561, 612, 643 lineage).
- [ ] **Step 3: Run the file COLD and time it:** `time TZ=UTC npx vitest run tests/unit/audit/rebuild-knowledge-graph.test.mjs --config vitest.config.mjs --configLoader native --project=server`. Expected: PASS, wall time under 30s with zero inspector children (verify: no `inspect-runtime` processes during the run — `pgrep -fl inspect-runtime` from a second shell stays empty).
- [ ] **Step 4: Commit.** `git commit -m "test(audit): migrate knowledge-graph unit suite to bounded inputs; drop full builds"`

### Task 7: Validator `--graph-dir`

**Files:**
- Modify: `audit/surface-contract-matrix/scripts/validate-matrix.mjs`
- Test: `tests/unit/audit/surface-contract-matrix.test.ts`

**Interfaces:**
- Produces: `validateMatrix({ writeMetadata = true, graphDir = defaultKnowledgeGraphDir })` (programmatic param already exists at ~line 246 — this task adds the CLI surface) and CLI `--graph-dir <absolute-path>`. Rejections: missing value, duplicate flag, relative path, unknown argument. `--no-write-metadata` behavior and repo-root-as-source-root unchanged.

- [ ] **Step 1: Write failing CLI-parse tests** (import the exported arg parser; if parsing is inline, extract `parseValidateMatrixArgs(argv)` as part of this task):

```ts
it('accepts absolute --graph-dir and rejects relative, duplicate, missing, unknown', { retry: 0 }, () => {
  expect(parseValidateMatrixArgs(['--graph-dir', '/tmp/g'])).toMatchObject({ graphDir: '/tmp/g' });
  expect(() => parseValidateMatrixArgs(['--graph-dir', 'rel/g'])).toThrow(/absolute/);
  expect(() => parseValidateMatrixArgs(['--graph-dir', '/a', '--graph-dir', '/b'])).toThrow(/duplicate/);
  expect(() => parseValidateMatrixArgs(['--graph-dir'])).toThrow(/value/);
  expect(() => parseValidateMatrixArgs(['--bogus'])).toThrow(/unknown/i);
});
```

- [ ] **Step 2: Run, expect FAIL.** `TZ=UTC npx vitest run tests/unit/audit/surface-contract-matrix.test.ts --config vitest.config.mjs --configLoader native --project=server -t 'graph-dir'`
- [ ] **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit** `feat(audit): validate-matrix --graph-dir flag`.

### Task 8: Verifier `verify-surface-projection.mjs`

**Files:**
- Create: `scripts/release/verify-surface-projection.mjs`
- Test: `tests/unit/scripts/verify-surface-projection.test.mjs` (new)

**Interfaces:**
- Consumes: generator CLI (`--mode release --expected-sha --output-dir`), `validateMatrix({ graphDir, writeMetadata: false })`.
- Produces:

```text
node scripts/release/verify-surface-projection.mjs \
  --proof pr|release \
  --expected-sha <40-hex> \
  --output-root <absolute-owned-directory>
```

Behavior contract (each bullet gets a test):

1. Assert `git rev-parse HEAD` equals `--expected-sha`; record `checkout_sha` and (when `GITHUB_SHA`/PR context present) `pr_head_sha` separately — PR manifests bind to the synthetic merge checkout.
2. Resolve the local tsx entrypoint (`node_modules/.bin/tsx` from repo root); NEVER `npx`.
3. `pr` mode: exactly one generator child process, one output directory `<output-root>/build-1`.
4. `release` mode: exactly two sequential generator child processes, `<output-root>/build-1` and `<output-root>/build-2`; fresh process each (no shared module state possible); after both succeed, print per-file sha256+length diagnostics, then byte-compare all four files; any inequality = failure AFTER diagnostics print.
5. Both modes: validate manifest freshness (`fresh_for_checkout`, `valid_for_release_proof`, `repo_head === expected`), record bindings, artifact hashes/lengths, required API/client/worker/structural/TESTS coverage counts > 0, then `validateMatrix({ graphDir: build1Dir, writeMetadata: false })`.
6. Assert tracked worktree unchanged after builds (`git status --porcelain` over tracked files empty-delta vs pre-run capture).
7. No retries anywhere; the second release build is proof repetition, not a retry.
8. Cleanup: remove exactly `<output-root>/build-1` and `/build-2` on success, failure, SIGINT, SIGTERM. Never remove `--output-root` itself. Never upload artifacts.
9. Arg validation mirrors Task 7 rigor: `--proof` must be `pr` or `release`; `--expected-sha` must match `^[0-9a-f]{40}$`; `--output-root` absolute; unknown args rejected.

- [ ] **Step 1: Write failing tests.** Structure the module as `export async function runVerifier(options, { spawnBuild, exec })` with the CLI shim at bottom (same `isEntrypoint` pattern as the generator, line 973). Tests inject fake `spawnBuild` writing canned artifact sets from `serializeRouteKnowledgeGraph` fixtures into the build dirs — no real builds:

```js
it('release mode byte-compares four files and fails after printing diagnostics', { retry: 0 }, async () => {
  const logs = [];
  const result = runVerifier(
    { proof: 'release', expectedSha: SHA, outputRoot: tmpRoot },
    { spawnBuild: fakeBuildDiveringOnSecond, exec: fakeGitEnv(SHA), log: (l) => logs.push(l) },
  );
  await expect(result).rejects.toThrow(/byte/i);
  expect(logs.join('\n')).toMatch(/nodes-routes\.jsonl.*sha256/);
});

it('pr mode spawns exactly one build; release exactly two', { retry: 0 }, async () => { /* count fake calls */ });
it('rejects malformed sha, relative output root, unknown proof mode', { retry: 0 }, async () => { /* arg cases */ });
it('cleans owned build dirs on failure but preserves output-root', { retry: 0 }, async () => { /* fs asserts */ });
```

- [ ] **Step 2: FAIL run.** **Step 3: Implement.** **Step 4: PASS run** (`tests/unit/scripts/verify-surface-projection.test.mjs`).
- [ ] **Step 5: Smoke the real thing once locally** (this is the lane's exact invocation): `cd <worktree> && node scripts/release/verify-surface-projection.mjs --proof pr --expected-sha "$(git rev-parse HEAD)" --output-root "$(mktemp -d)"` — expect PASS and NDJSON phase lines on stderr. Record total wall time in the commit body (first real data point for the provisional bounds).
- [ ] **Step 6: Commit.** `git add scripts/release/verify-surface-projection.mjs tests/unit/scripts/verify-surface-projection.test.mjs && git commit -m "feat(release): surface-projection verifier with pr and release proof modes"`

### Task 9: CI lane + gate rewire + fail-closed regressions

**Files:**
- Modify: `.github/workflows/ci-unified.yml`
- Modify: `tests/regressions/ci-fail-closed.test.ts` (`GATE_FEEDING_JOBS` ~2283, gate-needs assert ~4629, plus new expected/skip truth-table pins)

**Interfaces:**
- Consumes: verifier CLI (Task 8).
- Produces: required job `surface-projection-audit` feeding `CI Gate Status`.

Job spec (translate to the workflow's existing idioms — reuse `setup-node-env` composite and the existing `changes` job outputs):

```yaml
surface-projection-audit:
  name: Surface Projection Audit
  needs: changes            # deliberately NOT needs unit-fast: audit evidence must not be hidden by unit failures
  if: needs.changes.outputs.heavy_ci_relevant == 'true' || inputs.run_full_suite == 'true'
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@<pinned-sha-already-used-in-file>
      with:
        fetch-depth: 2      # matches unit-fast precedent; full history NOT required (drift test passes at 2)
    - uses: ./.github/actions/setup-node-env
    - name: Run PR surface projection proof
      env: { CI: 'true', TZ: UTC, NODE_OPTIONS: --max-old-space-size=4096 }
      run: |
        set -euo pipefail
        node scripts/release/verify-surface-projection.mjs \
          --proof pr \
          --expected-sha "$GITHUB_SHA" \
          --output-root "$RUNNER_TEMP/surface-projection"
```

Gate truth table to pin in `ci-fail-closed.test.ts` (mirror the existing `tests-full (schema gate) | skipped | $schema_changed` expected-skip row idiom):

| Audit expected? | Result | Gate |
|---|---|---|
| yes | success | pass |
| yes | anything else (failure/cancelled/timeout/skipped) | fail |
| no | skipped | pass |
| no | success (unexpected run) | fail |
| no | failure/cancelled | fail |

- [ ] **Step 1: Write failing regressions first** (all `{ retry: 0 }`): add `surface-projection-audit` to `GATE_FEEDING_JOBS`; add truth-table rows; pin that the job uses `--proof pr`, `$RUNNER_TEMP` output root, `fetch-depth: 2`, `timeout-minutes: 15`, `needs: [changes]` only, and the broad `heavy_ci_relevant` filter (assert NO narrower KG-specific filter exists). Run `TZ=UTC npx vitest run tests/regressions/ci-fail-closed.test.ts --config vitest.config.mjs --configLoader native --project=server` — expect the new pins FAIL.
- [ ] **Step 2: Implement the workflow job + wire gate `needs` + gate-status expression + summary/PR-comment rows.**
- [ ] **Step 3: Run regressions PASS.** YAML validation: run actionlint if available locally (check `package.json` scripts for a workflow-lint entry, or `command -v actionlint`); otherwise the ci-fail-closed pins are the pre-push YAML check and the first CI run at Task 10 is the live verification. No push happens in this task (Sequencing note).
- [ ] **Step 4: Commit.** `git add .github/workflows/ci-unified.yml tests/regressions/ci-fail-closed.test.ts && git commit -m "ci: add required surface-projection-audit lane with fail-closed gate semantics"`

### Task 10: Full verification, evidence, push

**Files:**
- No new files. Evidence goes in the PR comment / commit bodies, not committed artifacts.

- [ ] **Step 1: Full targeted battery** (from worktree root, each expected PASS):

```bash
TZ=UTC npx vitest run \
  tests/unit/audit/rebuild-knowledge-graph.test.mjs \
  tests/unit/audit/knowledge-graph-inspector-runner.test.mjs \
  tests/unit/audit/surface-contract-matrix.test.ts \
  tests/unit/scripts/verify-surface-projection.test.mjs \
  tests/regressions/ci-fail-closed.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

- [ ] **Step 2: Full suite + static gates** (test infrastructure changed -> full `npm test` is mandatory, not optional):

```bash
TZ=UTC npm test
npm run lint
npm run check
npm run build
```

- [ ] **Step 3: Routing regen if any `docs/**/*.md` became tracked** in Task 0 amendment: `npm run docs:routing:generate` and commit regenerated outputs with the plan file.
- [ ] **Step 4: Fetch, rebase-check, push.** `git fetch origin && git status && git log --oneline origin/feat/child-f-g4-readiness..HEAD` — verify only this plan's commits are ahead; owner may have pushed. Push, then verify with `git ls-remote origin feat/child-f-g4-readiness` (never trust piped push output).
- [ ] **Step 5: Watch the PR CI to terminal state.** `gh pr checks 1385 --watch` (read output, ignore rc while pending). Required green: typecheck, lint, unit-fast, Surface Projection Audit, CI Gate Status. Pull the lane's NDJSON phase timings from the run log (`gh api repos/nikhillinit/Updog_restore/actions/runs/<id>/logs`) and record: per-profile durations, aggregate, total wall. If any provisional bound was exceeded or margin <25%, propose retune in the PR comment (data now exists).
- [ ] **Step 6: Evidence comment on PR #1385** containing: unit-fast wall time (expect minutes lower), zero-inspector-in-unit-fast proof (Task 6 Step 3), lane single-build proof + timings, gate rows, the evidence wording rule sentence, and the named gap window (no two-build compare until Task 11). Then hand back to owner for PLAN-APPROVAL-V2 comment cycle at the exact green head; reapply `plan-approval` label only per governing-plan procedure.

### Task 11: Full Release Proof conversion (POST-APPROVAL ONLY — separate commit, owner-gated)

**Files:**
- Modify: `.github/workflows/release-proof.yml` (line ~104 region)
- Modify: `tests/regressions/ci-fail-closed.test.ts` (release-proof pins)

**Interfaces:**
- Consumes: verifier `--proof release` (Task 8).

- [ ] **Step 1: Confirm owner approval recorded** (PLAN-APPROVAL-V2 landed; release-proof edits were excluded from Task 0 allowlist — this task needs its explicit unlock).
- [ ] **Step 2: Write failing release-proof pins** in `ci-fail-closed.test.ts` ({ retry: 0 }): workflow invokes `verify-surface-projection.mjs --proof release` with fenced `$CANDIDATE_SHA` (never raw `github.sha`), `--output-root "$RUNNER_TEMP/..."`, no artifact upload steps, 40-minute job bound preserved, cleanup trap intact.
- [ ] **Step 3: Replace the direct build block** (`npx tsx ... rebuild-knowledge-graph.mjs` + inline `node -e` manifest check + `validate-matrix` call) with:

```yaml
          node scripts/release/verify-surface-projection.mjs \
            --proof release \
            --expected-sha "$CANDIDATE_SHA" \
            --output-root "$RUNNER_TEMP/surface-projection"
```

Preserve: candidate checkout/fence steps, Node parity, Phoenix truth, final `npm run release:check`, existing trap cleanup (verifier owns its build dirs; trap stays as backstop).
- [ ] **Step 4: Pins PASS locally; commit** `ci(release): two fresh-process surface-projection builds with byte identity`; push; dispatch release-proof against exact candidate SHA per runbook; verify green; capture two-manifest + byte-identity evidence in the release record.

## Acceptance criteria (whole plan)

- unit-fast launches zero 18-profile builds; `tests/unit/audit/**` completes cold under 60s aggregate with no inspector children observable.
- PR lane performs exactly one real exact-checkout build within 15 minutes; NDJSON identifies every phase and profile duration; failure names the last active phase/profile.
- Release verifier (post-Task 11) performs exactly two fresh-process builds with four-file byte identity.
- Every verifier/runner exit path reports `active_children=0`.
- CI Gate green at exact approved head; Full Release Proof green at exact candidate SHA.
- No retries, no `continue-on-error`, no weakened byte assertions, no uploaded projection artifacts anywhere in the delivered diff.

## Sequencing note

Tasks 1-9 form ONE local commit series pushed together at Task 10 Step 4, so CI only ever sees the completed batch (no timeout-only or partial states on the remote). Local warm runs stay green throughout Tasks 1-5 (the old heavyweight tests still pass warm); the old deterministic test would still time out in COLD CI until Task 6 removes it — which is why nothing is pushed before Task 10. If the owner pushes to the branch mid-series, fetch and rebase the local series before continuing (Global Constraints).
