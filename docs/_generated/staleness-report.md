# Staleness Report

_Generated: 2026-03-27T17:40:38.398Z_ _Source: docs/DISCOVERY-MAP.source.yaml_

## Summary

| Metric              | Value |
| ------------------- | ----- |
| Total Documents     | 899   |
| Stale Documents     | 224   |
| Missing Frontmatter | 101   |

### By Status

| Status           | Count |
| ---------------- | ----- | ---------- | --- |
| ACTIVE           | 578   |
| UNKNOWN          | 180   |
| HISTORICAL       | 97    |
| DRAFT            | 18    |
| VERIFIED         | 9     |
| PROPOSED         | 5     |
| DRAFT # VERIFIED | DRAFT | DEPRECATED | 4   |
| ready            | 3     |
| active           | 2     |
| ARCHIVED         | 1     |
| APPROVED         | 1     |
| ACCEPTED         | 1     |

## Stale Documents

Documents that need review (older than their cadence threshold):

| Document                                               | Last Updated | Days Old | Has Execution Claims | Owner      |
| ------------------------------------------------------ | ------------ | -------- | -------------------- | ---------- |
| `.claude/agents/baseline-regression-explainer.md`      | Never        | 999      | No                   | Unassigned |
| `.claude/agents/chaos-engineer.md`                     | Never        | 999      | No                   | Unassigned |
| `.claude/agents/code-explorer.md`                      | Never        | 999      | No                   | Unassigned |
| `.claude/agents/code-reviewer.md`                      | Never        | 999      | No                   | Unassigned |
| `.claude/agents/code-simplifier.md`                    | Never        | 999      | No                   | Unassigned |
| `.claude/agents/comment-analyzer.md`                   | Never        | 999      | No                   | Unassigned |
| `.claude/agents/context-orchestrator.md`               | Never        | 999      | No                   | Unassigned |
| `.claude/agents/database-expert.md`                    | Never        | 999      | No                   | Unassigned |
| `.claude/agents/db-migration.md`                       | Never        | 999      | No                   | Unassigned |
| `.claude/agents/debug-expert.md`                       | Never        | 999      | No                   | Unassigned |
| `.claude/agents/devops-troubleshooter.md`              | Never        | 999      | No                   | Unassigned |
| `.claude/agents/docs-architect.md`                     | Never        | 999      | No                   | Unassigned |
| `.claude/agents/dx-optimizer.md`                       | Never        | 999      | No                   | Unassigned |
| `.claude/agents/general-purpose.md`                    | Never        | 999      | No                   | Unassigned |
| `.claude/agents/incident-responder.md`                 | Never        | 999      | No                   | Unassigned |
| `.claude/agents/legacy-modernizer.md`                  | Never        | 999      | No                   | Unassigned |
| `.claude/agents/parity-auditor.md`                     | Never        | 999      | No                   | Unassigned |
| `.claude/agents/perf-guard.md`                         | Never        | 999      | No                   | Unassigned |
| `.claude/agents/perf-regression-triager.md`            | Never        | 999      | No                   | Unassigned |
| `.claude/agents/phoenix-brand-reporting-stylist.md`    | Never        | 999      | No                   | Unassigned |
| `.claude/agents/phoenix-capital-allocation-analyst.md` | Never        | 999      | No                   | Unassigned |
| `.claude/agents/phoenix-docs-scribe.md`                | Never        | 999      | No                   | Unassigned |
| `.claude/agents/phoenix-precision-guardian.md`         | Never        | 999      | YES - verify!        | Unassigned |
| `.claude/agents/phoenix-probabilistic-engineer.md`     | Never        | 999      | No                   | Unassigned |
| `.claude/agents/phoenix-reserves-optimizer.md`         | Never        | 999      | No                   | Unassigned |
| `.claude/agents/phoenix-truth-case-runner.md`          | Never        | 999      | No                   | Unassigned |
| `.claude/agents/playwright-test-author.md`             | Never        | 999      | No                   | Unassigned |
| `.claude/agents/pr-test-analyzer.md`                   | Never        | 999      | No                   | Unassigned |
| `.claude/agents/schema-drift-checker.md`               | Never        | 999      | No                   | Unassigned |
| `.claude/agents/silent-failure-hunter.md`              | Never        | 999      | No                   | Unassigned |
| `.claude/agents/test-automator.md`                     | Never        | 999      | No                   | Unassigned |
| `.claude/agents/test-repair.md`                        | Never        | 999      | No                   | Unassigned |
| `.claude/agents/test-scaffolder.md`                    | Never        | 999      | No                   | Unassigned |
| `.claude/agents/type-design-analyzer.md`               | Never        | 999      | No                   | Unassigned |
| `.claude/agents/waterfall-specialist.md`               | Never        | 999      | No                   | Unassigned |
| `.claude/agents/workflow-orchestrator.md`              | Never        | 999      | YES - verify!        | Unassigned |
| `.claude/agents/xirr-fees-validator.md`                | Never        | 999      | No                   | Unassigned |
| `.claude/commands/catalog-tooling.md`                  | Never        | 999      | No                   | Unassigned |
| `.claude/commands/db-validate.md`                      | Never        | 999      | No                   | Unassigned |
| `.claude/commands/deploy-check.md`                     | Never        | 999      | YES - verify!        | Unassigned |
| `.claude/commands/enable-agent-memory.md`              | Never        | 999      | No                   | Unassigned |
| `.claude/commands/fix-auto.md`                         | Never        | 999      | YES - verify!        | Unassigned |
| `.claude/commands/log-change.md`                       | Never        | 999      | No                   | Unassigned |
| `.claude/commands/log-decision.md`                     | Never        | 999      | No                   | Unassigned |
| `.claude/commands/phoenix-phase2.md`                   | Never        | 999      | No                   | Unassigned |
| `.claude/commands/phoenix-prob-report.md`              | Never        | 999      | No                   | Unassigned |
| `.claude/commands/phoenix-truth.md`                    | Never        | 999      | No                   | Unassigned |
| `.claude/commands/pr-ready.md`                         | Never        | 999      | YES - verify!        | Unassigned |
| `.claude/commands/pre-commit-check.md`                 | Never        | 999      | YES - verify!        | Unassigned |
| `.claude/commands/session-start.md`                    | Never        | 999      | No                   | Unassigned |

