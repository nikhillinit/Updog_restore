---
status: DRAFT
audience: agents
last_updated: 2026-09-06
owner: Repository Owner
scope: deployed-reserve-moic-v3
source_sha: 38fa722d19d343d5485d935ef5bce4c74c3be770
body_sha256: 6751e21d292ea7fccec8f6b3b9a9ae77881c6e2f6a340101e545978863832c9b
approval_sha256: null
reviewed_by: null
reviewed_at: null
approved_by: null
approved_at: null
approval:
  state: unapproved
source_paths:
  - client/src/components/fund-results/ReserveIntelligencePanel.tsx
  - client/src/pages/fund-model-results-moic-analysis.tsx
  - server/routes/fund-moic.ts
  - server/services/fund-moic-ranking-service.ts
  - server/services/investment-ledger/current-position-service.ts
  - server/services/investment-ledger/ledger-correction-service.ts
  - server/services/investment-ledger/position-conversion-service.ts
  - server/services/investment-ledger/position-service.ts
  - server/services/investment-ledger/position-valuation-service.ts
  - server/services/reserves/dynamic-reserve-intelligence-service.ts
  - shared/contracts/dynamic-reserve-intelligence-v1.contract.ts
  - shared/contracts/financial-facts-snapshot-v1.contract.ts
  - shared/contracts/internal-economics/internal-economics-input-v2.contract.ts
  - shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts
  - shared/contracts/investment-ledger/current-position.contract.ts
  - shared/contracts/investment-ledger/position.contract.ts
  - shared/core/moic/MOICCalculator.ts
  - shared/lib/internal-economics/v2/derive-composite-v2.ts
  - shared/lib/internal-economics/v2/event-stream-engine-v2.ts
  - shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts
  - shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts
  - shared/schema/investment-positions.ts
---

# C3b Deployed Reserve MOIC

## Goal

Define security-keyed MOIC on deployed reserves and its V3 admission chain after
Program B admits exact security-lineage routing.

## Non-Goals

- No deal-level proceeds fallback or first-security selection.
- No use of total invested capital as deployed-reserve denominator.
- No mutation of V1/V2 reserve snapshots.
- No admission waiver inside C3b.

## Existing Surfaces and Actual Consumers

The current reserve producer emits V1 planned-reserve intelligence. Internal
Economics V2 contains event-stream, liquidity receipt, composite, and
deal-by-deal waterfall surfaces. Program B is separately specifying exact
`dealId:securityId` proceeds routing; C3b cannot consume it before its source
contract is admitted.

## Normative Product Decisions

1. Versions are `dynamic-reserve-intelligence-v3` and `reserve-intel-v3`.
2. Metric grain is security, not deal.
3. Denominator is cumulative reserve capital deployed to that security,
   excluding initial investment and unfunded plan.
4. Acquisition price is weighted by security-level deployed reserve lots.
5. Numerator uses only admitted security-attributed value/proceeds. Partial
   sale, write-off, correction, and conversion retain exact lineage.
6. Missing lineage makes the security unavailable and excluded from
   authoritative ranking.
7. V3 contains planned, C3a marginal, and deployed sections in one atomic
   snapshot.

## Request and Response Contracts

V3 coherence envelope contains `financialFactsSnapshotId`, complete normalized
`basisRef` or legacy `null`, `sourceConfigId`, `sourceConfigVersion`,
`modelInputAsOfDate`, `inputHash`, and `configHash`. Every C3b
input/result/request/receipt identity includes all eight
`FinancialFactsBasisRef` fields: `schemaId`, `fundId`, `snapshotId`,
`snapshotInputHash`, `sourceFactsInputHash`, `policyVersion`, `asOfDate`,
`knowledgeCutoff`.

Each section has its own denominator, provenance, availability, and refusal
reason. Payload-5 consumers may use qualified reserve reconciliation; missing
NAV/RVPI/TVPI remain typed unavailable.

### Participation-to-security source contract

Canonical security identity is
`participation:<vehicle_financing_participations.id>`. The Program B input
builder derives every `InvestmentLot.securityId` from the participation row;
callers cannot provide a security ID. A lot with any other key, a position
participation with no admitted Program B lot, or ambiguous correction lineage is
typed unavailable before metric construction.

Position events are authoritative for security-level deployed cost and proceeds:

- acquisition and capitalized adjustment increase deployed reserve cost only
  when their admitted lot provenance identifies the same participation;
- realization reduces security position and attributes only its admitted
  relief-row proceeds;
- write-off attributes zero proceeds and consumes only the named security lot;
- conversion moves remaining cost/proceeds lineage from source participation to
  resulting participation through conversion relief rows;
- reversal/correction events cancel the replaced event and only the live
  successor participation contributes.

Current fair value is presently vehicle/company aggregate. It may be assigned to
a security only when exactly one eligible live participation maps the position
at the valuation date. Zero or multiple live participations,
superseded/correction heads, missing conversion lineage, or invalid Program B
lot keys return typed unavailability. No proportional split, chronology guess,
amount similarity, first match, or preassembled `attributedValue` input is
permitted.

