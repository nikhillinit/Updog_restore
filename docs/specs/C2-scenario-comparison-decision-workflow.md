---
status: DRAFT
audience: agents
last_updated: 2026-09-07
owner: Repository Owner
scope: scenario-comparison-decision-workflow-v1
source_sha: 2a6372557a3dd1ba8a13e99c6867434ede3f9299
body_sha256: 2f36c573d150549befbfa5b0aaee5df4303b6fdb45f064a455501af563063e65
approval_sha256: null
reviewed_by: null
reviewed_at: null
approved_by: null
approved_at: null
approval:
  state: unapproved
source_paths:
  - client/src/components/fund-results/ScenarioComparisonTable.tsx
  - client/src/components/fund-results/scenario-comparison-evidence.ts
  - client/src/hooks/useDecisions.ts
  - client/src/pages/fund-scenario-workspace.tsx
  - docs/adr/ADR-022-fund-scenario-architecture.md
  - migrations/meta/_journal.json
  - server/routes/fund-scenario-sets.ts
  - server/routes/internal-analysis.ts
  - server/services/fund-scenario-comparison-lineage-service.ts
  - server/services/fund-scenario-comparison-service.ts
  - server/services/internal-analysis/analysis-checkpoint-service.ts
  - server/services/operating-objects/decision-evidence-link-service.ts
  - shared/contracts/fund-scenario-comparison-v1.contract.ts
  - shared/contracts/fund-scenario-sets-v1.contract.ts
  - shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts
  - shared/schema/fund.ts
  - shared/schema/internal-analysis.ts
  - shared/schema/operating-objects.ts
---

# C2 Scenario Comparison Decision Workflow

## Goal

Persist an economics-only scenario comparison as immutable analysis evidence,
then reuse C1's atomic evidence-linked decision command.

## Non-Goals

- No capital-call, pacing, reserve, or waterfall metrics beyond the current
  authoritative comparison result.
- No invented baseline variant ID or scenario-set version column.
- No decision-plus-task command.
- No new unsupported-dimension refusal code.

## Existing Surfaces and Actual Consumers

The comparison service and lineage service already produce economics V1 results
and validate scenario input lineage. `fund-scenario-workspace.tsx` consumes the
server result. Analysis references currently lack a scenario-comparison basis.
Existing decision/task APIs support separate user actions.

## Normative Product Decisions

1. Comparison scope is economics V1 only.
2. Supported override types are `fee_profile`, `allocation`, `sector_profile`,
   and `methodology`; preserve `UNSUPPORTED_OVERRIDE_TYPE` for other values.
3. Baseline identity is the comparison response's `baseline` field. It has no
   variant ID.
4. Variant IDs are unique and canonically sorted for hashing.
5. Task creation is a later, separate existing API action.

## Request and Response Contracts

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

### ADR-022 current-source reconciliation

The accompanying dated ADR-022 amendment records that current comparison
contracts accept economics variants `fee_profile`, `allocation`,
`sector_profile`, and `methodology`; `reserve_allocation` remains outside this
comparison and uses existing `UNSUPPORTED_OVERRIDE_TYPE`. Historical text stays
identified as original-baseline behavior. C2 approval must include the amended
ADR bytes in its source baseline. This draft's `source_sha` includes that
amendment and the integrated Program A/B source work; owner approval remains
unapproved.

## Authoritative Inputs and Source Versions

Bind scenario-set ID, source-config ID/version, comparison variant IDs,
economics snapshot/run IDs, scenario snapshot/run IDs, model input date, state
hash, input hash, and result hash. Require
`scenarioSnapshotStateHash === inputHash`. The result hash covers the ordered
variant IDs and exact server-owned economics response.

Policy 1.4/payload 5 may qualify forecast/reserve inputs but does not supply
economics periodic analysis. NAV, RVPI, and TVPI are typed unavailable when
absent; they are never inferred.

## Persistence and Hash Semantics

Extend analysis-reference contract/schema with one nullable
`ScenarioComparisonBasisV1`. Bump its contract version and add an additive
journal-discovered migration.
`comparisonResultHash = sha256CanonicalJson({ variantIds: sortedVariantIds, comparison })`.
Persist exported source, lineage-version, and hash-kind literals unchanged.

## Idempotency, Concurrency, and Recovery

Analysis save verifies source ownership and hashes before insert. C1's
evidence-linked decision command provides atomic decision/link replay and
conflict behavior. A failure at either phase writes nothing for that phase.

## Refusal Matrix

| Condition                             | Result                               | Durable writes                   |
| ------------------------------------- | ------------------------------------ | -------------------------------- |
| Unsupported override                  | existing `UNSUPPORTED_OVERRIDE_TYPE` | 0                                |
| State hash differs from input hash    | existing `snapshot_hash_mismatch`    | 0                                |
| Missing or inaccessible run/snapshot  | typed not-found refusal              | 0                                |
| Cross-fund identity                   | fund-scope refusal                   | 0                                |
| Result-hash mismatch                  | stale/mismatched refusal             | 0                                |
| Missing NAV/RVPI/TVPI                 | typed unavailable fields             | permitted evidence, no synthesis |
| Same key, different decision material | idempotency conflict                 | 0 decision/link                  |

