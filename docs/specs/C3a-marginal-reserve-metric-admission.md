---
status: DRAFT
audience: agents
last_updated: 2026-09-06
owner: Repository Owner
scope: marginal-reserve-metric-admission-v2
source_sha: 1cdef4f1bc24072742a2cd24349f04c6ec074f0f
body_sha256: cc3bd74aceb91b195473dbb9a45eb105a133da94483b0fe94c22d9c038266ed7
approval_sha256: null
reviewed_by: null
reviewed_at: null
approved_by: null
approved_at: null
approval:
  state: unapproved
source_paths:
  - .dockerignore
  - Dockerfile.railway
  - client/src/components/fund-results/ReserveIntelligencePanel.tsx
  - client/src/hooks/useReserveIntelligence.ts
  - client/src/pages/fund-model-results-moic-analysis.tsx
  - docs/runbooks/marginal-moic-nonproduction-shadow-soak.md
  - flags/registry.yaml
  - migrations/meta/_journal.json
  - scripts/build-server.mjs
  - scripts/build-vercel-api.mjs
  - server/config/features.ts
  - server/lib/database-backed-idempotency-routes.ts
  - server/route-policy/api-route-policy-registry.ts
  - server/routes/fund-moic.ts
  - server/routes/mount-common-routes.ts
  - server/services/financial-facts/financial-facts-basis-ref.ts
  - server/services/fund-moic-ranking-service.ts
  - server/services/moic/marginal-reserve-moic-input-service.ts
  - server/services/reserves/dynamic-reserve-intelligence-service.ts
  - server/services/reserves/ranked-reserve-orchestrator.ts
  - shared/contracts/dynamic-reserve-intelligence-v1.contract.ts
  - shared/contracts/financial-facts-snapshot-v1.contract.ts
  - shared/contracts/marginal-reserve-moic-v1.contract.ts
  - shared/contracts/marginal-reserve-moic-v2.contract.ts
  - shared/core/moic/MarginalReserveMoic.ts
  - shared/lib/financial-facts/payload5-consumer-evaluator.ts
  - shared/routes/api-route-manifest.ts
  - shared/schema.ts
  - shared/schema/fund.ts
---

# C3a Marginal Reserve Metric Admission

## Goal

Define paired-counterfactual marginal reserve economics and an immutable
serving-admission receipt for a new V2 reserve payload.

## Non-Goals

- No reinterpretation or patching of V1 snapshots.
- No fallback from missing provenance to heuristic marginal values.
- No serving admission from calculation success alone.
- No production corpus run or database mutation in specification work.

## Existing Surfaces and Actual Consumers

V1 `dynamic-reserve-intelligence-service.ts` writes `RESERVE_INTELLIGENCE`
snapshots and `dynamic-reserve-intelligence-v1` payloads. V1 accepts optional
policy-1.4 `basisRef`; payload-5 evaluator qualifies reserve consumption only
with complete position valuation and investment lineage. No V2 admission receipt
exists on this source baseline.

## Normative Product Decisions

1. V2 versions are `dynamic-reserve-intelligence-v2` and `reserve-intel-v2`.
2. Marginal value is a paired counterfactual: identical pinned inputs/config
   except one named security's reserve increment.
3. Both legs must complete on the same full basis and model-input date. Missing,
   malformed, mixed, or mismatched provenance refuses.
4. A metric may be unavailable with a typed reason; it is never synthesized.
5. Serving requires an accepted admission receipt bound to exact source SHA,
   corpus revision, calculation identities, and hashes.

## Request and Response Contracts

Every V2 request, result, mutation request, and receipt carries `basisRef` as
either all eight fields or explicit legacy `null`:

```ts
type FinancialFactsBasisRef = {
  schemaId: 'financial-facts-basis-ref/1.0.0';
  fundId: number;
  snapshotId: number;
  snapshotInputHash: string;
  sourceFactsInputHash: string;
  policyVersion: 'financial-facts-policy/1.4.0';
  asOfDate: string;
  knowledgeCutoff: string;
};
```

Policy 1.4/payload 5 requires the complete object and matching fund/snapshot.
Policies 1.0-1.3 normalize to explicit `null`. NAV/RVPI/TVPI absent from payload
5 remain typed unavailable.

### Reusable V2/V3 admission contract

