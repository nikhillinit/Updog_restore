# Surface Contract Matrix

This directory holds tracked WS1 contract scaffolding. The matrix is structured
data, not a markdown-only inventory. `matrix-schema.mjs` is plain JavaScript so
CI and authoring scripts can import the same Zod schemas, enum values, row-id
normalizer, merge-ownership table, fingerprint field list, and proposal
precedence rules without adding an audit TypeScript project.

## Validation contract

Validation has two layers.

1. CI validates tracked sources only. It parses `matrix.json` and
   `source-inventory.json`, checks canonical-id uniqueness and exact-set
   equality, recomputes source hashes and approved contract fingerprints, checks
   registry/listener/dormant coverage, and verifies deterministic rendering.
   Structural checks fail in every phase. During `authoring`, classification and
   approval counts are reported; after `approve-matrix.mjs --close-g1` changes
   the document to `closed`, zero unclassified/proposed/unknown-required fields
   and all closure obligations are enforced. CI also rejects a downgrade from
   `closed` to `authoring` against the event's prior matrix blob.
2. Authoring-time validation reconciles the tracked inventory with a freshly
   rebuilt, untracked knowledge graph and the scheduler registration scan. The
   passing KG `snapshot_id` and counts are recorded as provenance. CI checks
   that this provenance block exists and is well formed; it does not trust an
   untracked KG snapshot as a live CI input.

Every exposure records boot status and evidence. Configured reachability stays
separate from proven reachability: a proof that executes and observes a contract
failure is `failed`; a proof blocked by an unavailable prerequisite is
`unproven`. A local observation never substitutes for a named Railway worker
identity proof. Failed or unproven release boots stay in scope and receive
`keep-and-prove`, rather than being silently treated as dormant.
`boot_evidence.observed_at` is preserved verbatim across re-seeds when the boot
outcome (`command_or_artifact`, `probe`, `result`, `boot_status`) is unchanged,
so `seed twice == seed once` stays byte-literal. Human decision evidence is
never merged into machine-owned boot evidence.

### CI-only package-source governance

`validate-matrix.mjs` remains the canonical authoring and regeneration
validator: every tracked package source is checked against its exact recorded
byte hash. It has no package semantic waiver.

The maintenance Vitest gate adds a narrower, post-`npm ci` merge-governance
check for dependency-only `package.json` and bounded `package-lock.json`
updates. The canonical authoring inventory can remain stale after an accepted
CI-only waiver. Maintenance instead trusts the event's explicit prior ref (or
`origin/main` only for local runs): unchanged bytes against that base pass,
while changed bytes fail closed unless dependency and lock provenance rules
pass. This CI-only check does not run before installation and is not a
pre-install containment control. Automated release proof invokes
`npm run release:check`; it does not invoke `validate-matrix.mjs`.
Release-proof behavior is unchanged, while canonical exact-hash validation
remains an authoring and regeneration requirement.

`orphans.json` is the sole authoritative orphan artifact. `matrix.json` does not
embed a second orphan list; approval, validation, rendering, and reseeding read
and write this file directly.

## Boot-proof table

`boot-proof.mjs` writes a schema-1.1 document with the exact source commit. Its
default authoring output is tracked `boot-proofs.json`; closure runs must pass
`--output` with a temporary file and `--require-g3`, so verification never
changes the approved snapshot. Railway worker evidence includes structured
`worker_identity` rather than parsing identity from prose.

Normal invocation snapshots original `package.json`, `package-lock.json`, and
every non-output workspace path, including dirty and untracked generated files.
It creates a detached worktree at original `HEAD`, runs guarded
`--internal-clean-room` proof collection only there, validates its JSON, and
atomically copies only requested output back. It removes only invocation-created
paths and fails closed if manifest hashes or non-output fingerprint changed.
Direct `--internal-clean-room` use fails.

