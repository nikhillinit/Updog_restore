# Code Review: F2 First Public Selected-Lane Success (F_2.0.1)

**Review Date**: 2026-08-24 (revised same day after independent red-team pushback; re-reviewed same day after Task 6.4 repair)
**Version**: 2.0.1 (plan F_2.0.1 + Addendum A; uncommitted change — package version remains 1.6.0)
**Files Reviewed** (nine; first five are the original F2 scope, next three the Addendum A extension per plan section 9.2, last two are evidence documents):

- `shared/lib/internal-economics/v2/derive-composite-v2.ts` (+42/-8)
- `tests/unit/internal-economics/v2/derive-composite-v2.test.ts` (+304/-1; includes 2 admission-ordering tests and 3 provenance-refusal regressions)
- `tests/unit/internal-economics/v2/reserve-funding-classifier-v2.test.ts` (+42/-0)
- `tests/unit/truth-cases/internal-economics-v2-first-success.test.ts` (new, +157)
- `shared/contracts/internal-economics/internal-economics-input-v2.contract.ts` (+4/-4; `.strict()` on the four tier schemas)
- `shared/lib/internal-economics/v2/normalize-input-v2.ts` (+22; ratio bounds in `validateTierPolicy`)
- `tests/unit/internal-economics/v2/normalize-input-v2.test.ts` (+217; strict, bounds, boundary tests)
- `docs/1-plans/F_2.0.1_v2-post-merge-repair-and-f2-entry.plan.md` (new, evidence only; section 9 Addendum A appended 2026-08-24)
- `docs/3-code-review/CR_w6_v2.0.1.md` (this record — uncommitted review evidence, disclosed per Minor finding 2)

**Plan**: `docs/1-plans/F_2.0.1_v2-post-merge-repair-and-f2-entry.plan.md` (APPROVED, thread `01a03481-8581-7c50-b6d4-e69dfbcd388d`; Addendum A approved for local execution by owner directive)

**Change set**: uncommitted diff in `/tmp/updog-f2-first-success-20260824/worktree` on base `f50b4f516ecce70a099cb627935ec5d6d4a79405`; root checkout untouched. Review criteria: `.claude/skills/TRIP-review/checklist.md`.

---

## Executive Summary

F2 retires the F1 base admission refusal for exactly one F2-entry paid-in cash-only, fee-free, deal-by-deal seam and returns the existing detached V2 receipt. Independent reviews exposed three decision-quality defects the F2 success path made reachable: silent unknown-field stripping in four tier schemas, an unbounded `gpShare` ratio, and accepted opening investment provenance omitted from the receipt. Task 6.4 repaired the contract defects with strict tier schemas and inclusive `[0, 1]` Decimal bounds. Council remediation excludes unclassified cash and unhydrated opening provenance from the seam. The valid-envelope receipt and pre-existing hashes remain byte-stable. APPROVED with observations.

---

## Changes Overview

Two commits-worth of uncommitted work, one logical change. The F2 batch adds `isExactF2AdmissionEnvelope` (derive-composite-v2.ts:84) admitting only the plan section 4 envelope, with guard order preserved (management-fee refusal, event-capability refusal, envelope success, otherwise `UNSUPPORTED_V2_BASE_EVENT/admission`), plus the hand-authored `V2-S-0101` truth case with independent oracle hashes, 19 boundary/precedence tests, a reserve-classifier isolation test, and fail-closed guards for unclassified cash and unhydrated opening provenance. The Task 6.4 batch hardens the contract the envelope depends on: `.strict()` on all four tier schemas (unknown tier fields now refuse `SCHEMA_VALIDATION_FAILED/normalization`) and a ratio-bounds pass in `validateTierPolicy` (out-of-range rates refuse `INVALID_TIER_POLICY/normalization`), with 19 new tests including boundary acceptance at `0`, `-0`, and `1`. No receipt builder, event engine, waterfall, reserve classifier, corpus adapter, or shared decimal-string change.

---

## Findings

### Critical Issues