## Authorization and Fund Ownership

All referenced set/config/run/snapshot/reference rows must belong to the request
fund and pass existing access checks. Do not disclose cross-fund existence.

## UI States and Accessibility

Client renders server values and typed unavailable metrics. It shows baseline
and variants with source/config versions, and exposes evidence/decision actions
by keyboard with descriptive labels. No client recomputation.

## Exact File Manifest

Only paths present at `source_sha` appear below. Files marked `Create` or
otherwise absent at that baseline in the companion implementation plan are
prospective and intentionally have no baseline hash.

| Source path                                                                     | SHA-256 at `source_sha`                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `client/src/components/fund-results/ScenarioComparisonTable.tsx`                | `bb566ae299a90566776b2d3bb6a1e6c99c4b1f801716c21bf6abe644661e6aff` |
| `client/src/components/fund-results/scenario-comparison-evidence.ts`            | `fc36907a02d70da71aedb439e019e4e9358f8daed22cb6289774eb1a5f546d61` |
| `client/src/hooks/useDecisions.ts`                                              | `1ede4ffc07a385d0653c64f01a60d7f76bb44dcfb6e62c943cc25328ec4514dc` |
| `client/src/pages/fund-scenario-workspace.tsx`                                  | `c8980cb6fc3219e708c580094b13e453424052f63e4d1fa0e26dc0a4d22c65c2` |
| `docs/adr/ADR-022-fund-scenario-architecture.md`                                | `c26faa1bfbd8a18369e8011c9ede1fc39367e2408821d28bfae34c2694bdc644` |
| `migrations/meta/_journal.json`                                                 | `b69d3827f712c6474738faa874c3bc0073e6fb444ef85a4a35ac2ea1867c82ef` |
| `server/routes/fund-scenario-sets.ts`                                           | `efa164d51499fa72b0da1332bf04d61feb0e3732926ae1b092df943b33d9ff27` |
| `server/routes/internal-analysis.ts`                                            | `884e6642e89bcaed6a1cfc86dd4e4ac8611c8a5f4b495ee337424954dc25e6d9` |
| `server/services/fund-scenario-comparison-lineage-service.ts`                   | `e53fb753dc82de521a41088271a25d2e57546edf3cb8ed42e598fb8a16bb72c1` |
| `server/services/fund-scenario-comparison-service.ts`                           | `bd37ae2f85a2b36674f89cb1a4f467c709b5516e6be1b7d2e96ec7d007e61d52` |
| `server/services/internal-analysis/analysis-checkpoint-service.ts`              | `a4c6cfec3a9d289c33eea5394163cac857464142b85f164c7c357d1eadb01b92` |
| `server/services/operating-objects/decision-evidence-link-service.ts`           | `a3e0c8407ed074bcac79e1bedd484454541f3a5528a8c4e6c72fac93bf775d1d` |
| `shared/contracts/fund-scenario-comparison-v1.contract.ts`                      | `4c5b61ecc04336f23a389b91c2bf1dc0eb3e7e01aae55aa3bc6910b5a059a432` |
| `shared/contracts/fund-scenario-sets-v1.contract.ts`                            | `b60dff76ac8ebac27dd50d2f75b619b8274572df6a8e2afc06ba634e157aeee3` |
| `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts` | `172784d4420a642ea7fd1598f3bc94b94290ce078913fcfdf6f1957cbafb5c8a` |
| `shared/schema/fund.ts`                                                         | `d7be982c71e9b5155877599fc91d00f9a550f256d11082c31b76cfea88ffb42e` |
| `shared/schema/internal-analysis.ts`                                            | `cec76ded14bacadaed806859ebfc890902462e95dabb50c74b08ef900dd40b01` |
| `shared/schema/operating-objects.ts`                                            | `b0416757ac7090a4a0394e9f9a56234d65b84f22cad87636f3fff3900a9c68b7` |

## Exact Test Manifest

- `tests/unit/contracts/scenario-comparison-basis-v1.contract.test.ts`: exact
  identity, ordering, result hash, methodology override.
- `tests/integration/scenarios/scenario-comparison-lineage.pg.test.ts`:
  ownership, source/run access, state/input mismatch, zero writes.
- `tests/integration/internal-analysis/scenario-comparison-reference.pg.test.ts`:
  schema migration, immutable persistence, supersession.
- `tests/integration/operating-decisions/evidence-linked-decision.pg.test.ts`:
  replay, conflict, rollback, inaccessible reference.
- `tests/e2e/scenario-comparison-decision.spec.ts`: server-only economics
  display, unavailable metrics, separate task action.

The implementation plan includes a documentation task that verifies ADR-022,
contract literals, result variants, service dispatch, and tests all enumerate
the same four economics override types.

## Admission and Rollout Gates

C2 follows C1. Draft review and repository-owner exact-body approval must
precede implementation. Program A gates, source admission, deployment, serving,
and production action remain separate.
