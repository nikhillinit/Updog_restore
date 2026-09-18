---
status: DRAFT
audience: agents
last_updated: 2026-09-09
owner: Repository Owner
scope: reserve-evidence-decision-workflow-v1
source_sha: 8eac03568cd40bc4a00c21648a873badfc582b45
body_sha256: c6fdde008d313cefe73c40e7beaf4931541a164613e6d72605fc6453292152b9
approval_sha256: null
reviewed_by: null
reviewed_at: null
approved_by: null
approved_at: null
approval:
  state: unapproved
source_paths:
  - client/src/hooks/useDecisions.ts
  - client/src/hooks/useInternalAnalysis.ts
  - client/src/hooks/useTasks.ts
  - client/src/pages/fund-model-results-operations.tsx
  - migrations/meta/_journal.json
  - server/routes/fund-moic.ts
  - server/routes/internal-analysis.ts
  - server/routes/operating-object-decisions.ts
  - server/routes/operating-object-tasks.ts
  - server/services/current-forecast-fund-lock.ts
  - server/services/internal-analysis/analysis-checkpoint-service.ts
  - server/services/operating-objects/decision-evidence-link-service.ts
  - server/services/operating-objects/task-evidence-link-service.ts
  - server/services/reserves/dynamic-reserve-intelligence-service.ts
  - shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts
  - shared/schema/fund.ts
  - shared/schema/internal-analysis.ts
  - shared/schema/operating-objects.ts
---

# C3c Reserve Evidence Decision Workflow

## Goal

Use a verified, admitted V3 reserve snapshot inside an immutable analysis
reference, then create a decision and its evidence link atomically.

## Non-Goals

- No reserve-specific evidence-link target.
- No repair or insertion of admission receipts during lookup.
- No combined decision/task creation.
- No direct decision-task or task-supersession field.

## Existing Surfaces and Actual Consumers

Analysis references already carry nullable `reserveReferenceId`.
`fund_snapshots` already supports `RESERVE_INTELLIGENCE`. Existing decision and
task hooks call separate evidence-link APIs. Evidence FKs restrict deletion but
do not serialize a correction save against decision creation.

## Normative Product Decisions

1. Reuse target `{ kind: 'analysis_reference', id }`.
2. Accepted evidence is one `dynamic-reserve-intelligence-v3`/`reserve-intel-v3`
   snapshot with planned, marginal, and deployed sections created atomically.
3. Save and decision creation both verify the V3 receipt chain. Lookup is
   read-only.
4. A successor reference makes the older reference ineligible at decision
   creation.
5. Decision creation and correction save share a per-fund transaction advisory
   lock to serialize the successor check and insert.
6. Optional task creation and task evidence link are later existing API actions.

## Request and Response Contracts

C1's evidence-linked decision command is reused. V3 evidence comparison includes
the complete `FinancialFactsBasisRef`: `schemaId`, `fundId`, `snapshotId`,
`snapshotInputHash`, `sourceFactsInputHash`, `policyVersion`, `asOfDate`,
`knowledgeCutoff`, or explicit legacy `null`. Policy 1.4/payload 5 and policy
1.5/payload 6 require non-null exact identity. Missing NAV/RVPI/TVPI stay typed
unavailable and cannot be filled from another source.

## Authoritative Inputs and Source Versions

Verification order:

1. Acquire per-fund advisory transaction lock; load analysis reference by
   `(id, fund_id)` and refuse missing/null reserve pin or committed successor.
2. Load same-fund `RESERVE_INTELLIGENCE` snapshot; require V3 payload/engine and
   all sections.
3. Load exactly one same-fund accepted V3 admission receipt for snapshot.
4. Recompute V3 receipt hash.
5. Load/recompute accepted same-fund V2 predecessor and compare predecessor
   hash.
6. Match receipt snapshot/config/date/input/config/result hashes and complete
   basis identity to payload.
7. Require equivalence run and configured admitted source SHA/corpus revision;
   compare marginal input/config/section hashes.

### Reference-detail read and UI contract

Extend existing
`GET /api/funds/:fundId/internal-analysis/references/:referenceId`; do not add a
second evidence endpoint. `AnalysisReferenceDetailResponse` adds nullable:

```ts
type ReserveEvidenceDetailV1 = {
  contractVersion: 'reserve-evidence-detail-v1';
  referenceId: number;
  reserveSnapshotId: number;
  payloadVersion: 'dynamic-reserve-intelligence-v3';
  engineVersion: 'reserve-intel-v3';
  sourceSha: string;
  corpusRevision: string;
  admissionReceiptId: number;
  admissionReceiptHash: string;
  predecessorReceiptId: number;
  equivalenceRunId: string;
  basisRef: FinancialFactsBasisRef | null;
  sections: {
    planned: {
      availability: 'available' | 'unavailable';
      refusalCode: string | null;
    };
    marginal: {
      availability: 'available' | 'unavailable';
      refusalCode: string | null;
    };
    deployed: {
      availability: 'available' | 'partial' | 'unavailable';
      refusalCode: string | null;
    };
  };
  supersession: { isSuperseded: boolean; successorReferenceId: number | null };
};
```

