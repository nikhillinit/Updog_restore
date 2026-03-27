# Next Priority Development Goals

**Date:** 2026-02-13 **Author:** Planning Session **Status:** PROPOSED -
Awaiting Review

---

## Priority Framework

Priorities scored on: **user-facing impact**, **technical risk**, and
**dependency chain** (blocks other work).

---

## Priority 0: Merge Current Branch

**Goal:** Clean slate before new work.

| Task | Description                                                                                        | Effort |
| ---- | -------------------------------------------------------------------------------------------------- | ------ |
| P0.1 | Merge `feat/pipeline-ui-clean` to main (4 commits: pipeline UI, server boot, optimization, CodeQL) | 1 hour |
| P0.2 | Delete `_archive/.migration-backup/` (4.9GB bloat from Gate 0.4)                                   | 5 min  |

**Rationale:** Unmerged branch creates drift. Pipeline UI, server hardening, and
CI fixes are production-ready.

---

## Priority 1: Financial Accuracy (Epic J.5 + Export)

**Goal:** Eliminate placeholder values in GP-facing reports. This is the
highest-impact user-facing gap.

| Task | Description                                                                                             | Effort  |
| ---- | ------------------------------------------------------------------------------------------------------- | ------- |
| 1.1  | Audit all placeholder/hardcoded values in PDF service (`server/services/pdf-generation.ts`, 1181 lines) | 2 hours |
| 1.2  | Wire real IRR/TVPI/DPI from fund analytics into report templates                                        | 4 hours |
| 1.3  | Wire real tax allocation data (ROC vs taxable) into distribution reports                                | 4 hours |
| 1.4  | Export strategy foundation (ADR-017: BullMQ async pipeline)                                             | 8 hours |
| 1.5  | Truth-case validation: PDF output vs Phoenix truth cases                                                | 4 hours |

**Why first:** A GP reporting tool with placeholder financial data is a
credibility risk. This must be correct before any external use.

**Agents:** `phoenix-truth-case-orchestrator`, `xirr-fees-validator`

---

## Priority 2: Wizard Completion (Epic I Deferred)

**Goal:** Complete the fund creation wizard so new funds can be created
end-to-end.

| Task | Description                                                          | Effort  |
| ---- | -------------------------------------------------------------------- | ------- |
| 2.1  | Audit XState machine vs router step alignment (7 steps vs 6 routes)  | 2 hours |
| 2.2  | Implement cross-step validation (prevent submitting incomplete fund) | 4 hours |
| 2.3  | Consolidate data persistence (currently fragmented across steps)     | 4 hours |
| 2.4  | Wire Step 7 "Create Fund" button to actual API submission            | 4 hours |
| 2.5  | E2E test: full wizard flow from Step 1 through fund creation         | 4 hours |

**Why second:** Without a working wizard, no new funds can be created. This is
the core CRUD operation for the platform.

**Agents:** `waterfall-specialist` (if allocation steps involved)

---

## Priority 3: Monte Carlo Frontend

**Goal:** Expose the existing Monte Carlo backtesting API (5 endpoints, 47
tests) through a usable UI.

| Task | Description                                                                | Effort  |
| ---- | -------------------------------------------------------------------------- | ------- |
| 3.1  | Design Monte Carlo dashboard page (simulation config + results)            | 4 hours |
| 3.2  | Simulation runner component (parameter inputs, run button, progress)       | 6 hours |
| 3.3  | Results visualization (distribution charts, percentile bands, calibration) | 8 hours |
| 3.4  | Historical scenario comparison view                                        | 4 hours |
| 3.5  | Wire to existing backtesting API endpoints                                 | 4 hours |

**Why third:** Backend is complete and tested. High value for GPs (scenario
planning is the platform's differentiator). Frontend is the only blocker.

**Agents:** `phoenix-probabilistic-engineer`, `phoenix-brand-reporting`

---

## Priority 4: Pipeline UI Polish

**Goal:** Harden the pipeline management features on the current branch.

| Task | Description                                                    | Effort  |
| ---- | -------------------------------------------------------------- | ------- |
| 4.1  | AddDealModal: form validation, error states, success feedback  | 4 hours |
| 4.2  | ImportDealsModal: error recovery, duplicate detection, preview | 4 hours |
| 4.3  | DealCard: status transitions, drag-and-drop pipeline stages    | 6 hours |
| 4.4  | Pipeline page: filtering, sorting, search, bulk operations     | 6 hours |
| 4.5  | Pipeline E2E tests                                             | 4 hours |

**Why fourth:** Pipeline components exist but need production hardening. Lower
priority than financial accuracy and wizard completion.

---

## Priority 5: Tech Debt Reduction

**Goal:** Reduce accumulated debt to maintain velocity.

| Task | Description                                                    | Effort  |
| ---- | -------------------------------------------------------------- | ------- |
| 5.1  | Migrate 8 deprecated flags to unified system (Epic G followup) | 4 hours |
| 5.2  | Triage 213 quarantined tests: fix or delete                    | 8 hours |
| 5.3  | Reduce no-console warnings (475 -> target <100)                | 4 hours |
| 5.4  | TypeScript baseline reduction (eliminate suppressions)         | 4 hours |

**Why last:** Important but not blocking user-facing features.

---

## Parking Lot (Future Sprints)

These are planned but not prioritized for immediate execution:

| Feature                      | Prerequisite                          | Notes                                          |
| ---------------------------- | ------------------------------------- | ---------------------------------------------- |
| LP Portal Sprint 3           | Wizard completion, financial accuracy | Capital calls, distributions, dashboard        |
| Cohort Analysis V2           | 90% data coverage threshold           | Investment-level analysis gated by flag        |
| Phoenix Phase 2              | Phase 1A validated                    | Graduation modeling, MOIC analytics, scenarios |
| Font bundling (J.1)          | None                                  | Eliminates CDN dependency, nice-to-have        |
| XState persistence (ADR-016) | Wizard completion                     | Invoke pattern + automatic retry               |

---

## Execution Notes

- Each priority block is independent. Complete one before starting next.
- Use `/phoenix-truth` after any calculation changes.
- Use `/test-smart` for incremental test runs during development.
- Use `/pre-commit-check` before every commit.
- Consult Codex for architectural decisions within each block.