None. Neither original Major finding reached production data: the change is unmerged, the engine has no persistence or activation surface, and both were input-validation gaps, not corruption of stored data. If this success path ever becomes production-reachable, the repaired strictness and bounds are the required precondition — that precondition now holds.

### Major Issues

1. **Tier schemas silently strip unknown fields; distinct wire inputs collide to one normalized hash** — `shared/contracts/internal-economics/internal-economics-input-v2.contract.ts:207-237`. Original evidence: extra tier field returned `ok: true` with baseline-identical `normalizedInputHash` (`8542190f…0f70ab`); the four tier schemas were the only non-strict objects among 32 in the contract. Disposition: **addressed** in Task 6.4 — all four tier schemas now `.strict()`; reviewer repro case D refuses `SCHEMA_VALIDATION_FAILED/normalization`; per-kind unknown-field refusal tests added (4 cases in `normalize-input-v2.test.ts`); admission-ordering test proves an F2 fixture with an unknown tier field refuses at normalization before admission.
2. **`gpShare` ratio format-validated only; `-1` and `2` derive to success** — `internal-economics-input-v2.contract.ts:226-229` via `shared/lib/decimal-string.ts:5-10`. Original evidence: `gpShare = -1` and `2` both returned `ok: true` with receipts byte-identical to the `0.20` baseline. Disposition: **addressed** in Task 6.4 — `validateTierPolicy` (normalize-input-v2.ts:196-215) enforces inclusive `[0, 1]` Decimal bounds on `gpShare`, `gpAllocationRate`, and `annualRate`; reviewer repro cases A and B refuse `INVALID_TIER_POLICY/normalization`; six out-of-range refusal tests and seven boundary-acceptance tests (`0`, `-0`, `1`) added; admission-ordering test proves an out-of-range F2 fixture refuses at normalization, never reaching admission. The shared `RatioDecimalStringSchema` was deliberately not touched (V1 freeze, other contracts depend on it); bounds live in the V2 normalizer.
3. **Accepted opening economics could disappear from the success receipt** — a normalized input with a `$1` opening investment lot and matching entitlement pool returned `ok: true`, while event-state initialization started with empty investment lots and the detached receipt omitted the accepted lot. Disposition: **addressed** by narrowing the F2-entry seam to zero recycling and unclassified cash, paid-in-only cash lots, and empty `investmentLots` and `entitlementPools`. Three refusal regressions cover opening investment provenance, nonzero unclassified cash, and a zero-balance unclassified lot. Existing refusal precedence remains unchanged. Empty `investmentLots` is retained explicitly with empty `entitlementPools` as defense-in-depth even though strict provenance normalization makes the predicates partially redundant.

### Minor Issues

1. **Plan self-authorization wording** — `docs/1-plans/F_2.0.1_v2-post-merge-repair-and-f2-entry.plan.md:18` ("This plan authorizes only…"). Under the governing policy's catch-all, a plan can never grant authority; the sentence is void as authorization language and reads only as procedural scoping. Disposition: **accepted as documented** — plan section 9.6 records the policy reading; the approved plan text is evidence tied to a review thread and is not rewritten post-approval. Not blocking.
2. **Scope accounting in the first revision of this record** — the first revision claimed five-file scope while this record was a sixth file. Disposition: **addressed** — the header and verification table now account for all nine files, and Addendum A (plan section 9.2) explicitly whitelisted the three repair files plus this record.
3. **Stale review record mid-repair** — Codex code-review loop (thread `01a034ea-e1df-7330-816c-02035ca4f629`) returned `REQUEST_CHANGES` with one Minor: this record still showed M1/M2 open and `NEEDS REVISION` after the repair landed. Disposition: **addressed** by this re-review update.

### Suggestions

1. Test-helper (`buildV2S0101Input`) deduplication across three files — **declined by reviewer: YAGNI**.
2. Optional provenance comment on `isExactF2AdmissionEnvelope` — **declined by reviewer: YAGNI**.
3. When citing classifier evidence in handoffs, name the exact suite and count. Correct evidence on record: `tests/unit/ci-workflow-regression.test.ts` 77/77 + `tests/unit/docs/production-governance-routing.test.ts` 11/11 + rule inspection of `scripts/ci/classify-change-paths.mjs`. Accepted; recorded for future handoffs.