_...and 174 more stale documents._

## Documents with Execution Claims (Need Verification)

These documents contain phrases like "tests pass", "PR merged", etc. and should
be verified:

- [ ] **.claude/agents/phoenix-precision-guardian.md** (999 days old)
- [ ] **.claude/agents/workflow-orchestrator.md** (999 days old)
- [ ] **.claude/commands/deploy-check.md** (999 days old)
- [ ] **.claude/commands/fix-auto.md** (999 days old)
- [ ] **.claude/commands/pr-ready.md** (999 days old)
- [ ] **.claude/commands/pre-commit-check.md** (999 days old)
- [ ] **.claude/commands/workflows.md** (999 days old)
- [ ] **.claude/memory/sessions/2026-02-13-priority-planning.md** (999 days old)
- [ ] **.claude/memory/sessions/2026-02-14-pdf-complexity-refactor.md** (999
      days old)
- [ ] **.claude/memory/sessions/2026-02-15-cc-reduction-batch2.md** (999 days
      old)
- [ ] **.claude/memory/sessions/2026-02-15-p2-completion.md** (999 days old)
- [ ] **.claude/memory/sessions/2026-02-15-pr3-store-migration.md** (999 days
      old)
- [ ] **.claude/memory/sessions/2026-02-16-complexity-refactor.md** (999 days
      old)
- [ ] **.claude/memory/sessions/2026-02-16-p3-monte-carlo-frontend.md** (999
      days old)
- [ ] **.claude/memory/sessions/2026-02-18-xirr-fix-rename.md** (999 days old)
- [ ] **.claude/memory/sessions/2026-02-21-forbidden-tokens-remediation.md**
      (999 days old)
- [ ] **.claude/memory/sessions/2026-02-22-phase2-validation.md** (999 days old)
- [ ] **.claude/memory/sessions/2026-02-24-phoenix-validation-closure.md** (999
      days old)
- [ ] **.claude/memory/sessions/2026-03-18-8pr-plan-execution.md** (999 days
      old)
- [ ] **.claude/memory/sessions/2026-03-18-session-cleanup.md** (999 days old)
- [ ] **.claude/memory/sessions/2026-03-23-phase3c-track-a.md** (999 days old)
- [ ] **.claude/plans/p3-phase6-tests.md** (999 days old)
- [ ] **.claude/plans/p4.5-plan.md** (999 days old)
- [ ] **.claude/plans/p5-findings.md** (999 days old)
- [ ] **.claude/plans/p5-plan.md** (999 days old)
- [ ] **.claude/plans/pr3-capital-structure-store-migration.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase3-continuation-v6.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase3-continuation-v9.md** (999 days old)
- [ ] **.claude/skills/refactor-code/SKILL.md** (999 days old)
- [ ] **docs/observability/EDITORIAL-V2-CHANGELOG.md** (67 days old)
- [ ] **docs/plans/2026-03-22-phase-4-implementation-spec.md** (999 days old)
- [ ] **docs/session-learning-reports/2026-01-20-hook-fix.md** (999 days old)
- [ ] **docs/session-learning-reports/2026-02-14-p1-financial-accuracy.md** (999
      days old)