One immutable table serves both versions:
`reserve_intelligence_admission_receipts` with `id`, `fund_id`, `snapshot_id`,
`snapshot_type`, `payload_version`, `engine_version`, `predecessor_receipt_id`,
`predecessor_receipt_hash`, `financial_facts_snapshot_id`, `source_config_id`,
`source_config_version`, `model_input_as_of_date`, `source_sha`,
`corpus_revision`, `equivalence_run_id`, `input_hash`, `config_hash`,
`result_hash`, `marginal_input_hash`, `marginal_config_hash`,
`marginal_section_hash`, `receipt_hash`, `acceptance_state`, `accepted_by`,
`accepted_at`, `idempotency_key`, and `request_hash`.

The migration unconditionally adds
`fund_snapshots_id_fund_type_unique (id, fund_id, type)`, receipt FK
`(snapshot_id, fund_id, snapshot_type)`, financial-facts FK
`(financial_facts_snapshot_id, fund_id)`, and same-fund self-FK
`(predecessor_receipt_id, fund_id)`. Unique keys are `(id, fund_id)`,
`(fund_id, snapshot_id, payload_version)`, `(fund_id, idempotency_key)`, and
`receipt_hash`. V2 requires null predecessor/equivalence fields. V3 requires all
three. Only `acceptance_state = accepted` is valid.

```ts
type ReserveIntelligenceAdmissionReceipt = {
  receiptVersion: 'reserve-intelligence-admission/1.0.0';
  receiptId: number;
  fundId: number;
  snapshotId: number;
  snapshotType: 'RESERVE_INTELLIGENCE';
  predecessor: null | { receiptId: number; receiptHash: string };
  basis: {
    financialFactsSnapshotId: number;
    sourceConfigId: number;
    sourceConfigVersion: number;
    modelInputAsOfDate: string;
    basisRef: FinancialFactsBasisRef | null;
  };
  versions: {
    payloadVersion:
      'dynamic-reserve-intelligence-v2' | 'dynamic-reserve-intelligence-v3';
    engineVersion: 'reserve-intel-v2' | 'reserve-intel-v3';
    sourceSha: string;
    corpusRevision: string;
  };
  hashes: {
    inputHash: string;
    configHash: string;
    resultHash: string;
    marginalInputHash: string;
    marginalConfigHash: string;
    marginalSectionHash: string;
  };
  equivalenceRunId: string | null;
  acceptance: { state: 'accepted'; acceptedBy: number; acceptedAt: string };
  receiptHash: string;
};
```

The sole writer is
`POST /api/funds/:fundId/moic/reserve-intelligence/admissions` with required
`Idempotency-Key`, authentication, admin role, fund access, both HTTP mounts,
route-policy registration, and database-backed-idempotency registration.
Producer code never self-admits.

`requestHash` is canonical SHA-256 over exactly
`{ fundId, snapshotId, basisRef, payloadVersion, engineVersion, sourceSha, corpusRevision, predecessorReceiptId, equivalenceRunId, inputHash, configHash, resultHash, marginalInputHash, marginalConfigHash, marginalSectionHash }`.

`receiptHash` is canonical SHA-256 over exactly
`{ receiptVersion, fundId, snapshotId, snapshotType, predecessor, basis, versions, hashes, equivalenceRunId, acceptanceState, acceptedBy, acceptedAt }`.
Receipt ID/hash, idempotency/request hashes, command/run/correlation IDs, and
request metadata are excluded. Admission fields never enter calculation
`resultHash`.

## Authoritative Inputs and Source Versions

Input identity includes financial facts snapshot, full normalized `basisRef`,
source config ID/version, model-input date, security ID, increment amount, and
both pinned counterfactual envelopes. Source SHA and corpus revision identify
admission evidence, not calculation output.

## Persistence and Hash Semantics

Use `sha256CanonicalJson` once per preimage. `inputHash`, `resultHash`, mutation
`requestHash`, and receipt `basis.basisRef` include the full eight-field value
or `null`. Equal snapshot IDs are insufficient. Calculation result hash excludes
command/operator/timestamps/replay metadata. Receipt hash covers all stored
receipt columns through the existing canonical receipt projection.

Build scripts stamp `sourceSha`; `config/reserve-corpus-manifest.json` supplies
`corpusRevision`. Admission identity loads lazily at command execution and
refuses absent or placeholder values. Tests may inject identity only when
`NODE_ENV === 'test'`; production environment variables cannot override the
stamped identity.