The normative loader starts from persisted participation, position event,
relief, conversion, correction, and valuation rows. The calculator accepts the
loader's typed projection only; it never accepts arbitrary caller-assembled
security lots or value.

### Partial availability and atomic snapshot rule

```ts
type DeployedReserveSecurityResultV3 =
  | {
      securityId: string;
      availability: 'available';
      denominatorUsd: string;
      attributedValueUsd: string;
      attributedProceedsUsd: string;
      weightedAcquisitionPrice: string;
      moic: string;
      provenanceHash: string;
    }
  | {
      securityId: string;
      availability: 'unavailable';
      denominatorUsd: null;
      attributedValueUsd: null;
      attributedProceedsUsd: null;
      weightedAcquisitionPrice: null;
      moic: null;
      refusalCode: string;
      provenanceHash: string;
    };
```

One security's lineage failure produces its unavailable entry while other
coherent securities remain available in the same atomic V3 snapshot. Whole V3
snapshot creation refuses only when shared coherence/basis/config is invalid,
global ledger conservation fails, or deterministic ordered results cannot be
constructed for every requested security. Rankings include only `available`
entries and return unavailable entries separately.

## Authoritative Inputs and Source Versions

The currently inspected Program B candidate is local commit
`2dcede86f62446bd2d988cfb1819f54158300c71`, including receipt version
`internal-economics-receipt/2.4.0` and deal-waterfall version `2.3.0`. This is
inspection evidence only, not source admission. Before C3b review or approval,
replace this candidate note with the accepted Program B receipt ID, source SHA,
payload/engine/receipt versions, and corpus revision, and prove that admitted
SHA is an ancestor of the C3b source baseline.

The sole deployed-reserve source is Program B's admitted exact security-lineage
receipt/version.
`shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts`
is the baseline version-authority contract for receipt `2.4.0`. C3b records the
admitted receipt ID, exact source SHA, and versions before implementation
approval. Legacy pro-rata indicative outputs remain labeled and excluded from
ranking.

## Persistence and Hash Semantics

V3 `resultHash` is `sha256CanonicalJson` of exactly: `schemaVersion`,
`engineVersion`, `financialFactsSnapshotId`, `basisRef`, `sourceConfigId`,
`sourceConfigVersion`, `modelInputAsOfDate`, `inputHash`, `configHash`,
`planned`, `marginal`, `deployed`. Command, operator, timestamps, and request
metadata are excluded.

V3 admission requires named `reserve-intel-v2-v3-marginal-equivalence` proof.
Its receipt stores predecessor V2 receipt ID/hash, source SHA, corpus revision,
equivalence run ID, V2/V3 marginal input/config/section hashes, and current V3
calculation hashes. The service loads same-fund accepted V2 predecessor and
recomputes both receipt hashes before V3 insert.

Ranking service and route consume the persisted V3 deployed section from the
same admitted snapshot used by C3a. They do not rebuild values from legacy
company MOIC inputs. `ReserveIntelligencePanel` and MOIC analysis page render
server ranking and typed unavailable entries, including participation ID,
denominator, weighted price, and lineage receipt identity.

## Idempotency, Concurrency, and Recovery

The producer persists all three sections and completed run atomically. Admission
is idempotent by canonical request material. Any predecessor, equivalence, or
current calculation mismatch refuses before receipt insertion.

## Refusal Matrix

| Condition                                    | Result                                                                        | Durable writes                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Program B contract not admitted              | dependency blocked                                                            | 0                                                                     |
| Security lineage missing/ambiguous           | unavailable security entry inside coherent V3 snapshot; excluded from ranking | V3 snapshot persists if shared coherence and global conservation pass |
| Mixed basis or any basis field mismatch      | typed basis refusal                                                           | 0                                                                     |
| Legacy policy has non-null synthetic basis   | typed legacy refusal                                                          | 0                                                                     |
| Missing/cross-fund/unaccepted V2 predecessor | admission refused                                                             | 0 receipt                                                             |
| Predecessor receipt hash mismatch            | admission refused                                                             | 0 receipt                                                             |
| Marginal input/config/section mismatch       | equivalence refused                                                           | 0 receipt                                                             |
| Global proceeds conservation fails           | calculation refused                                                           | 0 snapshot/receipt                                                    |

## Authorization and Fund Ownership

All security lots, snapshots, calculations, and admission receipts must belong
to one fund. Exact Program B source admission and repository-owner C3b spec
approval are distinct prerequisites.

## UI States and Accessibility

Rank only available admitted security metrics. Show denominator, weighted
acquisition price, source version, and refusal reason. Legacy indicative values
use a distinct text label and never share authoritative sort controls.

## Exact File Manifest

Only paths present at `source_sha` appear below. Files marked `Create` or
otherwise absent at that baseline in the companion implementation plan are
prospective and intentionally have no baseline hash.