- [ ] **docs/session-learning-reports/2026-02-18.md** (999 days old)
- [ ] **docs/skills/REFL-003-cross-platform-file-enumeration-fragility.md** (999
      days old)
- [ ] **docs/skills/REFL-014-test-key-reuse-across-test-cases.md** (999 days
      old)
- [ ] **docs/skills/REFL-015-postgresql-service-missing-test-database.md** (999
      days old)
- [ ] **docs/skills/REFL-024-integration-test-environment-leakage.md** (999 days
      old)

## Missing Frontmatter

Documents without proper YAML frontmatter:

- [ ] `.claude/complexity-checkpoint.md`
- [ ] `.claude/discovery.md`
- [ ] `.claude/memory/active-context.md`
- [ ] `.claude/memory/progress.md`
- [ ] `.claude/memory/sessions/2026-02-13-priority-planning.md`
- [ ] `.claude/memory/sessions/2026-02-14-p1-financial-accuracy.md`
- [ ] `.claude/memory/sessions/2026-02-14-pdf-complexity-refactor.md`
- [ ] `.claude/memory/sessions/2026-02-15-cc-reduction-batch2.md`
- [ ] `.claude/memory/sessions/2026-02-15-p2-completion.md`
- [ ] `.claude/memory/sessions/2026-02-15-p2-wizard-reliability.md`
- [ ] `.claude/memory/sessions/2026-02-15-pr3-store-migration.md`
- [ ] `.claude/memory/sessions/2026-02-16-complexity-refactor.md`
- [ ] `.claude/memory/sessions/2026-02-16-p3-monte-carlo-frontend.md`
- [ ] `.claude/memory/sessions/2026-02-16-p3-phase6-tests.md`
- [ ] `.claude/memory/sessions/2026-02-16-p4-implementation.md`
- [ ] `.claude/memory/sessions/2026-02-16-p4-planning.md`
- [ ] `.claude/memory/sessions/2026-02-16-p4.5-dnd.md`
- [ ] `.claude/memory/sessions/2026-02-18-ci-gate-diagnosis.md`
- [ ] `.claude/memory/sessions/2026-02-18-p5-completion.md`
- [ ] `.claude/memory/sessions/2026-02-18-p5-debt-reduction.md`
- [ ] `.claude/memory/sessions/2026-02-18-xirr-fix-rename.md`
- [ ] `.claude/memory/sessions/2026-02-20-ci-recovery-pr522-session2.md`
- [ ] `.claude/memory/sessions/2026-02-20-ci-recovery-pr522.md`
- [ ] `.claude/memory/sessions/2026-02-20-tech-debt-batch-refactor.md`
- [ ] `.claude/memory/sessions/2026-02-21-forbidden-tokens-remediation.md`
- [ ] `.claude/memory/sessions/2026-02-21-server-infra-remediation-plan.md`
- [ ] `.claude/memory/sessions/2026-02-21-server-infra-remediation.md`
- [ ] `.claude/memory/sessions/2026-02-22-phase2-validation.md`
- [ ] `.claude/memory/sessions/2026-02-24-phoenix-validation-closure.md`
- [ ] `.claude/memory/sessions/2026-03-16-babysitter-project-install.md`
- [ ] `.claude/memory/sessions/2026-03-16-tech-debt-process-planning.md`
- [ ] `.claude/memory/sessions/2026-03-18-8pr-commit-push.md`
- [ ] `.claude/memory/sessions/2026-03-18-8pr-plan-execution.md`
- [ ] `.claude/memory/sessions/2026-03-18-eslint-wave0-harness.md`
- [ ] `.claude/memory/sessions/2026-03-18-session-cleanup.md`
- [ ] `.claude/memory/sessions/2026-03-19-eslint-wave1a-partial.md`
- [ ] `.claude/memory/sessions/2026-03-20-phase-0b-cutover.md`
- [ ] `.claude/memory/sessions/2026-03-23-phase3c-track-a.md`
- [ ] `.claude/planning/findings.md`
- [ ] `.claude/planning/progress.md`
- [ ] `.claude/planning/task_plan.md`
- [ ] `.claude/plans/ci-workflow-cleanup.md`
- [ ] `.claude/plans/p2-refined-plan.md`
- [ ] `.claude/plans/p3-phase6-tests.md`
- [ ] `.claude/plans/p4-final-plan.md`
- [ ] `.claude/plans/p4-review-findings.md`
- [ ] `.claude/plans/p4.5-findings.md`
- [ ] `.claude/plans/p4.5-plan.md`
- [ ] `.claude/plans/p4.5-progress.md`
- [ ] `.claude/plans/p5-findings.md`
- [ ] `.claude/plans/p5-plan.md`
- [ ] `.claude/plans/p5-progress.md`
- [ ] `.claude/plans/pr3-capital-structure-store-migration.md`
- [ ] `.claude/session-context.md`
- [ ] `.claude/skills/INDEX.md`
- [ ] `.claude/skills/code-reviewer/references/api_reference.md`
- [ ] `.claude/skills/code-reviewer/references/javascript_patterns.md`
- [ ] `.claude/skills/code-reviewer/references/python_patterns.md`
- [ ] `.claude/skills/code-reviewer/references/review_workflow.md`
- [ ] `.claude/skills/owasp-security/SKILL.md`
- [ ] `docs/CA-PACING-ORACLE.md`
- [ ] `docs/PHOENIX-SOT/evidence-ledger.md`
- [ ] `docs/PHOENIX-SOT/scope-boundary-map.md`
- [ ] `docs/decisions/adr-runtime-authority.md`
- [ ] `docs/evidence/endpoint-ownership.md`
- [ ] `docs/financial-precision.md`
- [ ] `docs/phase2-calibration-benchmarks.md`
- [ ] `docs/planning/gp-modernization/00-ITERATION-LOG.md`
- [ ] `docs/planning/phase2-execution/00-ITERATION-LOG.md`
- [ ] `docs/planning/phase2-execution/01-gate0-validation.md`
- [ ] `docs/planning/phase2-execution/02-epic-g-architecture.md`
- [ ] `docs/planning/phase2-execution/03-epic-h-test-strategy.md`
- [ ] `docs/planning/phase2-execution/04-epic-i-wizard-audit.md`
- [ ] `docs/planning/phase2-execution/05-epic-j-reporting-audit.md`
- [ ] `docs/plans/2026-01-20-hook-fix/findings.md`
- [ ] `docs/plans/2026-01-20-hook-fix/progress.md`
- [ ] `docs/plans/2026-01-20-hook-fix/task_plan.md`
- [ ] `docs/plans/2026-02-13-priority-planning/findings.md`
- [ ] `docs/plans/2026-02-13-priority-planning/progress.md`
- [ ] `docs/plans/2026-02-13-priority-planning/task_plan.md`
- [ ] `docs/plans/2026-03-20-concurrent-beaming-pine-revised.md`
- [ ] `docs/plans/2026-03-20-phase-0b-execution-spec.md`
- [ ] `docs/plans/2026-03-20-phase-0b-revised-counterproposal.md`
- [ ] `docs/plans/2026-03-21-phase-2b-execution-spec.md`
- [ ] `docs/plans/2026-03-22-phase-3-results-execution-spec.md`
- [ ] `docs/plans/2026-03-22-phase-3-review.md`
- [ ] `docs/plans/2026-03-22-phase-3c-implementation-plan.md`
- [ ] `docs/plans/2026-03-22-phase-4-implementation-spec.md`
- [ ] `docs/plans/2026-03-26-entropy-reduction-integrated.md`
- [ ] `docs/plans/2026-03-26-entropy-reduction/findings.md`
- [ ] `docs/plans/2026-03-26-entropy-reduction/progress.md`
- [ ] `docs/plans/2026-03-26-entropy-reduction/task_plan.md`
- [ ] `docs/plans/p5-debt-baseline-2026-02-17.md`
- [ ] `docs/qa-response-2026-01-23.md`
- [ ] `docs/queue-observability.md`
- [ ] `docs/session-learning-reports/2026-01-20-hook-fix.md`
- [ ] `docs/session-learning-reports/2026-02-14-p1-financial-accuracy.md`
- [ ] `docs/session-learning-reports/2026-02-18.md`
- [ ] `docs/session-learning-reports/2026-03-17.md`
- [ ] `docs/skills/SKILLS_INDEX.md`
- [ ] `docs/skills/WIZARD_INDEX.md`

---

_To fix staleness: Update `last_updated` field in document frontmatter._ _To set
owner: Add `owner` field in document frontmatter._ _See:
docs/.templates/DOC-FRONTMATTER-SCHEMA.md for schema details._
