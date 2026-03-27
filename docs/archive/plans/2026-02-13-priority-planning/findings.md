# Priority Planning: Findings

**Date:** 2026-02-13 **Branch:** feat/pipeline-ui-clean (4 commits ahead of
main)

## Current Health

| Metric      | Value                                 |
| ----------- | ------------------------------------- |
| Test files  | 131 passing, 11 skipped (quarantined) |
| Tests       | 2757 passing, 213 skipped, 0 failures |
| Build       | Clean                                 |
| Open issues | 0                                     |
| TypeScript  | Clean (strict mode)                   |

## Completed Work (Recent Milestones)

### Phase 1: GP Modernization (PR #478) - DONE

- Token system wired to Tailwind
- Visual foundation (tabular-nums, contrast audit)

### Phase 2 Execution (PR #479-#480) - PARTIAL

- **Gate 0** (production hygiene): DONE
- **Epic G** (unified feature flags): DONE - 27 flags in YAML registry
- **Epic H** (E2E test coverage): DONE - 39 test cases across 5 spec files
- **Epic I** (wizard steps 4-7): PARTIAL - Step 7 done, XState deferred
- **Epic J** (reporting + sharing): PARTIAL - sharing backend + newspaper mode
  done

### Infrastructure (PRs #498-#504)

- Server 3-mode boot strategy + CSP consolidation
- Pipeline CSV import hardening, numeric validation, accessibility
- Portfolio optimization calibration + type safety
- CodeQL CI permissions fix

## Deferred / Outstanding Items

### Phase 2 Deferred (from iteration log)

| Item                                    | Epic     | Severity | Notes                               |
| --------------------------------------- | -------- | -------- | ----------------------------------- |
| XState machine alignment                | I        | MEDIUM   | Steps vs machine mismatch           |
| Cross-step validation                   | I        | MEDIUM   | Wizard data consistency             |
| Data persistence consolidation          | I        | LOW      | Works but fragmented                |
| Font bundling (CDN elimination)         | J.1      | LOW      | Non-blocking                        |
| Export strategy (BullMQ pipeline)       | J.3      | HIGH     | ADR-017 planned but unbuilt         |
| Financial accuracy (placeholder values) | J.5      | HIGH     | IRR/tax placeholders in PDF         |
| Delete \_archive/.migration-backup/     | Gate 0.4 | LOW      | 4.9GB bloat, awaiting user decision |

### Planned But Unstarted Features

| Feature                         | Planning Doc                       | Status                                       |
| ------------------------------- | ---------------------------------- | -------------------------------------------- |
| LP Portal Sprint 3              | `2025-12-31-lp-portal-sprint-3.md` | Planned, not started                         |
| Monte Carlo frontend            | CHANGELOG (API exists)             | Backend done, no UI                          |
| Cohort Analysis polish          | CHANGELOG (engine exists)          | V1 done, V2 gated                            |
| Phoenix Phase 2 (probabilistic) | `execution-plan-v2.34.md`          | Engine docs complete, implementation pending |

### Tech Debt

| Item                                 | Source               | Priority |
| ------------------------------------ | -------------------- | -------- |
| 475+ no-console lint warnings        | Gate 0.1 baseline    | LOW      |
| Legacy flag migration (8 deprecated) | Epic G registry      | MEDIUM   |
| 213 skipped/quarantined tests        | Test suite           | MEDIUM   |
| TypeScript baseline violations       | `.tsc-baseline.json` | LOW      |

## Current Branch State

`feat/pipeline-ui-clean` has uncommitted work:

- Pipeline UI components: `AddDealModal.tsx`, `DealCard.tsx`,
  `ImportDealsModal.tsx`
- Server boot/security hardening
- CI workflow fixes

These should be merged to main before starting new priority work.