| Deployment                           | Artifact / command                                           | Probe and success condition                                                                                        |
| ------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `railway-worker-fund-scenario-calc`  | `Dockerfile.worker` with isolated Redis/PostgreSQL           | Fund consumer registration plus `/health`, `/live`, `/ready`, `/metrics`, `/stats`; identity SHA equals source SHA |
| `railway-worker-capital-call-status` | `Dockerfile.worker` with isolated Redis/PostgreSQL           | Capital worker registration plus matching health probes after schema preparation; identity SHA equals source SHA   |
| `vercel-api`                         | `scripts/build-vercel-api.mjs`; import built bundle          | `makeApp()` constructs without listening                                                                           |
| `vercel-function`                    | `vercel build`; `.vercel/output/functions/**/*.func` entries | Every emitted function entrypoint is invoked; unavailable tooling records `unproven`                               |
| `vercel-web`                         | `npm run build:web`                                          | `dist/public/index.html` references emitted JavaScript bundle                                                      |
| `ml-service-local`                   | `ml-service/Dockerfile` when Docker daemon is available      | Four FastAPI paths respond; otherwise records `unproven` with Docker availability result                           |

`Dockerfile.railway` remains legacy inventory evidence, not production
deployment topology. `railway.toml` was deleted under ADR-080; its declared
absence is retirement evidence, not a live manifest. Runtime topology comes from
`QUEUE_CATALOG.productionDisposition`: only named Railway worker deployments are
production Railway surfaces; API/functions are Vercel-only; local-only and
quarantined queues stay off Railway.

## Exact regeneration commands

Run from repository root, in this order, after tracked source changes. The
regeneration chain uses `--fresh` before rebuilding source-derived artifacts.
`--fresh` requires the full independent G1 review plus owner closure in Step 9;
it is never a mechanical reset-and-carry operation.

```sh
set -eu

npm install
npm ls
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --fresh --review-file audit/surface-contract-matrix/g1-review.json
npx tsx audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs --mode seed --expected-sha <committed-source-sha>
npx tsx audit/surface-contract-matrix/scripts/boot-proof.mjs
SEED_SNAPSHOT="$(mktemp -d)"
cleanup() {
  rm -rf "$SEED_SNAPSHOT"
}
trap cleanup EXIT HUP INT TERM
npx tsx audit/surface-contract-matrix/scripts/seed-matrix.mjs
for artifact in matrix.json source-inventory.json listener-dispositions.json dormant-candidates.json dormant-inventory.json runtime-exclusions.json condition-overrides.json definition-overrides.json orphans.json; do
  cp "audit/surface-contract-matrix/$artifact" "$SEED_SNAPSHOT/$artifact"
done
npx tsx audit/surface-contract-matrix/scripts/seed-matrix.mjs
for artifact in matrix.json source-inventory.json listener-dispositions.json dormant-candidates.json dormant-inventory.json runtime-exclusions.json condition-overrides.json definition-overrides.json orphans.json; do
  cmp "$SEED_SNAPSHOT/$artifact" "audit/surface-contract-matrix/$artifact" || {
    echo "seed output mismatch: $artifact" >&2
    exit 1
  }
done
npx tsx audit/surface-contract-matrix/scripts/classify-pass.mjs
npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
npx tsx audit/surface-contract-matrix/scripts/render-matrix.mjs
```

Release proof rebuilds the ignored route projection in strict `release` mode
at the exact candidate SHA immediately before matrix validation. Strict mode
rejects dirty projection inputs, SHA drift, source-inspection failures, and
count drift; it does not reuse a carried-forward snapshot.

The two seed runs must produce byte-identical artifacts. Preserve the first
run's output files in a temporary directory and compare them with the second run
before classification; do not approve or close G1 while that comparison differs.

After regeneration, initialize and edit the tracked manifest. Seed never reads
this file; approval is the only consumer of human decisions:

```sh
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs init-review --review-file audit/surface-contract-matrix/g1-review.json
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --review-file audit/surface-contract-matrix/g1-review.json --approver <id> --evidence <reference> --dry-run
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --review-file audit/surface-contract-matrix/g1-review.json --approver <id> --evidence <reference>
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --review-file audit/surface-contract-matrix/g1-review.json --approver <id> --evidence <reference> --close-g1
```

`--approver` must equal manifest `approver_id`; `--evidence` must equal manifest
`evidence_ref`. Direct `--row` and `--seam` mutation flags are not supported.
Every non-dry-run approval validates source/inventory, off-row fingerprints, row
integrity, roles, closure, and coverage in memory before an atomic multi-file
swap. A rename failure rolls back the complete prior set.

Final local gates:

```sh
npm run check
npm run lint
npm test
```