## Idempotency, Concurrency, and Recovery

Admission command is database-backed and idempotent. Same key/material replays;
different material conflicts. Receipt insert occurs only after all corpus cases
and identities match. Retrying a failed or refused proof cannot create a
receipt.

## Refusal Matrix

| Condition                                             | Result                               | Durable writes      |
| ----------------------------------------------------- | ------------------------------------ | ------------------- |
| Policy 1.4 basis missing/malformed                    | `BASIS_REF_REQUIRED`                 | 0                   |
| Any of eight fields differs across request/run/result | `BASIS_REF_MISMATCH`                 | 0                   |
| Same snapshot ID, different input/source hash         | `BASIS_REF_MISMATCH`                 | 0                   |
| Cross-fund basis                                      | fund-scope refusal                   | 0                   |
| Legacy policy with non-null synthesized basis         | `LEGACY_BASIS_INVALID`               | 0                   |
| Counterfactual source/config differs                  | `COUNTERFACTUAL_PROVENANCE_MISMATCH` | 0                   |
| One leg unavailable                                   | typed unavailable metric             | 0 admission receipt |
| Corpus/hash/source identity mismatch                  | admission refused                    | 0 receipt           |

Every actionable serving boundary joins the exact accepted receipt by
`(fund_id, snapshot_id, payload_version)`. This includes latest reserve
intelligence, the shared full-V2 producer used by marginal rankings, ranking
service/route, and reserve UI. Mode `on` alone is insufficient. Unreceipted
snapshots are `non_actionable` and excluded. `off` hides the feature; `shadow`
records comparisons without actionable output; `on` still requires receipt. The
nonproduction runbook requires stable paired replay before owner dispatches the
admin admission command.

## Authorization and Fund Ownership

Admission requires repository-owner approved spec plus source-admission
authority. All snapshot, config, run, and receipt identities are same-fund.
Production corpus execution and serving activation need separate authority.

## UI States and Accessibility

V2 consumers display available value or typed refusal with source date/version.
No ranking action appears for unavailable or unadmitted metrics. Text labels
carry state independently of color.

## Exact File Manifest

Only paths present at `source_sha` appear below. Files marked `Create` or
otherwise absent at that baseline in the companion implementation plan are
prospective and intentionally have no baseline hash.

