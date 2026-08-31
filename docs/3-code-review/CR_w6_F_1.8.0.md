---
status: HISTORICAL
audience: both
last_updated: 2026-08-31
owner: '@nikhillinit'
---

# Code Review: F_1.8.0 Operating Decisions Spine (issue #1289)

**Review Date**: 2026-08-31 **Version**: plan-keyed F_1.8.0 (no release tag;
package version remains 1.6.0) **Files Reviewed**:

- `shared/schema/operating-objects.ts`
- `migrations/0054_operating_decisions_spine.sql` +
  `migrations/meta/_journal.json`
- `shared/contracts/operating-objects/decision.contract.ts`
- `shared/contracts/operating-objects/task.contract.ts`
- `server/services/operating-objects/decision-service.ts`
- `server/services/operating-objects/decision-evidence-link-service.ts`
- `server/services/operating-objects/task-service.ts`
- `server/routes/operating-object-tasks.ts`
- `server/lib/database-backed-idempotency-routes.ts`
- `tests/integration/operating-decisions/operating-decisions-schema.pg.test.ts`
- `tests/unit/` (task-service, operating-object-tasks contract,
  idempotency-routes middleware suites)
- `DECISIONS.md` (proposed ADR-091), `CHANGELOG.md`,
  `docs/2-changelog/w6_F_1.8.0.md`

**Plan**: `docs/1-plans/F_1.8.0_operating-decisions-spine.plan.md`

---

## Executive Summary

Implements issue #1289: the `operating_decisions` table with ADR-067-conforming
lifecycle (proposed -> accepted | rejected | deferred, supersession, terminal
immutability, deferred follow-up requirements), decision-sourced evidence links
(same-fund, exactly-one-target, immutable), and task-create idempotency
(`idempotencyKey` + `requestHash` preserving xmin optimistic locking), with a
journal-pinned, drift-refusing migration. Codex loop: round 1 REQUEST_CHANGES (1
Critical, 2 Major, 1 Minor), round 2 APPROVED. Verdict: APPROVED.

---

## Changes Overview

Schema and migration 0054 (journal idx 55) create the decision spine behind an
absent-or-exact catalog preflight covering column set/types/nullability,
defaults and serial-sequence ownership, constraint definitions, exact function
`prosrc`, and index definitions plus `indisvalid`/`indisready`/`indislive`
validity flags — refusing replay over any drifted same-named object. Services
add idempotent creation/supersession/outcome recording and evidence links via
`runIdempotentCommand` with normative preimages (actor and server-controlled
`status` excluded from hashes). The single permitted route-file edit adds
Idempotency-Key pass-through and typed `IdempotentCommandError` mapping (201
create / 200 replay / 409 conflict); the `TASK_CREATION_PATH` classifier entry
bypasses the Railway blind-cache middleware so both surfaces converge on
database-backed semantics.

---

## Findings

### Critical Issues

- **New fund-scoped tables have no RLS** — disposition: accepted with override
  (evidence-backed pushback). No operating-objects sibling table has RLS
  (`tasks` 0020, `task_evidence_links` 0047); no live route sets the
  `app.current_*` GUCs, so FORCE RLS with GUC-keyed policies would deny every
  row. The actual family pattern — handler `enforceProvidedFundScope`,
  per-statement `fund_id` scoping, same-fund composite FKs — is present, with
  cross-fund negative pg tests. Posture recorded in ADR-091 item 6; family-wide
  RLS adoption flagged as an owner decision. Reviewer accepted the disposition
  in round 2.

### Major Issues

- **Immutable-function preflight checked only marker text** — addressed: exact
  canonical `prosrc` comparison against the 0045 body; no-op-rewrite drift test
  asserts the RAISE.
- **Index preflight ignored validity flags** — addressed: all three named
  indexes refuse unless `indisvalid AND indisready AND indislive`; catalog-flip
  drift test runs the real preflight SQL.

### Minor Issues

- **ADR and changelog missing from the PR** — addressed: proposed ADR-091,
  `docs/2-changelog/w6_F_1.8.0.md`, and the root `CHANGELOG.md` entry are in the
  change set.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Architecture & Plan Conformance — passed (RLS posture accepted
      override, recorded in ADR-091; no #1290 route scope entered)
- [x] 3. Code Quality — passed
- [x] 4. Error Handling — passed (typed 409 mapping; DrizzleQueryError `.cause`
      unwrapping fix found by the pg suite)
- [x] 5. Security — passed with caveat (defense-in-depth RLS deferred to an
      owner decision; handler + FK enforcement proven by cross-fund tests)
- [x] 6. Performance — passed
- [x] 7. Testing — passed (pg suite 9 tests incl. 14 drift-refusal scenarios;
      full testcontainers gate 26 files / 160 tests; targeted units 130;
      registered in `tests/config/testcontainers-test-paths.mjs`)
- [x] 8. Documentation — passed (ADR-091 PROPOSED, changelogs, this record)

---

## Verification Evidence

At the reviewed candidate (uncommitted worktree diff on
`feat/operating-decisions-spine`, base `aa355aaf7`), `TZ=UTC`:

- New pg suite scoped: 9/9 (~27s). Full `npm run test:testcontainers`: 26 files
  passed / 3 skipped, 160 tests passed / 21 skipped, exit 0 (colima, Docker
  29.7.2).
- Targeted unit suites: 130 passed. `npm run check`: 0 new errors.
  `npm run lint`: eslint + all guardrails pass. `git diff --check`: clean.
- `npm run docs:routing:check`: PASS.

Review loop: codex-code-review, gpt-5.6-luna xhigh (fast tier), round 1
REQUEST_CHANGES -> round 2 APPROVED.

Owner ratification of proposed ADR-091 (including the RLS posture, item 6)
occurs at merge review and is a precondition of merging this candidate.
Follow-on scope: #1290 (routes) is a separate plan; migration apply to any
environment is separately authorized per governing policy.
