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
separate from proven reachability: failed or unproven release boots stay in
scope and receive `keep-and-prove`, rather than being silently treated as
dormant. `boot_evidence.observed_at` is preserved verbatim across re-seeds when
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
| `railway-api`      | `npm run build:prod`; exact `Dockerfile.railway` `ENTRYPOINT` + `CMD` | HTTP listener on `/health`; no-listener is recorded as failed                            |
| `railway-worker`   | `npm run build:workers`; `Dockerfile.worker` worker command           | Consumer registration plus `/health`, `/live`, `/ready`, `/metrics`, `/stats`            |
| `vercel-api`       | `scripts/build-vercel-api.mjs`; import built bundle                   | `makeApp()` constructs without listening                                                 |
| `vercel-function`  | Source-import enabled `api/**/*.ts` handler                           | Structural export evidence only; remains `unproven` without Vercel build output          |
| `vercel-web`       | `npm run build:web`                                                   | `dist/public/index.html` references emitted JavaScript bundle                            |
| `railway-web`      | SPA build plus proven Railway API                                     | Asset and deep-link probe through proven API listener                                    |
| `ml-service-local` | `ml-service/Dockerfile` when Docker daemon is available               | Four FastAPI paths respond; otherwise records `unproven` with Docker availability result |

## Exact regeneration commands

Run from repository root, in this order, after tracked source changes:

```sh
npm install
npm ls
node audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs
node audit/surface-contract-matrix/scripts/boot-proof.mjs
npx tsx audit/surface-contract-matrix/scripts/seed-matrix.mjs
npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
npx tsx audit/surface-contract-matrix/scripts/render-matrix.mjs
```

For G1 approval, use the sole approval mutation path. It must regenerate the
review artifact in the same invocation:

```sh
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --dry-run --seam <seam> --evidence <reference>
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --row <canonical-row-id> --evidence <reference>
npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs --close-g1 --evidence <reference>
```

Final local gates:

```sh
npm run check
npm run lint
npm test
```
