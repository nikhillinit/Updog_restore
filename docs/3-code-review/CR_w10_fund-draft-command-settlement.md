---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Code Review: Fund Draft Command Settlement

**Review Date**: 2026-09-24  
**Version**: 1.6.0 (package unchanged; client refactor, no new application
version or release tag)  
**Files Reviewed**:

- `CHANGELOG.md`
- `TODOS.md`
- `client/src/components/workspace/FundWorkspace.tsx`
- `client/src/hooks/useFundDraftSync.ts`
- `client/src/pages/FundBasicsStep.tsx`
- `client/src/services/fund-draft-settlement.ts`
- `docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md`
- `docs/_generated/router-fast.json`
- `tests/e2e/fund-workspace-real-backend.spec.ts`
- `tests/unit/components/workspace/fund-workspace.test.tsx`
- `tests/unit/pages/fund-basics-bootstrap.test.tsx`
- `tests/unit/pages/fund-setup-draft-sync.test.tsx`
- `tests/unit/services/fund-draft-settlement.test.tsx`

**Plan**: `docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md`

---

## Executive Summary

Change centralizes fund-draft command preparation, replay fencing, settlement,
and snapshot hydration while preserving caller-specific UI behavior. All formal
review findings are addressed; remaining observations are pre-existing or
explicitly deferred.

APPROVED with observations

---

## Changes Overview

New settlement service owns save dispatch and typed outcomes
(`client/src/services/fund-draft-settlement.ts:24-108`). Wizard autosave, Fund
Workspace, and Fund Basics now consume that shared path
(`client/src/hooks/useFundDraftSync.ts:129-183`,
`client/src/components/workspace/FundWorkspace.tsx:358-405`,
`client/src/pages/FundBasicsStep.tsx:224-269`).

Regression coverage verifies superseded commands, canonical replay comparison,
storage and hydration fences, uncertain outcomes, and same-turn settlement.
Real-backend acceptance verifies interrupted-save recovery reuses the original
idempotency key and ETag without advancing the revision twice
(`tests/e2e/fund-workspace-real-backend.spec.ts:436-520`).

---

## Findings

### Critical Issues

None.

### Major Issues

- **Required Fund Setup Playwright execution was not reported** —
  `docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md:566-586`,
  `tests/e2e/fund-setup-workflow.spec.ts:171-209`. **Disposition: addressed.**
  Required spec was run: 35 passed and one unchanged stale assertion failed.
  Real-backend acceptance also passed, including interrupted-save replay. Plan
  execution item is complete at
  `docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md:633-635`.

### Minor Issues

None.

### Suggestions

- **Stale Fund Setup whole-dollar assertion** —
  `tests/e2e/fund-setup-workflow.spec.ts:206-209`. **Disposition: accepted
  override and deferred.** Spec expects `fundSize: 75`, while current
  application and unit-test contracts use whole dollars
  (`client/src/pages/FundBasicsStep.tsx:309-316`,
  `tests/unit/pages/fund-basics-bootstrap.test.tsx:198-225`). Spec is unchanged
  by this change set and excluded by plan scope.
- **Possible false “Save not confirmed” bootstrap alert** — `TODOS.md:187-212`.
  **Disposition: intentionally deferred.** Plan preserves existing sequencing
  except rulings R5 and R9; follow-up is explicitly recorded rather than
  expanded into this refactor.

---

## Checklist

- [ ] 1. Functional Requirements — passed with caveat: one unchanged stale E2E
      unit expectation remains at
      `tests/e2e/fund-setup-workflow.spec.ts:206-209`.
- [x] 2. Code Quality — passed.
- [x] 3. Architectural Compliance — passed.
- [x] 4. Error Handling — passed.
- [x] 5. Security — passed.
- [x] 6. Performance — passed.

---

## Verdict

**APPROVED with observations**

Lint and typecheck are clean. Unit testing reported 16,699 passing tests; 17
unchanged failures are path-sensitive worktree artifacts. Integration smoke and
real-backend replay acceptance passed. Fund Setup Playwright reported 35 passing
tests and one pre-existing stale whole-dollar assertion, accepted as an
out-of-scope test defect. No critical, major, or open change-set findings
remain.
