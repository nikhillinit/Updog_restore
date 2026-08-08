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
separate from proven reachability: a proof that executes and observes a
contract failure is `failed`; a proof blocked by an unavailable prerequisite is
`unproven`. In particular, a Docker-unavailable local `dist/index.js` listener
observation can be useful evidence but cannot prove the Railway container or
Dockerfile wiring. Failed or unproven release boots stay in scope and receive
`keep-and-prove`, rather than being silently treated as dormant.
`boot_evidence.observed_at` is preserved verbatim across re-seeds when
the boot outcome (`command_or_artifact`, `probe`, `result`, `boot_status`) is
unchanged, so `seed twice == seed once` stays byte-literal. Human decision
evidence is never merged into machine-owned boot evidence.

`orphans.json` is the sole authoritative orphan artifact. `matrix.json` does not
embed a second orphan list; approval, validation, rendering, and reseeding read
and write this file directly.

## Boot-proof table

`boot-proof.mjs` runs this table hermetically and writes the deterministic,
tracked `boot-proofs.json` input consumed by `seed-matrix.mjs`:

| Deployment         | Artifact / command                                                    | Probe and success condition                                                              |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `railway-api`      | `npm run build:prod`; exact `Dockerfile.railway` `ENTRYPOINT` + `CMD` | Container HTTP listener on `/health`; Docker-unavailable local observation remains `unproven` |
| `railway-worker`   | `Dockerfile.worker` image with Redis on isolated Docker network       | Container consumer registration plus `/health`, `/live`, `/ready`, `/metrics`, `/stats`  |
| `vercel-api`       | `scripts/build-vercel-api.mjs`; import built bundle                   | `makeApp()` constructs without listening                                                 |
| `vercel-function`  | `vercel build`; `.vercel/output/functions/**/*.func` entries          | Every emitted function entrypoint is invoked; unavailable tooling records `failed`      |
| `vercel-web`       | `npm run build:web`                                                   | `dist/public/index.html` references emitted JavaScript bundle                            |
| `railway-web`      | SPA build plus proven Railway API                                     | Asset and deep-link probe through proven API listener                                    |
| `ml-service-local` | `ml-service/Dockerfile` when Docker daemon is available               | Four FastAPI paths respond; otherwise records `unproven` with Docker availability result |

## Exact regeneration commands

Run from repository root, in this order, after tracked source changes. The
regeneration chain starts with `--fresh`: it discards row/off-row human review
state before rebuilding source-derived artifacts.

```sh
set -eu

npm install
npm ls
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --fresh --review-file audit/surface-contract-matrix/g1-review.json
node audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs
node audit/surface-contract-matrix/scripts/boot-proof.mjs
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

The two seed runs must produce byte-identical artifacts. Preserve the first
run's output files in a temporary directory and compare them with the second
run before classification; do not approve or close G1 while that comparison
differs.

After regeneration, initialize and edit the tracked manifest. Seed never reads
this file; approval is the only consumer of human decisions:

```sh
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs init-review --review-file audit/surface-contract-matrix/g1-review.json
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --review-file audit/surface-contract-matrix/g1-review.json --approver <id> --evidence <reference> --dry-run
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --review-file audit/surface-contract-matrix/g1-review.json --approver <id> --evidence <reference>
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --review-file audit/surface-contract-matrix/g1-review.json --approver <id> --evidence <reference> --close-g1
```

`--approver` must equal manifest `approver_id`; `--evidence` must equal
manifest `evidence_ref`. Direct `--row` and `--seam` mutation flags are not
supported. Every non-dry-run approval validates source/inventory, off-row
fingerprints, row integrity, roles, closure, and coverage in memory before an
atomic multi-file swap. A rename failure rolls back the complete prior set.

Final local gates:

```sh
npm run check
npm run lint
npm test
```