Route performs same-fund access and verification steps 2-7. It returns
`reserveEvidence: null` only when reference has no reserve pin. A pinned but
missing, mismatched, or unadmitted artifact returns typed error, never empty
evidence.

`useAnalysisReferenceDetail(fundId, referenceId)` owns loading/error/data state.
`fund-model-results-operations.tsx` makes each analysis-reference evidence item
an expandable button and renders snapshot, source SHA, corpus, receipt,
equivalence, per-section availability/refusal, and successor. Loading uses
`aria-busy`; errors use an alert; expansion uses `aria-expanded` and
`aria-controls`; unavailable and superseded states are textual.

### Unconditional same-fund schema integrity

`fund_snapshots` must add unique target `(id, fund_id)` in addition to its
existing `(id, type)` key. Both `internal_analysis_drafts.reserve_reference_id`
and `internal_analysis_references.reserve_reference_id` use composite foreign
keys `(reserve_reference_id, fund_id) -> fund_snapshots(id, fund_id)` with
`ON DELETE RESTRICT`. No reserve-reference FK exists on the inspected baseline;
the additive migration adds the unique target and both composite FKs without
dropping a nonexistent constraint. Service checks remain for type, payload,
hash, admission, and non-disclosing authorization; they do not substitute for
the same-fund database constraint.

Schema clone/reconcile tests assert the unique target, both composite FKs,
delete restriction, and rejection of a cross-fund reserve ID even when service
code is bypassed.

## Persistence and Hash Semantics

Analysis-reference save runs steps 2-7 before insert. Decision creation runs
steps 1-7 in the same transaction that inserts decision and evidence link. V3
result hash uses the C3b projection. Receipt hashes use stored canonical receipt
projections. Equal snapshot IDs or partial basis projections never suffice.

## Idempotency, Concurrency, and Recovery

Decision command follows same-key/same-material replay and different-material
conflict. Correction save with non-null `sourceReferenceId` acquires the same
fund lock before terminal-state recheck and successor insert. A correction
committed first causes decision refusal; a decision committed first may later be
superseded while its immutable link remains valid point-in-time evidence.

### Missing-data and decision acceptance examples

These examples require an eligible analysis basis. Neither actuals policy gains
periodic-analysis eligibility; its existing refusal cannot be bypassed by a
reserve pin or a decision about missing data.

A verified partial V3 snapshot may be saved and linked as evidence of a blocked
reserve decision. Its unavailable securities/sections and reasons must remain
visible; the record does not approve allocation, rank excluded securities or
execute a trade. Available entries use only the exact admitted snapshot. Missing
ownership, SAFE conversion, dates, reserve-origin classification or marks stay
explicit gaps; no aggregate mark or planned budget fills them. Unreceipted or
incoherent snapshots cannot be saved as qualified reserve evidence at all.

Synthetic acceptance: admitted security S at 2x plus security T unavailable for
missing conversion produces one ranked entry and one visible refusal in the same
reference. A decision to obtain T's conversion evidence may link that reference;
no numeric T value or authority to deploy is created. Missing V2
predecessor/equivalence evidence yields zero new reference/decision/link rows.
If correction commits first, new decision creation on the old reference refuses;
if the decision commits first, later correction preserves its point-in-time
link. An authenticated exact replay after correction returns the original
outcome without another decision/link; a new key must pass successor checks.
Task creation remains a subsequent explicit action through existing APIs.

## Refusal Matrix

| Condition                                    | Result                      | Durable writes           |
| -------------------------------------------- | --------------------------- | ------------------------ |
| Missing/cross-fund/wrong-type snapshot       | evidence refusal            | 0 analysis/decision/task |
| Reference already has committed successor    | stale-reference refusal     | 0 decision/link          |
| V3 section absent or older payload           | evidence refusal            | 0                        |
| Missing/multiple/unaccepted V3 receipt       | integrity/admission refusal | 0                        |
| V3 or predecessor receipt hash mismatch      | hash refusal                | 0                        |
| Predecessor missing/cross-fund/not V2        | predecessor refusal         | 0                        |
| Source/corpus/equivalence mismatch           | admission refusal           | 0                        |
| Any basis field mismatch or legacy synthesis | basis refusal               | 0                        |
| Same key, different material                 | idempotency conflict        | 0                        |

## Authorization and Fund Ownership