### Observations (non-blocking)

- F2-entry guard requires empty opening investmentLots and entitlementPools, zero recycling/unclassified opening cash, and paid_in-only cash lots; opening provenance remains excluded from the seam rather than inferred by event-state initialization.
- Internal/admin scope remains intact: no route, auth, persistence, provider, or production surface changed.
- Node patch delta between this host (22.23.1/10.9.8) and pinned evidence (22.23.2/10.9.2) is nonblocking; pinned toolchain unavailable on this host.

---

## Checklist

- [x] 1. Functional Requirements — passed post-repair; envelope predicates match plan section 4, refusal precedence reproduced by tests, tier-field and ratio boundaries now validated at normalization with refusal tests.
- [x] 2. Code Quality — passed; Suggestions 1-2 declined as YAGNI.
- [x] 3. Architectural Compliance — passed; ARCHI.md section 8.6 V2 pattern (stateless, refusal-first, no routes/persistence/jobs/activation), V1 byte-freeze untouched, repair follows the contract's own `.strict()` convention and the existing `validateTierPolicy` refusal site.
- [x] 4. Error Handling — passed; fail-closed default retained, F1 refusal precedence unchanged, contract defects now refuse at normalization ahead of admission.
- [x] 5. Security — not applicable to the diff (pure calculation core, no I/O, auth, secrets); input validation hardened as a correctness property.
- [x] 6. Performance — passed; bounded linear checks only, no new dependencies.

---

## Verification (reviewer-reproduced in the worktree, TZ=UTC, post-Task 6.4)

| Gate | Result |
| --- | --- |
| Focused files (normalize + derive + reserve + truth) | 131/131 pass |
| `npm run test:internal-economics-v2` | 275/275 pass |
| `npm run phoenix:truth` | 351/351 pass, 18 files — includes `V2-S-0101` |
| `npm run guard:decimal-string-laundering:check` | pass (146 files, no findings) |
| `npm run check` (typecheck, 3 projects) | pass, no new errors |
| `npm run lint` (eslint + guardrails) | pass |
| `TZ=UTC npm run calc-gate` | pass |
| `NODE_OPTIONS=--no-experimental-webstorage TZ=UTC npm test` (full unit, solo run) | 13508/13508 executed pass, 81 skipped, EXIT=0 |
| `git diff --check` | clean |
| `git status --short` | nine entries, all named in plan section 5 Task 6.3 plus section 9.2; nothing else |
| Red-team repro (`tsx /tmp/f2-repro.ts`) | A `gpShare=-1` and B `gpShare=2` refuse `INVALID_TIER_POLICY/normalization`; D extra tier field refuses `SCHEMA_VALIDATION_FAILED/normalization`; C baseline succeeds with byte-identical pre-repair hashes (`8542190f…` / `e0263b99…`) — valid-input stability proven |

RED discipline: the implementer reported 10 expected RED failures captured before the production change; the mechanism was independently verified by this review via the repro script's refusal inversion and baseline-hash stability.

Earlier full-suite flake note (first F2 review run): `tests/unit/routes/auth-login.test.ts` failed once under concurrent verification load, passes 11/11 isolated, and the post-repair full suite was run solo and is fully green. Environmental, not a finding.
Current environment note: default `TZ=UTC npm test` hit a Node experimental-webstorage cascade (`localStorage` unavailable without `--localstorage-file`). A representative client test and the full suite pass with `NODE_OPTIONS=--no-experimental-webstorage`; no client/runtime code changed for this financial patch.

Environment note: all reviewer reproduction under Node `v22.23.1` / npm `10.9.8`; pinned `22.23.2` / `10.9.2` unavailable on this host. Nonblocking patch delta. Stale `.node-version` (20) and README Node guidance remain a separate maintenance item outside F2 scope.

---

## Governance Alignment

Checked against `docs/governance/solo-internal-change-and-production-policy.md` resolved from `origin/main@f50b4f516ecce70a099cb627935ec5d6d4a79405` (the protected target branch, never the working tree — the worktree diff does not touch the policy file):