| Source path                                                        | SHA-256 at `source_sha`                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `.dockerignore`                                                    | `8ec65ea77679b32af3a99b8d7a68d946705e61cb556a6f30a5f2adcbfe16287e` |
| `Dockerfile.railway`                                               | `76812404e468324e9993b820ea30f73ccf6c65a867560b25d99c02f65190ba8b` |
| `client/src/components/fund-results/ReserveIntelligencePanel.tsx`  | `58608043e3cce61250b689eee236d00e4ee5e1cccb9d27006ab49f3378660d43` |
| `client/src/hooks/useReserveIntelligence.ts`                       | `d261b6486e11da22b49addc7142027103f1574b82e3db05235374db2d80ff996` |
| `client/src/pages/fund-model-results-moic-analysis.tsx`            | `308712f16c186c88e0aa2090ca31930e1c1da55b98815650ca2e96aff3995c8e` |
| `docs/runbooks/marginal-moic-nonproduction-shadow-soak.md`         | `6145f23278a83ee178317f76ed3aaedb9886570b52d1148c50470b5aa7051b21` |
| `flags/registry.yaml`                                              | `19b772d76abd512df8baa37ddcc97ded6b788aac30934a8dfbdcd9e389eefee2` |
| `migrations/meta/_journal.json`                                    | `b69d3827f712c6474738faa874c3bc0073e6fb444ef85a4a35ac2ea1867c82ef` |
| `scripts/build-server.mjs`                                         | `ddaeee93c3375b254afad2cf1df8d083a62d3af41f7d58f5943f7deb9f802140` |
| `scripts/build-vercel-api.mjs`                                     | `256b4b881691f8f0cfca38c75b67d6299bbe94a25f472e5f205db3414d73e464` |
| `server/config/features.ts`                                        | `36abd9ab0245c8e83b5a50d5d9469d7a73c29cf4b525da750626b0882b489654` |
| `server/lib/database-backed-idempotency-routes.ts`                 | `75e6a6f11aa71a16f35dbbbea7348572dbc097af46736813a8d27910a0e57743` |
| `server/route-policy/api-route-policy-registry.ts`                 | `f7df2fcc009e3748050c2907dbc82257baf66288b309d109b5f64a90600857d6` |
| `server/routes/fund-moic.ts`                                       | `2fdbdb53059b30079bd876bee376cb8749c802d7fd3e5a04f1d2cec9f0bd28ba` |
| `server/routes/mount-common-routes.ts`                             | `ef578b006cfb7e8819d92a1d86948c5568f4a893236f46d926f7a2cb6ca67feb` |
| `server/services/financial-facts/financial-facts-basis-ref.ts`     | `0f59339137844a685634fb32d68115333481e09e6403a18c8f06ad5f69c133ae` |
| `server/services/fund-moic-ranking-service.ts`                     | `39f1557b7e4da2276c4b1d868e0c4e7829a49c54a7b78c1cf95d5bab5fe9c607` |
| `server/services/moic/marginal-reserve-moic-input-service.ts`      | `9c3ba21b3ee8785e380dad8a5d73961ecb006d0c1e602e39ea144285dae77274` |
| `server/services/reserves/dynamic-reserve-intelligence-service.ts` | `d50bb673f895fcca93a9f90b366e9790fe410ff5bbb852c65410d2c5875eccfc` |
| `server/services/reserves/ranked-reserve-orchestrator.ts`          | `872c4994effcdb3ca0aea2e2078363dea226c49b28c7176acd6e41ceabef9798` |
| `shared/contracts/dynamic-reserve-intelligence-v1.contract.ts`     | `c88a024ec102de1ad4273253af52b636757eb90e4660ed419fb983630d1e7f13` |
| `shared/contracts/financial-facts-snapshot-v1.contract.ts`         | `bdb763daa8a9ab0e62dadd47df9b4d165fcb5021d0ad73b04c82166fb1032a9e` |
| `shared/contracts/marginal-reserve-moic-v1.contract.ts`            | `b0e0236f0d452e7ef5cad144eff56a690a459639f6c38257cda150e779529039` |
| `shared/contracts/marginal-reserve-moic-v2.contract.ts`            | `d1ab1213431b522cd3321be29149665116460d8fa2d69f51eee6a86513b8979f` |
| `shared/core/moic/MarginalReserveMoic.ts`                          | `5b2f95ae42feaa6c538c14ebc98a661ed23dc0bead03ead8860c847416d9c83e` |
| `shared/lib/financial-facts/payload5-consumer-evaluator.ts`        | `b180059075e392436ce814e8ef901710b8a50a8d85f25007c91c579d4a61d5da` |
| `shared/routes/api-route-manifest.ts`                              | `ad48e3d01c876ba54850d47b8c5f9645c3ac80a16a7f86d4598a1ccbf7d604f0` |
| `shared/schema.ts`                                                 | `4c41473f48f241e789b79416d2a1ec7e844b95c11ca377686151b18a34606121` |
| `shared/schema/fund.ts`                                            | `d7be982c71e9b5155877599fc91d00f9a550f256d11082c31b76cfea88ffb42e` |

## Exact Test Manifest

- `tests/unit/contracts/dynamic-reserve-intelligence-v2.contract.test.ts`:
  paired legs, all eight basis fields, legacy null, typed unavailable.
- `tests/unit/contracts/reserve-intelligence-admission-v1.contract.test.ts`:
  receipt preimage/hash and versions.
- `tests/unit/reserves/marginal-reserve-v2.test.ts`: paired-counterfactual
  outputs and refusal precedence.
- `tests/integration/reserve-intelligence-admission.pg.test.ts`: replay,
  conflict, same-fund, zero-write refusals.
- `tests/regressions/financial-facts-basis-ref-consumers.test.ts`: each field
  substitution and same-ID/different-hash rejection.

Additional exact tests cover route authorization on both surfaces, off/shadow/on
behavior, accepted-receipt serving/ranking, ranking exclusion, stamped
match/mismatch, placeholder refusal without import crash, ignored production
environment overrides, and a two-client same-key PostgreSQL race that yields one
row plus one replay.

## Admission and Rollout Gates

C3a follows applicable Program A gates. Exact-spec approval precedes product
implementation. A committed candidate must pass the named admission corpus; an
accepted receipt then permits V2 serving only for its exact source/corpus
identity. No gate authorizes production action by implication.