Reference, snapshot, V2/V3 receipts, decision, task, and links must be same-fund
and accessible to actor. Cross-fund lookup uses non-disclosing refusal. Spec
approval does not authorize source admission or runtime action.

## UI States and Accessibility

Decision view shows evidence type, immutable reference ID, source/corpus
versions, availability/refusal, and superseded history. Optional task creation
remains separate and keyboard reachable. State and refusal reasons are textual.

## Exact File Manifest

Only paths present at `source_sha` appear below. Files marked `Create` or
otherwise absent at that baseline in the companion implementation plan are
prospective and intentionally have no baseline hash.

| Source path                                                                     | SHA-256 at `source_sha`                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `client/src/hooks/useDecisions.ts`                                              | `1ede4ffc07a385d0653c64f01a60d7f76bb44dcfb6e62c943cc25328ec4514dc` |
| `client/src/hooks/useInternalAnalysis.ts`                                       | `a4d7be9c493c431edcd44dc9be642109386d0793a449911ff3a2edb7c616a15b` |
| `client/src/hooks/useTasks.ts`                                                  | `46670c398bb6c23bba5493ecb9562b8ede0eb90bbb586a272e0b7d8bcc0064bc` |
| `client/src/pages/fund-model-results-operations.tsx`                            | `f0ee531edf65cd347ab7cc13365f789c9a015bcf09b39f6acbd241ff2d2140ca` |
| `migrations/meta/_journal.json`                                                 | `5df1a9a2bb3eeb29f4c815df0f93b826c61b917fd9a6a9e66e75f336914a41d7` |
| `server/routes/fund-moic.ts`                                                    | `2fdbdb53059b30079bd876bee376cb8749c802d7fd3e5a04f1d2cec9f0bd28ba` |
| `server/routes/internal-analysis.ts`                                            | `884e6642e89bcaed6a1cfc86dd4e4ac8611c8a5f4b495ee337424954dc25e6d9` |
| `server/routes/operating-object-decisions.ts`                                   | `b3e08e9e169cd9d40c055f518f83f7ebd96c52c3a8669c1d088e257fb964da6c` |
| `server/routes/operating-object-tasks.ts`                                       | `e13d9ef5e23a94fe17978c20c97cab4d082e950d97d3f7e2d02e1cf5c49a6dbf` |
| `server/services/current-forecast-fund-lock.ts`                                 | `d1173cc630a88b50a4512d8a76ec3c77820fb50f10d49eb0bc2b97212f9e60a3` |
| `server/services/internal-analysis/analysis-checkpoint-service.ts`              | `ead85eec1340799ab9811b0279fbbb5aa8ec494e823299d8e6ec0d70de874a1d` |
| `server/services/operating-objects/decision-evidence-link-service.ts`           | `a3e0c8407ed074bcac79e1bedd484454541f3a5528a8c4e6c72fac93bf775d1d` |
| `server/services/operating-objects/task-evidence-link-service.ts`               | `53f9a69abc7aa81eb18da30264e9d95680f589025203696292075a660d8f61d6` |
| `server/services/reserves/dynamic-reserve-intelligence-service.ts`              | `c6a66f8d26048d8d5b6ac640c5d73585c8cd85f95c26f08db1189788d110d061` |
| `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts` | `172784d4420a642ea7fd1598f3bc94b94290ce078913fcfdf6f1957cbafb5c8a` |
| `shared/schema/fund.ts`                                                         | `d7be982c71e9b5155877599fc91d00f9a550f256d11082c31b76cfea88ffb42e` |
| `shared/schema/internal-analysis.ts`                                            | `cec76ded14bacadaed806859ebfc890902462e95dabb50c74b08ef900dd40b01` |
| `shared/schema/operating-objects.ts`                                            | `b0416757ac7090a4a0394e9f9a56234d65b84f22cad87636f3fff3900a9c68b7` |

## Exact Test Manifest

- `tests/unit/contracts/reserve-evidence-decision-v1.contract.test.ts`: V3/full
  basis identity and typed unavailable fields.
- `tests/integration/internal-analysis/reserve-reference.pg.test.ts`:
  same-fund/type/hash/receipt chain and zero writes.
- `tests/integration/operating-decisions/reserve-evidence-linked-decision.pg.test.ts`:
  replay, conflict, rollback, superseded reference.
- `tests/integration/internal-analysis/reserve-reference-decision-race.pg.test.ts`:
  two-session correction-save/decision race ordering.
- `tests/e2e/reserve-evidence-decision.spec.ts`: decision then separate
  task/evidence link, supersession display, accessibility.

## Admission and Rollout Gates

C3c follows C3a and C3b and requires the exact accepted V3 receipt plus V2-to-V3
equivalence proof. Draft/review/owner-approved states must remain distinct.
Source admission, deployment, serving, shadow entry, activation, and production
action require separate gates.