- **Roles**: this review and the plan are evidence/diagnostics only. Under the policy's authority table a review is a defect-finding observation — not independent approval, not authority, and no override of any machine failure. Verdict vocabulary above is the TRIP-review template's; it grants nothing. The plan's "authorizes" wording (Minor finding 1) is read under the policy catch-all as procedure only; plan section 9.6 records this.
- **Solo/internal scope**: no third party, external, or regulated use is entered; no provider coupling is triggered because nothing is merged or dispatched.
- **Material-risk domains entered**: financial calculation only. Local direct proof is present for the current dirty diff; exact-SHA proof remains unavailable pending commit and CI: current `phoenix:truth` (351/351, includes the change), named truth assertion `V2-S-0101`, plan-adopted `calc-gate`, and the two contract-validation defects and the opening-provenance omission repaired with refusal tests and reproduction inversion. Financial relevance is classifier-driven: the production files sit under the `shared/lib/` and `shared/contracts/` financial roots in `scripts/ci/classify-change-paths.mjs`, so a future exact-SHA CI run classifies financial and `financial-truth` feeds `CI Gate Status`.
- **Domains not entered**: auth/permission/confidential data, durable write/schema, queue/worker/retry, release/provider/governance enforcement. Idempotency and optimistic-locking mandates are not engaged by a pure derivation guard with no mutation path.
- **Scope governance**: the original five-file whitelist (plan Task 6.3) was extended exactly once, by owner-directed Addendum A (plan section 9.2), adding the contract file, the normalizer, its test file, and this review record. Current worktree contents match the extended whitelist precisely; no other surface was touched at any point (verified by `git status` at each review pass).
- **Merge/production authority**: `CI Gate Status` remains the sole aggregate merge gate; no live exact-SHA CI exists. Production dispatch would require the canonical route in `docs/workflows/PRODUCTION_SCRIPTS.md` with the repository owner as sole issuer; nothing here approaches it.
- **Documentation governance**: this record is institutional memory under `docs/3-code-review/` (non-derivable verdict and environment evidence), not a prunable session artifact; it stays uncommitted with the change because commit authority is `ABSENT`. No Phoenix protected paths were touched; nothing was archived or deleted.

---

## Verdict

**APPROVED with observations**

The F2 diff plus Task 6.4 repairs implement exactly the approved plan including Addendum A, and nothing more. Both red-team Major findings and the Council provenance-loss finding are repaired at the mechanism level and verified by reproduction inversion: unknown tier fields refuse `SCHEMA_VALIDATION_FAILED/normalization`; out-of-range `gpShare`, `gpAllocationRate`, and `annualRate` refuse `INVALID_TIER_POLICY/normalization`; boundary values `0`/`-0`/`1` remain valid; unsupported unclassified cash and opening investment provenance refuse at admission; the valid-envelope `V2-S-0101` receipt and all pre-existing F1 corpus hashes are byte-stable. Every runnable local gate the plan names passes under reviewer reproduction; source-SHA regeneration and exact-head CI remain unavailable until commit and push authority. Open observations are non-blocking: Minor finding 1 (plan wording, policy-voided), the three Suggestions (two declined YAGNI, one process note), and the pinned-Node patch delta. Authority states, changed only where the repair earned it: review verdict `APPROVED with observations`; local merge eligibility `UNKNOWN` (cleared from `BLOCKED` — blockers repaired) pending exact-SHA CI; exact-SHA CI status `UNKNOWN`; commit authority `ABSENT`; merge authority `ABSENT` (owner action plus live `CI Gate Status` required); deployment readiness `NOT READY` (no deployment validation performed or claimed); production authority `ABSENT`. This review remains a defect-finding observation and grants no authority.

## Council remediation erratum — frozen V2-S-0100 proposition (2026-08-24)

The implemented F2-entry case is `V2-S-0101`, the paid-in cash-only first-success seam. `V2-S-0100` remains reserved for the frozen full-state proposition and its complete state, journal, receipt, and hash proposition; this remediation does not redefine, recompute, or invalidate it.
