---
last_updated: 2026-05-09
---

# Staleness Report

_Generated: 2026-05-09T17:00:17.120Z_ _Source: docs/DISCOVERY-MAP.source.yaml_

## Summary

| Metric              | Value |
| ------------------- | ----- |
| Total Documents     | 702   |
| Stale Documents     | 105   |
| Missing Frontmatter | 13    |

### By Status

| Status                  | Count |
| ----------------------- | ----- |
| ACTIVE                  | 490   |
| UNKNOWN                 | 124   |
| HISTORICAL              | 35    |
| DRAFT                   | 31    |
| VERIFIED                | 9     |
| ready                   | 3     |
| active                  | 2     |
| STALE-VALIDATION        | 1     |
| ARCHIVED                | 1     |
| HISTORICAL-SNAPSHOT     | 1     |
| ACCEPTED                | 1     |
| HISTORICAL-FRAMEWORK    | 1     |
| IMPLEMENTED             | 1     |
| TRACKED (not scheduled) | 1     |
| BACKLOG                 | 1     |

## Stale Documents

Documents that need review (older than their cadence threshold):

| Document                                                                     | Last Updated | Days Old | Has Execution Claims | Owner      |
| ---------------------------------------------------------------------------- | ------------ | -------- | -------------------- | ---------- |
| `.claude/skills/bias-audit/SKILL.md`                                         | Never        | 999      | No                   | Unassigned |
| `.claude/skills/control-plane/SKILL.md`                                      | Never        | 999      | No                   | Unassigned |
| `docs/CA-PACING-ORACLE.md`                                                   | Never        | 999      | No                   | Unassigned |
| `docs/claude/mcp-setup.md`                                                   | Never        | 999      | No                   | Unassigned |
| `docs/claude/operating-loop.md`                                              | Never        | 999      | No                   | Unassigned |
| `docs/lp-reporting/PHASE-1B-PLAN.md`                                         | Never        | 999      | No                   | Unassigned |
| `docs/phase2-calibration-benchmarks.md`                                      | Never        | 999      | No                   | Unassigned |
| `docs/plans/2026-04-03-phase-1a2-baseline-automation-hardening-validated.md` | Never        | 999      | No                   | Unassigned |
| `docs/plans/2026-04-06-phase-4-closeout.md`                                  | Never        | 999      | No                   | Unassigned |
| `docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md`           | Never        | 999      | No                   | Unassigned |
| `docs/plans/2026-05-08-gp-economics-extension-design.md`                     | Never        | 999      | No                   | Unassigned |
| `docs/session-learning-reports/2026-04-06.md`                                | Never        | 999      | No                   | Unassigned |
| `docs/session-learning-reports/2026-04-07.md`                                | Never        | 999      | YES - verify!        | Unassigned |
| `docs/skills/REFL-002-post-merge-jobs-not-validated-by-pr-ci.md`             | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-003-cross-platform-file-enumeration-fragility.md`          | Never        | 999      | YES - verify!        | Unassigned |
| `docs/skills/REFL-004-schema-format-backward-compatibility.md`               | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-005-stale-test-files-with-api-mismatch.md`                 | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-006-xirr-newton-raphson-divergence-on-extreme-returns.md`  | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-007-global-vi-mock-pollutes-all-tests.md`                  | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-008-typescript-type-inference-from-database-schemas.md`    | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-009-crlf-line-endings-break-frontmatter-parsing.md`        | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-010-trust-proxy-configuration-for-rate-limiters.md`        | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-012-fire-and-forget-async-creates-race-conditions.md`      | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-013-router-substring-matching-causes-false-positives.md`   | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-014-test-key-reuse-across-test-cases.md`                   | Never        | 999      | YES - verify!        | Unassigned |
| `docs/skills/REFL-015-postgresql-service-missing-test-database.md`           | Never        | 999      | YES - verify!        | Unassigned |
| `docs/skills/REFL-016-vitest-include-patterns-miss-new-test-directories.md`  | Never        | 999      | YES - verify!        | Unassigned |
| `docs/skills/REFL-017-ci-workflow-permission-errors.md`                      | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-019-k1-template-drops-data-footnotes.md`                   | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-022-prometheus-metrics-duplicate-registration.md`          | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-023-math-random-in-production-identifiers.md`              | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-027-redundant-any-on-inferred-callbacks.md`                | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-028-duck-type-context-access.md`                           | Never        | 999      | No                   | Unassigned |
| `docs/skills/REFL-029-secrets-in-workflow-if-expressions.md`                 | Never        | 999      | No                   | Unassigned |
| `docs/skills/SKILLS_INDEX.md`                                                | Never        | 999      | No                   | Unassigned |
| `docs/skills/WIZARD_INDEX.md`                                                | Never        | 999      | No                   | Unassigned |
| `docs/skills/template-refl.md`                                               | Never        | 999      | No                   | Unassigned |
| `.claude/skills/planning-with-files/CHANGELOG.md`                            | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/agent-architecture.md`                                          | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/agent-memory/database-expert-schema-tdd.md`                     | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/ai-code-review.md`                                              | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/anti-pattern-prevention.md`                                     | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/api.md`                                                         | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/baseline-governance.md`                                         | 2026-01-19   | 110      | YES - verify!        | Unassigned |
| `cheatsheets/capability-checklist.md`                                        | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/ci-validator-guide.md`                                          | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/claude-commands.md`                                             | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/claude-md-guidelines.md`                                        | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/codex-collaboration-protocol.md`                                | 2026-01-19   | 110      | No                   | Unassigned |
| `cheatsheets/coding-pairs-playbook.md`                                       | 2026-01-19   | 110      | No                   | Unassigned |

_...and 55 more stale documents._

## Documents with Execution Claims (Need Verification)

These documents contain phrases like "tests pass", "PR merged", etc. and should
be verified:

- [ ] **CHANGELOG.md** (34 days old)
- [ ] **cheatsheets/baseline-governance.md** (110 days old)
- [ ] **cheatsheets/emoji-free-documentation.md** (110 days old)
- [ ] **cheatsheets/schema-alignment.md** (110 days old)
- [ ] **docs/notebooklm-sources/reserves/01-overview.md** (110 days old)
- [ ] **docs/notebooklm-sources/waterfall.md** (110 days old)
- [ ] **docs/notebooklm-sources/xirr.md** (110 days old)
- [ ] **docs/observability/EDITORIAL-V2-CHANGELOG.md** (110 days old)
- [ ] **docs/session-learning-reports/2026-04-07.md** (999 days old)
- [ ] **docs/skills/REFL-003-cross-platform-file-enumeration-fragility.md** (999
      days old)
- [ ] **docs/skills/REFL-014-test-key-reuse-across-test-cases.md** (999 days
      old)
- [ ] **docs/skills/REFL-015-postgresql-service-missing-test-database.md** (999
      days old)
- [ ] **docs/skills/REFL-016-vitest-include-patterns-miss-new-test-directories.md**
      (999 days old)

## Missing Frontmatter

Documents without proper YAML frontmatter:

- [ ] `docs/CA-PACING-ORACLE.md`
- [ ] `docs/claude/mcp-setup.md`
- [ ] `docs/claude/operating-loop.md`
- [ ] `docs/lp-reporting/PHASE-1B-PLAN.md`
- [ ] `docs/phase2-calibration-benchmarks.md`
- [ ] `docs/plans/2026-04-03-phase-1a2-baseline-automation-hardening-validated.md`
- [ ] `docs/plans/2026-04-06-phase-4-closeout.md`
- [ ] `docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md`
- [ ] `docs/plans/2026-05-08-gp-economics-extension-design.md`
- [ ] `docs/session-learning-reports/2026-04-06.md`
- [ ] `docs/session-learning-reports/2026-04-07.md`
- [ ] `docs/skills/SKILLS_INDEX.md`
- [ ] `docs/skills/WIZARD_INDEX.md`

---

_To fix staleness: Update `last_updated` field in document frontmatter._ _To set
owner: Add `owner` field in document frontmatter._ _See:
docs/.templates/DOC-FRONTMATTER-SCHEMA.md for schema details._