| Source path                                                                     | SHA-256 at `source_sha`                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `client/src/components/fund-results/ReserveIntelligencePanel.tsx`               | `58608043e3cce61250b689eee236d00e4ee5e1cccb9d27006ab49f3378660d43` |
| `client/src/pages/fund-model-results-moic-analysis.tsx`                         | `308712f16c186c88e0aa2090ca31930e1c1da55b98815650ca2e96aff3995c8e` |
| `server/routes/fund-moic.ts`                                                    | `2fdbdb53059b30079bd876bee376cb8749c802d7fd3e5a04f1d2cec9f0bd28ba` |
| `server/services/fund-moic-ranking-service.ts`                                  | `39f1557b7e4da2276c4b1d868e0c4e7829a49c54a7b78c1cf95d5bab5fe9c607` |
| `server/services/investment-ledger/current-position-service.ts`                 | `3143e0920c33758598c472bb8350806ca60fb096aa0796632f876d282ea919cf` |
| `server/services/investment-ledger/ledger-correction-service.ts`                | `9f400afd438f3830d5a8ae044e5b43e51088332e7e1d3d02bfabbe3e559bb0c0` |
| `server/services/investment-ledger/position-conversion-service.ts`              | `ff43280abadf6b222787cc3b5d8b9d8480efd16f0aea772c5133dfac9a6ba114` |
| `server/services/investment-ledger/position-service.ts`                         | `c136ba0132d9c92e68d68fe43dd1b32b9a25e8fa7b5bb4ceda8b698ab17ff2f0` |
| `server/services/investment-ledger/position-valuation-service.ts`               | `0c3339e2cde82b36e0f308537302757174892f9fa1840c99dfecbb16ded69b97` |
| `server/services/reserves/dynamic-reserve-intelligence-service.ts`              | `d50bb673f895fcca93a9f90b366e9790fe410ff5bbb852c65410d2c5875eccfc` |
| `shared/contracts/dynamic-reserve-intelligence-v1.contract.ts`                  | `c88a024ec102de1ad4273253af52b636757eb90e4660ed419fb983630d1e7f13` |
| `shared/contracts/financial-facts-snapshot-v1.contract.ts`                      | `bdb763daa8a9ab0e62dadd47df9b4d165fcb5021d0ad73b04c82166fb1032a9e` |
| `shared/contracts/internal-economics/internal-economics-input-v2.contract.ts`   | `5ddeeee204e1af0b85034b155c882b831c483003a9a89efc032f97ea79cff6ca` |
| `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts` | `50f806a1eaf25fd1b74deb0f3bc0466f3c56f348cf30e4fab159ce89b0aae998` |
| `shared/contracts/investment-ledger/current-position.contract.ts`               | `f63efd6e4e8fef39e307124a821bfaa46ce9d66fa2f2363e6b62c97eb191860b` |
| `shared/contracts/investment-ledger/position.contract.ts`                       | `e83cfd9ca279028e8ee447eed1cf5e6d3f82a59d3a9faba4ebc5e29709166669` |
| `shared/core/moic/MOICCalculator.ts`                                            | `b4040962c1c6b42238d6dc4cfa396231801e0effd9e3a02c8499ac49ac591515` |
| `shared/lib/internal-economics/v2/derive-composite-v2.ts`                       | `8badbc3097febf3a38c061300b74f10e452aa368d0c9c1456cd83095f48d35c1` |
| `shared/lib/internal-economics/v2/event-stream-engine-v2.ts`                    | `940e311a9cd9cabdf298bb4d28ac8bef3264e5155db18ad17acbb0422d6ea51f` |
| `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts`              | `073d128966641e528f9fc959f3bf2083680ab89099ecaca555fe7caec138474f` |
| `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts`                 | `bd585df8081349b7d779a05ad53e645f31f50ba2baec7be112e89dcaab205ffa` |
| `shared/schema/investment-positions.ts`                                         | `526efffd3d3ae2c9ae8a1e9ec5f485d0be8b91d6fb0fb912a56c51d9046cfb6e` |

## Exact Test Manifest

- `tests/unit/contracts/dynamic-reserve-intelligence-v3.contract.test.ts`:
  coherence and full basis identity.
- `tests/unit/reserves/deployed-reserve-moic-v3.test.ts`: multiple securities,
  weighted price, partial sale, write-off, correction, conversion, missing
  lineage.
- `tests/unit/internal-economics/security-proceeds-conservation.test.ts`:
  security and global conservation.
- `tests/integration/reserve-intelligence-admission.pg.test.ts`:
  predecessor/equivalence hashes, replay, zero-write refusal.
- `tests/phoenix/truth-cases/deployed-reserve-moic-v3.test.ts`: expected outputs
  and changed-case manifest binding.

## Admission and Rollout Gates

Order is C3a, admitted Program B source, C3b, then C3c. V3 candidate requires
accepted V2 receipt plus successful named equivalence proof. Exact-spec
approval, source admission, deployment, serving, and production action remain
independent.
