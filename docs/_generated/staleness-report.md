# Staleness Report

_Generated: 2026-01-07T00:59:50.436Z_ _Source: docs/DISCOVERY-MAP.source.yaml_

## Summary

| Metric              | Value |
| ------------------- | ----- |
| Total Documents     | 730   |
| Stale Documents     | 715   |
| Missing Frontmatter | 643   |

### By Status

| Status  | Count |
| ------- | ----- |
| UNKNOWN | 711   |
| ACTIVE  | 14    |
| ready   | 3     |
| active  | 2     |

## Stale Documents

Documents that need review (older than their cadence threshold):

| Document                                               | Last Updated | Days Old | Has Execution Claims | Owner      |
| ------------------------------------------------------ | ------------ | -------- | -------------------- | ---------- |
| `.agents-feedback.md`                                  | Never        | 999      | No                   | Unassigned |
| `.agents-metrics.md`                                   | Never        | 999      | No                   | Unassigned |
| `.claude/ANTI-DRIFT-CHECKLIST.md`                      | Never        | 999      | YES - verify!        | Unassigned |
| `.claude/DELIVERY-SUMMARY.md`                          | Never        | 999      | No                   | Unassigned |
| `.claude/PHOENIX-TOOL-ROUTING.md`                      | Never        | 999      | No                   | Unassigned |
| `.claude/PROJECT-UNDERSTANDING.md`                     | Never        | 999      | No                   | Unassigned |
| `.claude/WORKFLOW.md`                                  | Never        | 999      | No                   | Unassigned |
| `.claude/agents/PHOENIX-AGENTS.md`                     | Never        | 999      | No                   | Unassigned |
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
| `.claude/commands/evaluate-tools.md`                   | Never        | 999      | No                   | Unassigned |

_...and 665 more stale documents._

## Documents with Execution Claims (Need Verification)

These documents contain phrases like "tests pass", "PR merged", etc. and should
be verified:

- [ ] **.claude/ANTI-DRIFT-CHECKLIST.md** (999 days old)
- [ ] **.claude/agents/phoenix-precision-guardian.md** (999 days old)
- [ ] **.claude/agents/workflow-orchestrator.md** (999 days old)
- [ ] **.claude/commands/deploy-check.md** (999 days old)
- [ ] **.claude/commands/fix-auto.md** (999 days old)
- [ ] **.claude/commands/pr-ready.md** (999 days old)
- [ ] **.claude/commands/pre-commit-check.md** (999 days old)
- [ ] **.claude/commands/workflows.md** (999 days old)
- [ ] **.claude/commands/wshobson/deps-audit.md** (999 days old)
- [ ] **.claude/integration-test-execution-summary.md** (999 days old)
- [ ] **.claude/integration-test-final-report.md** (999 days old)
- [ ] **.claude/integration-test-reenable-plan-v2.md** (999 days old)
- [ ] **.claude/plans/2025-12-30-sprint2-quality-improvements.md** (999 days
      old)
- [ ] **.claude/prompts/integration-test-continuation-prompt.md** (999 days old)
- [ ] **.claude/prompts/portfolio-intelligence-timeout-fix.md** (999 days old)
- [ ] **.claude/prompts/week2.5-next-session-kickoff.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase3-continuation-v10.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase3-continuation-v2.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase3-continuation-v3.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase3-continuation-v6.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase3-continuation-v9.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase3-continuation.md** (999 days old)
- [ ] **.claude/prompts/week2.5-phase4-next-steps.md** (999 days old)
- [ ] **.claude/session-summary-portfolio-intelligence-implementation.md** (999
      days old)
- [ ] **.claude/sessions/PHASE4-CONTINUATION-KICKOFF.md** (999 days old)
- [ ] **.claude/skills/README.md** (999 days old)
- [ ] **.claude/skills/dispatching-parallel-agents.md** (999 days old)
- [ ] **.claude/skills/iterative-improvement.md** (999 days old)
- [ ] **.claude/skills/task-decomposition.md** (999 days old)
- [ ] **.claude/testing/HANDOFF-MEMO-v2.md** (999 days old)
- [ ] **.claude/testing/HANDOFF-MEMO.md** (999 days old)
- [ ] **.claude/testing/rubric-calculation-engines.md** (999 days old)
- [ ] **.claude/testing/scenario-comparison-manual-test-rubric.md** (999 days
      old)
- [ ] **.claude/testing/seed-script-remaining-fixes.md** (999 days old)
- [ ] **.claude/testing/test-baseline-report-2025-12-23.md** (999 days old)
- [ ] **.claude/testing/week2-execution-report.md** (999 days old)
- [ ] **ANTI_PATTERNS.md** (999 days old)
- [ ] **BUG-FIX-SUMMARY-FEES-EXPENSES-2025-11-30.md** (999 days old)
- [ ] **CHANGELOG.md** (999 days old)
- [ ] **COMPREHENSIVE-WORKFLOW-GUIDE.md** (999 days old)
- [ ] **DECISIONS.md** (999 days old)
- [ ] **HANDOFF-MEMO-2025-10-30.md** (999 days old)
- [ ] **HANDOFF-MEMO-SCHEMA-TDD-PHASE1-COMPLETE.md** (999 days old)
- [ ] **HANDOFF-PORTFOLIO-PHASE0-COMPLETE.md** (999 days old)
- [ ] **IMPLEMENTATION_SYNTHESIS.md** (999 days old)
- [ ] **ITERATION-A-QUICKSTART.md** (999 days old)
- [ ] **JSDOM-FIX-SUMMARY-2025-12-01.md** (999 days old)
- [ ] **KICKOFF-SKILLS-APPLICATION.md** (999 days old)
- [ ] **MERGE_RISK_ANALYSIS.md** (999 days old)
- [ ] **MIGRATION-NATIVE-MEMORY.md** (999 days old)
- [ ] **NEXT_ACTIONS.md** (999 days old)
- [ ] **NEXT_STEPS_CHECKLIST.md** (999 days old)
- [ ] **PHASE-0A-MIDDLEWARE-PLAN.md** (999 days old)
- [ ] **PHASE0-FEATURE-FLAG-DEPLOYMENT-PLAN.md** (999 days old)
- [ ] **PHASE0B-SERVICE-ARCHITECTURE-REVIEW.md** (999 days old)
- [ ] **PHASE3-KICKOFF-CHECKLIST.md** (999 days old)
- [ ] **PORTFOLIO-API-STRATEGY-UPDATED.md** (999 days old)
- [ ] **PORTFOLIO-SCHEMA-MIGRATION-ANALYSIS.md** (999 days old)
- [ ] **PRODUCTION_RUNBOOK.md** (999 days old)
- [ ] **PROMPT_PATTERNS.md** (999 days old)
- [ ] **QA-RESULTS-FEES-EXPENSES-STEP-2025-12-01.md** (999 days old)
- [ ] **QUARANTINE_TEST_ANALYSIS.md** (999 days old)
- [ ] **SCENARIO-1-WATERFALL-BUG-FIX-SUMMARY.md** (999 days old)
- [ ] **SESSION-HANDOFF-2025-11-17-PHASE0A-ACTUAL-STATUS.md** (999 days old)
- [ ] **SESSION-HANDOFF-2025-11-17-PHASE0A-REVIEW.md** (999 days old)
- [ ] **SESSION-HANDOFF-PHASE0-PORTFOLIO-2025-11-10.md** (999 days old)
- [ ] **SESSION-HANDOFF-PORTFOLIO-PARALLEL-2025-11-10.md** (999 days old)
- [ ] **UX_INTEGRATION_CONSENSUS.md** (999 days old)
- [ ] **cheatsheets/baseline-governance.md** (999 days old)
- [ ] **cheatsheets/daily-workflow.md** (999 days old)
- [ ] **cheatsheets/emoji-free-documentation.md** (999 days old)
- [ ] **cheatsheets/pr-merge-verification.md** (999 days old)
- [ ] **cheatsheets/schema-alignment.md** (999 days old)
- [ ] **docs/ARCHITECTURAL-DEBT.md** (999 days old)
- [ ] **docs/CA-IMPLEMENTATION-PLAN.md** (999 days old)
- [ ] **docs/CA-SEMANTIC-LOCK.md** (999 days old)
- [ ] **docs/CLEANUP_PR_TEMPLATE.md** (999 days old)
- [ ] **docs/CONSOLIDATION_LEARNINGS.md** (999 days old)
- [ ] **docs/DECISIONS.md** (999 days old)
- [ ] **docs/DEPLOYMENT.md** (999 days old)
- [ ] **docs/DEVELOPMENT_STRATEGY.md** (999 days old)
- [ ] **docs/Handoff-Memo-Phase-1-Validation.md** (999 days old)
- [ ] **docs/INFRASTRUCTURE_REMEDIATION.md** (999 days old)
- [ ] **docs/INTEGRATION_PR_CHECKLIST.md** (999 days old)
- [ ] **docs/MILESTONE-XIRR-PHASE0-COMPLETE.md** (999 days old)
- [ ] **docs/PHASE-1D-CHECKPOINT.md** (999 days old)
- [ ] **docs/PHASE-1D-STATUS.md** (999 days old)
- [ ] **docs/PRODUCTION_CHECKLIST.md** (999 days old)
- [ ] **docs/PR_DESCRIPTION.md** (999 days old)
- [ ] **docs/PR_INTEGRATION_PLAN.md** (999 days old)
- [ ] **docs/RATE_LIMITING_SUMMARY.md** (999 days old)
- [ ] **docs/SCENARIO_DEPLOY_GUIDE.md** (999 days old)
- [ ] **docs/VERIFICATION_CHECKLIST.md** (999 days old)
- [ ] **docs/WEEK1_VALIDATION_HANDOFF_MEMO.md** (999 days old)
- [ ] **docs/action-plans/CODEX-FIXES-EXECUTION-SUMMARY.md** (999 days old)
- [ ] **docs/action-plans/CODEX-ISSUES-RESOLUTION-PLAN.md** (999 days old)
- [ ] **docs/adr/ADR-004-waterfall-names.md** (999 days old)
- [ ] **docs/adr/ADR-005-xirr-excel-parity.md** (999 days old)
- [ ] **docs/adr/ADR-008-capital-allocation-policy.md** (999 days old)
- [ ] **docs/agent-2-mobile-executive-dashboard.md** (999 days old)
- [ ] **docs/ai-optimization/AI_AGENT_BACKTEST_FRAMEWORK.md** (999 days old)
- [ ] **docs/api/architecture/portfolio-route-api.md** (999 days old)
- [ ] **docs/api/testing/portfolio-route-test-strategy.md** (999 days old)
- [ ] **docs/behavioral-specs/time-travel-analytics-service-specs.md** (999 days
      old)
- [ ] **docs/chaos-engineering/README.md** (999 days old)
- [ ] **docs/chaos-engineering/RLS-CHAOS-TESTING-PLAN.md** (999 days old)
- [ ] **docs/chart-migration-decision.md** (999 days old)
- [ ] **docs/deployment/CODEX-FIXES-DEPLOYMENT-STATUS.md** (999 days old)
- [ ] **docs/deployment/ROLLBACK_PLAN.md** (999 days old)
- [ ] **docs/deployment/STAGING_CHECKLIST.md** (999 days old)
- [ ] **docs/deployment/STAGING_DEPLOYMENT_SUMMARY.md** (999 days old)
- [ ] **docs/deployment/STAGING_METRICS.md** (999 days old)
- [ ] **docs/failure-triage.md** (999 days old)
- [ ] **docs/forecasting/power-law-implementation.md** (999 days old)
- [ ] **docs/foundation/PHASE2-ROADMAP-IMPROVEMENTS.md** (999 days old)
- [ ] **docs/foundation/PHASE2-ROADMAP.md** (999 days old)
- [ ] **docs/foundation/PHASE3-KICKOFF.md** (999 days old)
- [ ] **docs/foundation/PHASE4-KICKOFF.md** (999 days old)
- [ ] **docs/integration/upstash-setup.md** (999 days old)
- [ ] **docs/notebooklm-sources/reserves/01-overview.md** (999 days old)
- [ ] **docs/notebooklm-sources/waterfall.md** (999 days old)
- [ ] **docs/notebooklm-sources/xirr.md** (999 days old)
- [ ] **docs/npm-bin-resolution-investigation.md** (999 days old)
- [ ] **docs/observability/EDITORIAL-V2-CHANGELOG.md** (999 days old)
- [ ] **docs/observability/README.md** (999 days old)
- [ ] **docs/observability/archive/2025-10-06/pr-113-auth-comment-v1.md** (999
      days old)
- [ ] **docs/observability/archive/2025-10-06/pr-113-split-instructions-v1.md**
      (999 days old)
- [ ] **docs/observability/archive/2025-10-06/pr-113-summary-v1.md** (999 days
      old)
- [ ] **docs/phase0-validation-report.md** (999 days old)
- [ ] **docs/phase0-xirr-analysis-eda20590.md** (999 days old)
- [ ] **docs/phase1-1-1-analysis.md** (999 days old)
- [ ] **docs/phase1-implementation-summary.md** (999 days old)
- [ ] **docs/phase1-next-session-handoff.md** (999 days old)
- [ ] **docs/phase1-xirr-baseline-heatmap.md** (999 days old)
- [ ] **docs/phase1b-waterfall-evaluator-hardening.md** (999 days old)
- [ ] **docs/phase2 docs/CHECKLIST-Phase2.md** (999 days old)
- [ ] **docs/phase2 docs/STRATEGY-Phase2-CapitalAllocation.md** (999 days old)
- [ ] **docs/plans/2025-12-28-backend-testing-improvements.md** (999 days old)
- [ ] **docs/plans/2025-12-29-phase2-planning-REVIEW.md** (999 days old)
- [ ] **docs/plans/2025-12-29-phase2-planning.md** (999 days old)
- [ ] **docs/plans/2025-12-29-phase3c-solo-execution.md** (999 days old)
- [ ] **docs/plans/2025-12-29-phoenix-phases-1.4-1.7-completion.md** (999 days
      old)
- [ ] **docs/plans/2025-12-29-pr-318-merge-validation-plan.md** (999 days old)
- [ ] **docs/plans/2026-01-04-phase1-implementation-plan.md** (999 days old)
- [ ] **docs/plans/2026-01-04-portfolio-optimization-design.md** (999 days old)
- [ ] **docs/plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md** (999 days old)
- [ ] **docs/plans/FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md** (999 days old)
- [ ] **docs/plans/FOUNDATION-HARDENING-STRATEGY.md** (999 days old)
- [ ] **docs/plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md** (999 days
      old)
- [ ] **docs/plans/PHASE3-SESSION2-KICKOFF.md** (999 days old)
- [ ] **docs/plans/PHASE3-SESSION3-KICKOFF.md** (999 days old)
- [ ] **docs/plans/PHASE3-SESSION4-KICKOFF.md** (999 days old)
- [ ] **docs/plans/PHASE3-SESSION5-KICKOFF.md** (999 days old)
- [ ] **docs/plans/WEEK2.5-FOUNDATION-HARDENING-KICKOFF.md** (999 days old)
- [ ] **docs/plans/WEEK2.5-PHASE2-AGENT-STRATEGY.md** (999 days old)
- [ ] **docs/plans/WEEK2.5-PHASE2-COMPLETE-GUIDE.md** (999 days old)
- [ ] **docs/plans/WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md** (999 days old)
- [ ] **docs/plans/WEEK2.5-PHASE2-SUCCESS.md** (999 days old)
- [ ] **docs/plans/WEEK2.5-PHASE3-PR-SUMMARY.md** (999 days old)
- [ ] **docs/plans/xstate-persistence-implementation.md** (999 days old)
- [ ] **docs/processes/CONTRIBUTING.md** (999 days old)
- [ ] **docs/processes/code-review-checklist.md** (999 days old)
- [ ] **docs/references/claude-agent-testing.md** (999 days old)
- [ ] **docs/references/replit.md** (999 days old)
- [ ] **docs/releases/stage-norm-phase5.md** (999 days old)
- [ ] **docs/releases/stage-normalization-v3.4.md** (999 days old)
- [ ] **docs/replit.md** (999 days old)
- [ ] **docs/reviews/CA-IMPLEMENTATION-EVALUATION-FINAL.md** (999 days old)
- [ ] **docs/runbooks/synthetics-debug.md** (999 days old)
- [ ] **docs/schemas/schema-mapping.md** (999 days old)
- [ ] **docs/skills-application-log.md** (999 days old)
- [ ] **docs/sprint-g2c-backlog.md** (999 days old)
- [ ] **docs/staging/phase2.1/cluster-b-stage-validation-prep.md** (999 days
      old)
- [ ] **docs/staging/phase2.1/cluster-c-APPLY-PATCHES.md** (999 days old)
- [ ] **docs/staging/phase2.1/cluster-c-batch-gate-results.md** (999 days old)
- [ ] **docs/staging/phase2.1/cluster-c-modeling-wizard-prep.md** (999 days old)
- [ ] **docs/staging/phase2.1/seams/redis-webhook-contract.md** (999 days old)
- [ ] **docs/xirr-excel-validation.md** (999 days old)
- [ ] **triage-interleaved-thinking-failures.md** (999 days old)

## Missing Frontmatter

Documents without proper YAML frontmatter:

- [ ] `.agents-feedback.md`
- [ ] `.agents-metrics.md`
- [ ] `.claude/ANTI-DRIFT-CHECKLIST.md`
- [ ] `.claude/DELIVERY-SUMMARY.md`
- [ ] `.claude/PHOENIX-TOOL-ROUTING.md`
- [ ] `.claude/PROJECT-UNDERSTANDING.md`
- [ ] `.claude/WORKFLOW.md`
- [ ] `.claude/agents/PHOENIX-AGENTS.md`
- [ ] `.claude/commands/evaluate-tools.md`
- [ ] `.claude/commands/wshobson/deps-audit.md`
- [ ] `.claude/commands/wshobson/tech-debt.md`
- [ ] `.claude/integration-test-execution-summary.md`
- [ ] `.claude/integration-test-final-report.md`
- [ ] `.claude/integration-test-plan-comparison.md`
- [ ] `.claude/integration-test-reenable-plan-v2.md`
- [ ] `.claude/integration-test-reenable-plan.md`
- [ ] `.claude/plans/2025-12-30-sprint2-quality-improvements.md`
- [ ] `.claude/plans/snapshot-service-versioning.md`
- [ ] `.claude/plans/typescript-error-elimination-debugging-report.md`
- [ ] `.claude/plans/typescript-error-elimination.md`
- [ ] `.claude/prompts/integration-test-continuation-prompt.md`
- [ ] `.claude/prompts/portfolio-intelligence-timeout-fix.md`
- [ ] `.claude/prompts/week2.5-next-session-kickoff.md`
- [ ] `.claude/prompts/week2.5-phase2-quickstart.md`
- [ ] `.claude/prompts/week2.5-phase3-continuation-v10.md`
- [ ] `.claude/prompts/week2.5-phase3-continuation-v2.md`
- [ ] `.claude/prompts/week2.5-phase3-continuation-v3.md`
- [ ] `.claude/prompts/week2.5-phase3-continuation-v4.md`
- [ ] `.claude/prompts/week2.5-phase3-continuation-v5.md`
- [ ] `.claude/prompts/week2.5-phase3-continuation.md`
- [ ] `.claude/prompts/week2.5-phase4-next-steps.md`
- [ ] `.claude/security-fixes-lp-reporting.md`
- [ ] `.claude/session-summary-portfolio-intelligence-implementation.md`
- [ ] `.claude/sessions/PHASE4-CONTINUATION-KICKOFF.md`
- [ ] `.claude/skills/README.md`
- [ ] `.claude/skills/ai-model-selection.md`
- [ ] `.claude/skills/analogical-thinking.md`
- [ ] `.claude/skills/api-design-principles.md`
- [ ] `.claude/skills/architecture-patterns.md`
- [ ] `.claude/skills/async-error-resilience.md`
- [ ] `.claude/skills/baseline-governance/SKILL.md`
- [ ] `.claude/skills/brainstorming.md`
- [ ] `.claude/skills/claude-infra-integrity/SKILL.md`
- [ ] `.claude/skills/continuous-improvement.md`
- [ ] `.claude/skills/database-schema-evolution.md`
- [ ] `.claude/skills/dispatching-parallel-agents.md`
- [ ] `.claude/skills/extended-thinking-framework.md`
- [ ] `.claude/skills/financial-calc-correctness/SKILL.md`
- [ ] `.claude/skills/integration-with-other-skills.md`
- [ ] `.claude/skills/inversion-thinking.md`
- [ ] `.claude/skills/iterative-improvement.md`
- [ ] `.claude/skills/memory-management.md`
- [ ] `.claude/skills/multi-model-consensus.md`
- [ ] `.claude/skills/notebooklm.md`
- [ ] `.claude/skills/pattern-recognition.md`
- [ ] `.claude/skills/phoenix-workflow-orchestrator/SKILL.md`
- [ ] `.claude/skills/prompt-caching-usage.md`
- [ ] `.claude/skills/react-hook-form-stability/SKILL.md`
- [ ] `.claude/skills/react-performance-optimization.md`
- [ ] `.claude/skills/root-cause-tracing.md`
- [ ] `.claude/skills/statistical-testing/SKILL.md`
- [ ] `.claude/skills/systematic-debugging.md`
- [ ] `.claude/skills/task-decomposition.md`
- [ ] `.claude/skills/test-fixture-generator/SKILL.md`
- [ ] `.claude/skills/test-pyramid/SKILL.md`
- [ ] `.claude/skills/workflow-engine/code-formatter/examples/usage.md`
- [ ] `.claude/skills/workflow-engine/code-formatter/references/style-guides.md`
- [ ] `.claude/skills/workflow-engine/dependency-guardian/examples/usage.md`
- [ ] `.claude/skills/workflow-engine/dependency-guardian/references/vulnerability-databases.md`
- [ ] `.claude/skills/workflow-engine/documentation-sync/examples/usage.md`
- [ ] `.claude/skills/workflow-engine/security-scanner/examples/usage.md`
- [ ] `.claude/skills/workflow-engine/tech-debt-tracker/examples/usage.md`
- [ ] `.claude/skills/writing-plans.md`
- [ ] `.claude/skills/xlsx.md`
- [ ] `.claude/testing/HANDOFF-MEMO-v2.md`
- [ ] `.claude/testing/HANDOFF-MEMO.md`
- [ ] `.claude/testing/immediate-actions-summary.md`
- [ ] `.claude/testing/lp-test-status-report.md`
- [ ] `.claude/testing/platform-test-checklist.md`
- [ ] `.claude/testing/platform-testing-rubric-index.md`
- [ ] `.claude/testing/rubric-analytics-reporting.md`
- [ ] `.claude/testing/rubric-api-integration.md`
- [ ] `.claude/testing/rubric-calculation-engines.md`
- [ ] `.claude/testing/rubric-cross-cutting.md`
- [ ] `.claude/testing/rubric-fund-setup.md`
- [ ] `.claude/testing/rubric-lp-portal.md`
- [ ] `.claude/testing/rubric-portfolio-management.md`
- [ ] `.claude/testing/scenario-comparison-manual-test-rubric.md`
- [ ] `.claude/testing/seed-script-remaining-fixes.md`
- [ ] `.claude/testing/test-baseline-report-2025-12-23.md`
- [ ] `.claude/testing/test-remediation-summary.md`
- [ ] `.claude/testing/week2-execution-report.md`
- [ ] `AI-WORKFLOW-COMPLETE-GUIDE.md`
- [ ] `ANTI_PATTERNS.md`
- [ ] `BASELINE-SNAPSHOT-20251215.md`
- [ ] `BUG-FIX-SUMMARY-FEES-EXPENSES-2025-11-30.md`
- [ ] `CHANGELOG.md`
- [ ] `CLAUDE.md`
- [ ] `CLAUDE_COOKBOOK_INTEGRATION.md`
- [ ] `CLAUDE_PROJECT_INSTRUCTIONS.md`
- [ ] `COMPREHENSIVE-WORKFLOW-GUIDE.md`
- [ ] `DECISIONS.md`
- [ ] `DEV_BOOTSTRAP_README.md`
- [ ] `DOCUMENTATION-NAVIGATION-GUIDE.md`
- [ ] `ENHANCED_DESIGN_SYSTEM_IMPLEMENTATION.md`
- [ ] `FEATURE_FLAGS_READY.md`
- [ ] `FOUNDATION-HARDENING-PLAN.md`
- [ ] `HANDOFF-MEMO-2025-10-30.md`
- [ ] `HANDOFF-MEMO-CAPITAL-ALLOCATION-COMPLETE-2025-11-05.md`
- [ ] `HANDOFF-MEMO-PHASE-2-STRATEGY-2025-11-05.md`
- [ ] `HANDOFF-MEMO-PHASE1D-EXPANSION-2025-11-04.md`
- [ ] `HANDOFF-MEMO-PHASE2-MERGED-2025-11-06.md`
- [ ] `HANDOFF-MEMO-PHASE2-READY-2025-11-06.md`
- [ ] `HANDOFF-MEMO-SCHEMA-TDD-PHASE1-COMPLETE.md`
- [ ] `HANDOFF-PORTFOLIO-PHASE0-COMPLETE.md`
- [ ] `HANDOFF-SKILLS-APPLICATION-2025-11-29.md`
- [ ] `HANDOFF-SKILLS-INTEGRATION-2025-11-29.md`
- [ ] `HANDOFF-WEEK-2-SKILLS-2025-11-29.md`
- [ ] `IMPLEMENTATION-SUMMARY-WATCH-DEBOUNCE-FIX.md`
- [ ] `IMPLEMENTATION_SYNTHESIS.md`
- [ ] `ITERATION-A-QUICKSTART.md`
- [ ] `JSDOM-FIX-SUMMARY-2025-12-01.md`
- [ ] `KICKOFF-HYGIENE-SPRINT.md`
- [ ] `KICKOFF-SKILLS-APPLICATION.md`
- [ ] `MERGE_RISK_ANALYSIS.md`
- [ ] `MIGRATION-NATIVE-MEMORY.md`
- [ ] `MIGRATION-QUICK-START.md`
- [ ] `NATIVE-MEMORY-INTEGRATION.md`
- [ ] `NEXT-SESSION-KICKOFF-PROMPT.md`
- [ ] `NEXT_ACTIONS.md`
- [ ] `NEXT_STEPS_CHECKLIST.md`
- [ ] `PHASE-0A-MIDDLEWARE-PLAN.md`
- [ ] `PHASE-0A-STATUS-ASSESSMENT.md`
- [ ] `PHASE0-DATA-MIGRATION-STRATEGY.md`
- [ ] `PHASE0-FEATURE-FLAG-DEPLOYMENT-PLAN.md`
- [ ] `PHASE0-FRONTEND-INTEGRATION-SCOPE.md`
- [ ] `PHASE0B-QUICK-REFERENCE.md`
- [ ] `PHASE0B-SERVICE-ARCHITECTURE-REVIEW.md`
- [ ] `PHASE2_HANDOFF_MEMO.md`
- [ ] `PHASE3-IMPLEMENTATION-HANDOFF-2025-11-06.md`
- [ ] `PHASE3-KICKOFF-CHECKLIST.md`
- [ ] `PHASE3-STRATEGY-FINAL-2025-11-06.md`
- [ ] `PHASE3-STRATEGY-HANDOFF-2025-11-06.md`
- [ ] `PHASE3-WEEK46-COMPLETE.md`
- [ ] `PLAN.md`
- [ ] `PORTFOLIO-API-STRATEGY-UPDATED.md`
- [ ] `PORTFOLIO-SCHEMA-MIGRATION-ANALYSIS.md`
- [ ] `PR-201-MERGE-ANALYSIS.md`
- [ ] `PRE_MERGE_CHECKLIST.md`
- [ ] `PRODUCTION_RUNBOOK.md`
- [ ] `PROMPT_PATTERNS.md`
- [ ] `Proposed Next Steps - Oct 30 v2 - VALIDATION REPORT.md`
- [ ] `QA-RESULTS-FEES-EXPENSES-STEP-2025-12-01.md`
- [ ] `QUARANTINE_TEST_ANALYSIS.md`
- [ ] `QUICK_FIX_INSTRUCTIONS.md`
- [ ] `README.md`
- [ ] `READY-TO-IMPLEMENT.md`
- [ ] `REFINED_PR_PACK.md`
- [ ] `RLS-CHEATSHEET.md`
- [ ] `ROLLOUT-PROPOSAL.md`
- [ ] `SCENARIO-1-WATERFALL-BUG-FIX-SUMMARY.md`
- [ ] `SECURITY.md`
- [ ] `SESSION-HANDOFF-2025-11-10.md`
- [ ] `SESSION-HANDOFF-2025-11-14-PHASE0-PRE-COMPLETE.md`
- [ ] `SESSION-HANDOFF-2025-11-17-PHASE0A-ACTUAL-STATUS.md`
- [ ] `SESSION-HANDOFF-2025-11-17-PHASE0A-COMPLETE.md`
- [ ] `SESSION-HANDOFF-2025-11-17-PHASE0A-REVIEW.md`
- [ ] `SESSION-HANDOFF-PHASE0-PORTFOLIO-2025-11-10.md`
- [ ] `SESSION-HANDOFF-PORTFOLIO-PARALLEL-2025-11-10.md`
- [ ] `SESSION_V5_COMPLETE_SUMMARY.md`
- [ ] `SIDECAR_GUIDE.md`
- [ ] `STABILIZATION-BUNDLE.md`
- [ ] `STEP_2_AND_4_IMPROVEMENTS.md`
- [ ] `SUPERPOWERS-INTEGRATION-SUMMARY.md`
- [ ] `TEST_FIX_SUMMARY.md`
- [ ] `TEST_REPAIR_SESSION_SUMMARY.md`
- [ ] `TEST_REPAIR_SUMMARY.md`
- [ ] `TYPESCRIPT_ERRORS_REVIEW.md`
- [ ] `ULTRA_COMPRESSED_PLAYBOOK.md`
- [ ] `UNIFIED_METRICS_IMPLEMENTATION.md`
- [ ] `UX_INTEGRATION_CONSENSUS.md`
- [ ] `VERCEL_ACCESS.md`
- [ ] `VERCEL_SOLUTION.md`
- [ ] `WEEK_1_FINAL_VALIDATED.md`
- [ ] `WORKTREE-INVENTORY.md`
- [ ] `cheatsheets/INDEX.md`
- [ ] `cheatsheets/agent-architecture.md`
- [ ] `cheatsheets/agent-memory-integration.md`
- [ ] `cheatsheets/agent-memory/database-expert-schema-tdd.md`
- [ ] `cheatsheets/ai-code-review.md`
- [ ] `cheatsheets/anti-pattern-prevention.md`
- [ ] `cheatsheets/api.md`
- [ ] `cheatsheets/baseline-governance.md`
- [ ] `cheatsheets/capability-checklist.md`
- [ ] `cheatsheets/ci-validator-guide.md`
- [ ] `cheatsheets/claude-code-best-practices.md`
- [ ] `cheatsheets/claude-commands.md`
- [ ] `cheatsheets/claude-md-guidelines.md`
- [ ] `cheatsheets/coding-pairs-playbook.md`
- [ ] `cheatsheets/command-summary.md`
- [ ] `cheatsheets/correct-workflow-example.md`
- [ ] `cheatsheets/daily-workflow.md`
- [ ] `cheatsheets/document-review-workflow.md`
- [ ] `cheatsheets/documentation-validation.md`
- [ ] `cheatsheets/emoji-free-documentation.md`
- [ ] `cheatsheets/evaluator-optimizer-workflow.md`
- [ ] `cheatsheets/exact-optional-property-types.md`
- [ ] `cheatsheets/extended-thinking.md`
- [ ] `cheatsheets/init-vs-update.md`
- [ ] `cheatsheets/lp-deployment-quick-reference.md`
- [ ] `cheatsheets/memory-commands.md`
- [ ] `cheatsheets/memory-commit-strategy.md`
- [ ] `cheatsheets/memory-patterns.md`
- [ ] `cheatsheets/multi-agent-orchestration.md`
- [ ] `cheatsheets/pr-merge-verification.md`
- [ ] `cheatsheets/pr-review-workflow.md`
- [ ] `cheatsheets/prompt-improver-hook.md`
- [ ] `cheatsheets/react-performance-patterns.md`
- [ ] `cheatsheets/schema-alignment.md`
- [ ] `cheatsheets/service-testing-patterns.md`
- [ ] `cheatsheets/test-pyramid.md`
- [ ] `cheatsheets/testcontainers-guide.md`
- [ ] `cheatsheets/testing.md`
- [ ] `docs/.templates/DEPRECATION-HEADER.md`
- [ ] `docs/.templates/DOC-FRONTMATTER-SCHEMA.md`
- [ ] `docs/ADR-00X-resilience-circuit-breaker.md`
- [ ] `docs/ADR-015-XIRR-BOUNDED-RATES.md`
- [ ] `docs/ANALYTICS_IMPLEMENTATION.md`
- [ ] `docs/ARCHITECTURAL-DEBT.md`
- [ ] `docs/BUILD_READINESS.md`
- [ ] `docs/CA-IMPLEMENTATION-PLAN.md`
- [ ] `docs/CA-SEMANTIC-LOCK.md`
- [ ] `docs/CI_GATING_TEST.md`
- [ ] `docs/CLAUDE-INFRA-V4-INTEGRATION-PLAN.md`
- [ ] `docs/CLEANUP_PR_BODY.md`
- [ ] `docs/CLEANUP_PR_TEMPLATE.md`
- [ ] `docs/COMMIT_REVIEW.md`
- [ ] `docs/CONFIG_CONSOLIDATION_SUMMARY.md`
- [ ] `docs/CONSOLIDATION_LEARNINGS.md`
- [ ] `docs/CRITICAL_OPTIMIZATIONS.md`
- [ ] `docs/DECISIONS.md`
- [ ] `docs/DELIVERY_PLAYBOOK.md`
- [ ] `docs/DEPLOYMENT.md`
- [ ] `docs/DEPLOYMENT_RUNBOOK.md`
- [ ] `docs/DEVELOPMENT-STRATEGY-2025-12-14.md`
- [ ] `docs/DEVELOPMENT_STRATEGY.md`
- [ ] `docs/HANDOFF_JCURVE_IMPLEMENTATION.md`
- [ ] `docs/Handoff-Memo-Phase-1-Validation.md`
- [ ] `docs/IDEMPOTENCY_GUIDE.md`
- [ ] `docs/INCIDENT_RESPONSE.md`
- [ ] `docs/INFRASTRUCTURE_REMEDIATION.md`
- [ ] `docs/INTEGRATION_PR_CHECKLIST.md`
- [ ] `docs/METRICS_LIMITATIONS_MVP.md`
- [ ] `docs/METRICS_OPERATOR_RUNBOOK.md`
- [ ] `docs/MIGRATION_GUIDE_DB_CIRCUIT.md`
- [ ] `docs/MILESTONE-XIRR-PHASE0-COMPLETE.md`
- [ ] `docs/MULTI-AI-DEVELOPMENT-WORKFLOW.md`
- [ ] `docs/NAV_TREATMENT.md`
- [ ] `docs/OPERATOR_RUNBOOK.md`
- [ ] `docs/OPTIMIZED_ROADMAP.md`
- [ ] `docs/OSS_INTEGRATION_SUMMARY.md`
- [ ] `docs/PHASE-1C-COMPLETION-REPORT.md`
- [ ] `docs/PHASE-1D-CHECKPOINT.md`
- [ ] `docs/PHASE-1D-STATUS.md`
- [ ] `docs/PHASE1A-XIRR-COMPLETE.md`
- [ ] `docs/PHASE1B-ASSEMBLY-INSTRUCTIONS.md`
- [ ] `docs/PHASE1B-FEES-COMPLETE.md`
- [ ] `docs/PHASE1B-FEES-IN-PROGRESS.md`
- [ ] `docs/PHASE1B-TRUTH-CASES-REFERENCE.md`
- [ ] `docs/PHASE1_INTEGRATION_SUMMARY.md`
- [ ] `docs/PHOENIX-SOT/brand-bridge.md`
- [ ] `docs/PHOENIX-SOT/deferred-vesting-plan.md`
- [ ] `docs/PHOENIX-SOT/execution-plan-v2.34.md`
- [ ] `docs/PHOENIX-SOT/execution-plan-v3.0-phase3-addendum.md`
- [ ] `docs/PHOENIX-SOT/mcp-tools-guide.md`
- [ ] `docs/PHOENIX-SOT/prompt-templates.md`
- [ ] `docs/PHOENIX-SOT/skills-overview.md`
- [ ] `docs/PORTFOLIO_TABS_ARCHITECTURE.md`
- [ ] `docs/PRODUCTION_CHECKLIST.md`
- [ ] `docs/PROPOSAL_WORKFLOW_SUMMARY.md`
- [ ] `docs/PR_DESCRIPTION.md`
- [ ] `docs/PR_INTEGRATION_PLAN.md`
- [ ] `docs/PR_NOTES/CODACY_JCURVE_NOTE.md`
- [ ] `docs/RATE_LIMITING_SUMMARY.md`
- [ ] `docs/RLS-DEVELOPMENT-GUIDE.md`
- [ ] `docs/RLS-SUMMARY.md`
- [ ] `docs/ROLLBACK.md`
- [ ] `docs/ROLLBACK_TRIGGERS.md`
- [ ] `docs/ROLLOUT_STRATEGY.md`
- [ ] `docs/SAFETY_CHECK_REPORT.md`
- [ ] `docs/SCENARIO_ANALYSIS_IMPLEMENTATION_STATUS.md`
- [ ] `docs/SCENARIO_ANALYSIS_STABILITY_REVIEW.md`
- [ ] `docs/SCENARIO_ANALYSIS_SUMMARY.md`
- [ ] `docs/SCENARIO_DEPLOY_GUIDE.md`
- [ ] `docs/SESSION-5-PHASE-1D-KICKOFF.md`
- [ ] `docs/SETUP_NOTES.md`
- [ ] `docs/SLO.md`
- [ ] `docs/TYPESCRIPT_BASELINE.md`
- [ ] `docs/VALIDATION-FRAMEWORK-IMPLEMENTATION.md`
- [ ] `docs/VERIFICATION_CHECKLIST.md`
- [ ] `docs/VERIFICATION_SUMMARY.md`
- [ ] `docs/WEEK1_VALIDATION_HANDOFF_MEMO.md`
- [ ] `docs/WINDOWS_NODE_CORRUPTION_PREVENTION.md`
- [ ] `docs/WIZARD_RESERVE_BRIDGE_IMPLEMENTATION.md`
- [ ] `docs/WSL2_BUILD_TEST.md`
- [ ] `docs/ZENCODER_INTEGRATION.md`
- [ ] `docs/action-plans/CODEX-FIXES-EXECUTION-SUMMARY.md`
- [ ] `docs/action-plans/CODEX-ISSUES-RESOLUTION-PLAN.md`
- [ ] `docs/adr/0001-evaluator-metrics.md`
- [ ] `docs/adr/0002-token-budgeting.md`
- [ ] `docs/adr/0003-streaming-architecture.md`
- [ ] `docs/adr/ADR-004-waterfall-names.md`
- [ ] `docs/adr/ADR-005-xirr-excel-parity.md`
- [ ] `docs/adr/ADR-006-fee-calculation-standards.md`
- [ ] `docs/adr/ADR-007-exit-recycling-policy.md`
- [ ] `docs/adr/ADR-008-capital-allocation-policy.md`
- [ ] `docs/adr/ADR-010-monte-carlo-validation-strategy.md`
- [ ] `docs/adr/ADR-011-stage-normalization-v2.md`
- [ ] `docs/adr/ADR-012-mem0-integration.md`
- [ ] `docs/adr/ADR-013-scenario-comparison-activation.md`
- [ ] `docs/adr/README.md`
- [ ] `docs/agent-2-mobile-executive-dashboard.md`
- [ ] `docs/ai-enhanced-components-guide.md`
- [ ] `docs/ai-optimization/AGENTS.md`
- [ ] `docs/ai-optimization/AI_AGENT_BACKTEST_FRAMEWORK.md`
- [ ] `docs/ai-optimization/AI_COLLABORATION_GUIDE.md`
- [ ] `docs/ai-optimization/AI_ORCHESTRATOR_IMPLEMENTATION.md`
- [ ] `docs/ai-optimization/BACKTEST_QUICKSTART.md`
- [ ] `docs/ai-optimization/CODEX-REVIEW-AGENT-SETUP.md`
- [ ] `docs/ai-optimization/CODEX_AGENT_MIGRATION.md`
- [ ] `docs/ai-optimization/MULTI_AI_REVIEW_SYNTHESIS.md`
- [ ] `docs/analysis/perf-watch-memoization-root-cause.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/00-INDEX.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/01-EXECUTIVE-SUMMARY.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/02-PHASE1-PLAN-ANALYSIS.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/03-PROJECT-UNDERSTANDING-ANALYSIS.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/04-PHOENIX-STRATEGY-ANALYSIS.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/05-CROSS-DOCUMENT-SYNTHESIS.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/06-ACTION-PLAN.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/07-METRICS-AND-VERIFICATION.md`
- [ ] `docs/analysis/strategic-review-2025-11-27/EVIDENCE-VALIDATION-REPORT.md`
- [ ] `docs/analysis/wizard-steps-pattern-analysis.md`
- [ ] `docs/api/architecture/portfolio-route-api.md`
- [ ] `docs/api/contracts/portfolio-route-v1.md`
- [ ] `docs/api/fund-allocations-phase1b.md`
- [ ] `docs/api/patterns/existing-route-patterns.md`
- [ ] `docs/api/testing/portfolio-route-test-strategy.md`
- [ ] `docs/array-safety-adoption-guide.md`
- [ ] `docs/auth/RS256-SETUP.md`
- [ ] `docs/behavioral-specs/time-travel-analytics-service-specs.md`
- [ ] `docs/chaos-and-retention.md`
- [ ] `docs/chaos-engineering/QUICK-REFERENCE.md`
- [ ] `docs/chaos-engineering/README.md`
- [ ] `docs/chaos-engineering/RLS-CHAOS-TESTING-PLAN.md`
- [ ] `docs/chaos-engineering/RLS-GAME-DAY-RUNBOOK.md`
- [ ] `docs/chaos-engineering/RLS-MONITORING-SPECS.md`
- [ ] `docs/chaos/catalog.md`
- [ ] `docs/chart-migration-decision.md`
- [ ] `docs/circuit-notion-checklist.md`
- [ ] `docs/code-review/CODEX-BOT-FINDINGS-SUMMARY.md`
- [ ] `docs/commands-and-plugins-inventory.md`
- [ ] `docs/components/NumericInput.md`
- [ ] `docs/components/reallocation-tab-implementation.md`
- [ ] `docs/components/reserve-adapter-integration.md`
- [ ] `docs/components/reserve-engine-architecture.md`
- [ ] `docs/components/reserve-engine-delivery.md`
- [ ] `docs/components/reserve-engine-spec.md`
- [ ] `docs/components/worker-implementation.md`
- [ ] `docs/contracts/parallel-foundation.md`
- [ ] `docs/contracts/selector-contract-readme.md`
- [ ] `docs/database/MULTI-TENANT-RLS-INFRASTRUCTURE.md`
- [ ] `docs/debugging/profiling-playbook.md`
- [ ] `docs/debugging/triage-guide.md`
- [ ] `docs/deployment-audit.md`
- [ ] `docs/deployment/CODEX-FIXES-DEPLOYMENT-STATUS.md`
- [ ] `docs/deployment/MEMORY_PHASE2_DEPLOYMENT.md`
- [ ] `docs/deployment/ROLLBACK_PLAN.md`
- [ ] `docs/deployment/STAGING_CHECKLIST.md`
- [ ] `docs/deployment/STAGING_DEPLOYMENT_SUMMARY.md`
- [ ] `docs/deployment/STAGING_METRICS.md`
- [ ] `docs/deployment/vercel-setup.md`
- [ ] `docs/dev-environment-reset.md`
- [ ] `docs/dev/foreach-fix-improved.md`
- [ ] `docs/dev/foreach-fix.md`
- [ ] `docs/dev/wsl2-quickstart.md`
- [ ] `docs/development/windows-setup.md`
- [ ] `docs/enhanced-design-system-guide.md`
- [ ] `docs/extended-thinking-integration.md`
- [ ] `docs/fail-open-close-matrix.md`
- [ ] `docs/failure-triage.md`
- [ ] `docs/feature-flags.md`
- [ ] `docs/fixes/PR-112-MANAGEMENT-FEE-HORIZON-FIX.md`
- [ ] `docs/fixes/vercel-sidecar-ci-fix.md`
- [ ] `docs/fixes/vite-build-vercel-fix.md`
- [ ] `docs/forecasting/CALIBRATION_GUIDE.md`
- [ ] `docs/forecasting/power-law-implementation.md`
- [ ] `docs/forecasting/streaming-monte-carlo-migration.md`
- [ ] `docs/foundation/PHASE0.5-TEST-DATA-INFRASTRUCTURE.md`
- [ ] `docs/foundation/PHASE2-ROADMAP-IMPROVEMENTS.md`
- [ ] `docs/foundation/PHASE2-ROADMAP.md`
- [ ] `docs/foundation/PHASE3-KICKOFF.md`
- [ ] `docs/foundation/PHASE4-KICKOFF.md`
- [ ] `docs/foundation/PHASE4-SESSION1-SUMMARY.md`
- [ ] `docs/fund-allocation-phase1b.md`
- [ ] `docs/gates/GATE_TRACKING.md`
- [ ] `docs/gates/RACI_MATRIX.md`
- [ ] `docs/governance/abort-matrix.md`
- [ ] `docs/governance/decision-log.md`
- [ ] `docs/governance/risk-matrix.md`
- [ ] `docs/governance/sync-point-failure-plans.md`
- [ ] `docs/ia-consolidation-strategy.md`
- [ ] `docs/integration/SCHEMA-MIGRATION-PLAN.md`
- [ ] `docs/integration/mem0-integration.md`
- [ ] `docs/integration/upstash-setup.md`
- [ ] `docs/internal/WEEK46-VALIDATION-NOTES.md`
- [ ] `docs/internal/architecture/state-flow.md`
- [ ] `docs/internal/checklists/definition-of-done.md`
- [ ] `docs/internal/checklists/self-review.md`
- [ ] `docs/internal/database/01-overview.md`
- [ ] `docs/internal/database/02-patterns.md`
- [ ] `docs/internal/database/03-optimization.md`
- [ ] `docs/internal/index.md`
- [ ] `docs/internal/validation/01-overview.md`
- [ ] `docs/internal/validation/02-zod-patterns.md`
- [ ] `docs/internal/validation/03-type-system.md`
- [ ] `docs/internal/validation/04-integration.md`
- [ ] `docs/iterations/ALIGNMENT-STATUS.md`
- [ ] `docs/iterations/IMPLEMENTATION-STATUS.md`
- [ ] `docs/iterations/PR2-PROGRESS.md`
- [ ] `docs/iterations/PRE-TEST-HARDENING.md`
- [ ] `docs/iterations/REVIEW-ACTION-PLAN.md`
- [ ] `docs/iterations/STRATEGY-SUMMARY.md`
- [ ] `docs/iterations/iteration-a-implementation-guide.md`
- [ ] `docs/lp-deployment-checklist.md`
- [ ] `docs/lp-observability-implementation.md`
- [ ] `docs/lp-slo-definitions.md`
- [ ] `docs/metrics-meanings.md`
- [ ] `docs/notebooklm-sources/PHASE2-COMPLETE.md`
- [ ] `docs/notebooklm-sources/capital-allocation.md`
- [ ] `docs/notebooklm-sources/cohorts/01-overview.md`
- [ ] `docs/notebooklm-sources/cohorts/02-metrics.md`
- [ ] `docs/notebooklm-sources/cohorts/03-analysis.md`
- [ ] `docs/notebooklm-sources/exit-recycling.md`
- [ ] `docs/notebooklm-sources/fees.md`
- [ ] `docs/notebooklm-sources/monte-carlo/01-overview.md`
- [ ] `docs/notebooklm-sources/monte-carlo/02-simulation.md`
- [ ] `docs/notebooklm-sources/monte-carlo/03-statistics.md`
- [ ] `docs/notebooklm-sources/monte-carlo/04-validation.md`
- [ ] `docs/notebooklm-sources/pacing/01-overview.md`
- [ ] `docs/notebooklm-sources/pacing/02-strategies.md`
- [ ] `docs/notebooklm-sources/pacing/03-integration.md`
- [ ] `docs/notebooklm-sources/pacing/VALIDATION-NOTES.md`
- [ ] `docs/notebooklm-sources/reserves/01-overview.md`
- [ ] `docs/notebooklm-sources/reserves/02-algorithms.md`
- [ ] `docs/notebooklm-sources/reserves/03-examples.md`
- [ ] `docs/notebooklm-sources/reserves/04-integration.md`
- [ ] `docs/notebooklm-sources/waterfall.md`
- [ ] `docs/notebooklm-sources/xirr.md`
- [ ] `docs/npm-bin-resolution-investigation.md`
- [ ] `docs/observability.md`
- [ ] `docs/observability/EDITORIAL-V2-CHANGELOG.md`
- [ ] `docs/observability/README.md`
- [ ] `docs/observability/ai-metrics.md`
- [ ] `docs/observability/archive/2025-10-06/pr-113-auth-comment-v1.md`
- [ ] `docs/observability/archive/2025-10-06/pr-113-fundcalc-comment-v1.md`
- [ ] `docs/observability/archive/2025-10-06/pr-113-merge-review-final-v1.md`
- [ ] `docs/observability/archive/2025-10-06/pr-113-review-v1.md`
- [ ] `docs/observability/archive/2025-10-06/pr-113-split-instructions-v1.md`
- [ ] `docs/observability/archive/2025-10-06/pr-113-summary-v1.md`
- [ ] `docs/observability/auth-comment.md`
- [ ] `docs/observability/business-kpis.md`
- [ ] `docs/observability/fundcalc-comment.md`
- [ ] `docs/observability/rum.md`
- [ ] `docs/observability/split-plan-comment.md`
- [ ] `docs/perf-baseline.md`
- [ ] `docs/performance-logging-automation.md`
- [ ] `docs/phase0-validation-report.md`
- [ ] `docs/phase0-xirr-analysis-eda20590.md`
- [ ] `docs/phase1-1-1-analysis.md`
- [ ] `docs/phase1-2-completion-report.md`
- [ ] `docs/phase1-2-investigation-summary.md`
- [ ] `docs/phase1-2-session-handoff.md`
- [ ] `docs/phase1-implementation-summary.md`
- [ ] `docs/phase1-next-session-handoff.md`
- [ ] `docs/phase1-xirr-baseline-heatmap.md`
- [ ] `docs/phase1-xirr-waterfall-roadmap.md`
- [ ] `docs/phase1b-waterfall-evaluator-hardening.md`
- [ ] `docs/phase2 docs/CHECKLIST-Phase2.md`
- [ ] `docs/phase2 docs/PR_BODY-Phase2.md`
- [ ] `docs/phase2 docs/README.md`
- [ ] `docs/phase2 docs/STRATEGY-Phase2-CapitalAllocation.md`
- [ ] `docs/phoenix-v2.32-command-enhancements.md`
- [ ] `docs/plans/2025-12-28-backend-testing-improvements.md`
- [ ] `docs/plans/2025-12-29-phase2-planning-REVIEW.md`
- [ ] `docs/plans/2025-12-29-phase2-planning.md`
- [ ] `docs/plans/2025-12-29-phase3c-solo-execution.md`
- [ ] `docs/plans/2025-12-29-phoenix-phase3-planning.md`
- [ ] `docs/plans/2025-12-29-phoenix-phases-1.4-1.7-completion.md`
- [ ] `docs/plans/2025-12-29-plan-review-and-refinements.md`
- [ ] `docs/plans/2025-12-29-pr-318-merge-validation-plan.md`
- [ ] `docs/plans/2025-12-31-lp-portal-sprint-3.md`
- [ ] `docs/plans/2026-01-04-advanced-cohort-analysis-design.md`
- [ ] `docs/plans/2026-01-04-api-engine-integration-design.md`
- [ ] `docs/plans/2026-01-04-critical-corrections.md`
- [ ] `docs/plans/2026-01-04-monte-carlo-backtesting-integration.md`
- [ ] `docs/plans/2026-01-04-phase1-implementation-plan.md`
- [ ] `docs/plans/2026-01-04-portfolio-optimization-design.md`
- [ ] `docs/plans/2026-01-04-portfolio-optimization-handoff.md`
- [ ] `docs/plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md`
- [ ] `docs/plans/FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md`
- [ ] `docs/plans/FOUNDATION-HARDENING-STRATEGY.md`
- [ ] `docs/plans/HANDOFF-SUMMARY.md`
- [ ] `docs/plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md`
- [ ] `docs/plans/PHASE3-SESSION1-SUMMARY.md`
- [ ] `docs/plans/PHASE3-SESSION2-KICKOFF.md`
- [ ] `docs/plans/PHASE3-SESSION3-KICKOFF.md`
- [ ] `docs/plans/PHASE3-SESSION4-KICKOFF.md`
- [ ] `docs/plans/PHASE3-SESSION5-KICKOFF.md`
- [ ] `docs/plans/WEEK1-TOOL-ROUTING-EXECUTION.md`
- [ ] `docs/plans/WEEK2-TOOL-ROUTING-EXECUTION.md`
- [ ] `docs/plans/WEEK2.5-FOUNDATION-HARDENING-KICKOFF.md`
- [ ] `docs/plans/WEEK2.5-FOUNDATION-HARDENING-RESULTS.md`
- [ ] `docs/plans/WEEK2.5-INDEX.md`
- [ ] `docs/plans/WEEK2.5-PHASE2-AGENT-STRATEGY.md`
- [ ] `docs/plans/WEEK2.5-PHASE2-COMPLETE-GUIDE.md`
- [ ] `docs/plans/WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md`
- [ ] `docs/plans/WEEK2.5-PHASE2-SUCCESS.md`
- [ ] `docs/plans/WEEK2.5-PHASE3-PR-SUMMARY.md`
- [ ] `docs/plans/WORKFLOW-ENGINE-INTEGRATION-PLAN.md`
- [ ] `docs/plans/xstate-persistence-implementation.md`
- [ ] `docs/policies/feasibility-constraints.md`
- [ ] `docs/portfolio-construction-modeling.md`
- [ ] `docs/portfolio-intelligence-systems-technical-memo.md`
- [ ] `docs/power-law-integration.md`
- [ ] `docs/prd.md`
- [ ] `docs/processes/AUTOMATION_GUIDE.md`
- [ ] `docs/processes/COMMIT_LOG.md`
- [ ] `docs/processes/CONTRIBUTING.md`
- [ ] `docs/processes/DEPLOYMENT_COMPLETE.md`
- [ ] `docs/processes/DEPLOYMENT_TODO.md`
- [ ] `docs/processes/FINAL_VALIDATION.md`
- [ ] `docs/processes/GITHUB_COMMIT_GUIDE.md`
- [ ] `docs/processes/GITHUB_SETUP.md`
- [ ] `docs/processes/PEER_REVIEW.md`
- [ ] `docs/processes/PIPELINE_SCHEMA_COMPLETE.md`
- [ ] `docs/processes/PIPELINE_TODO.md`
- [ ] `docs/processes/PRE_PUSH_CHECKLIST.md`
- [ ] `docs/processes/TEAM_SETUP.md`
- [ ] `docs/processes/code-review-checklist.md`
- [ ] `docs/production-deployment-checklist.md`
- [ ] `docs/reallocation-api-quickstart.md`
- [ ] `docs/references/attached_assets/1-general_1752964042172.md`
- [ ] `docs/references/attached_assets/2-sector-profiles_1752964042178.md`
- [ ] `docs/references/attached_assets/3-allocations_1752964042179.md`
- [ ] `docs/references/attached_assets/4-fees-expenses_1752964042179.md`
- [ ] `docs/references/attached_assets/5-exit-recycling_1752964042179.md`
- [ ] `docs/references/attached_assets/6-waterfall_1752964042180.md`
- [ ] `docs/references/attached_assets/7-limited-partners_1752964042180.md`
- [ ] `docs/references/attached_assets/README_1752917121255.md`
- [ ] `docs/references/attached_assets/README_1752964042182.md`
- [ ] `docs/references/attached_assets/content-1752982029235.md`
- [ ] `docs/references/attached_assets/content-1752988962282.md`
- [ ] `docs/references/capital-allocation-follow-on.md`
- [ ] `docs/references/claude-agent-engines.md`
- [ ] `docs/references/claude-agent-integration.md`
- [ ] `docs/references/claude-agent-schema.md`
- [ ] `docs/references/claude-agent-testing.md`
- [ ] `docs/references/replit.md`
- [ ] `docs/references/seed-cases-ca-007-020.md`
- [ ] `docs/release/compat-matrix.md`
- [ ] `docs/releases/SlackBatchAPI-v1.0.0.md`
- [ ] `docs/releases/stage-norm-phase4.md`
- [ ] `docs/releases/stage-norm-phase5.md`
- [ ] `docs/releases/stage-norm-v3.4-option-b.md`
- [ ] `docs/releases/stage-norm-v3.4-review.md`
- [ ] `docs/releases/stage-normalization-v3.4.md`
- [ ] `docs/replit.md`
- [ ] `docs/reviews/CA-IMPLEMENTATION-EVALUATION-FINAL.md`
- [ ] `docs/reviews/CA-IMPLEMENTATION-EVALUATION-REFINED.md`
- [ ] `docs/rollback-playbook.md`
- [ ] `docs/runbook.md`
- [ ] `docs/runbooks/blue-green.md`
- [ ] `docs/runbooks/canary.md`
- [ ] `docs/runbooks/dr.md`
- [ ] `docs/runbooks/incident.md`
- [ ] `docs/runbooks/rollback.md`
- [ ] `docs/runbooks/stage-normalization-migration.md`
- [ ] `docs/runbooks/stage-normalization-rollout.md`
- [ ] `docs/runbooks/stage-validation.md`
- [ ] `docs/runbooks/synthetic-monitoring.md`
- [ ] `docs/runbooks/synthetics-debug.md`
- [ ] `docs/schema.md`
- [ ] `docs/schemas/README.md`
- [ ] `docs/schemas/schema-helpers-integration.md`
- [ ] `docs/schemas/schema-mapping.md`
- [ ] `docs/security/CODACY_REMEDIATION_2025.md`
- [ ] `docs/security/cve-exceptions.md`
- [ ] `docs/skills-application-log.md`
- [ ] `docs/skills-application-synthesis.md`
- [ ] `docs/sprint-g2c-automation-kickoff.md`
- [ ] `docs/sprint-g2c-backlog.md`
- [ ] `docs/sprint-g2c-ceremony-calendar.md`
- [ ] `docs/sprint-g2c-master-checklist.md`
- [ ] `docs/sprint-g2c-planning-agenda.md`
- [ ] `docs/sprint-g2c-sanity-check.md`
- [ ] `docs/sprint-g2c-stakeholder-summary.md`
- [ ] `docs/stage-normalization-scripts.md`
- [ ] `docs/stage-normalization-v3.4.md`
- [ ] `docs/staging/phase2.1/README.md`
- [ ] `docs/staging/phase2.1/cluster-a-partial-success-report.md`
- [ ] `docs/staging/phase2.1/cluster-b-stage-validation-prep.md`
- [ ] `docs/staging/phase2.1/cluster-c-APPLY-PATCHES.md`
- [ ] `docs/staging/phase2.1/cluster-c-batch-gate-results.md`
- [ ] `docs/staging/phase2.1/cluster-c-modeling-wizard-prep.md`
- [ ] `docs/staging/phase2.1/seams/redis-webhook-contract.md`
- [ ] `docs/standards.md`
- [ ] `docs/strategies/PHOENIX-PLAN-2025-11-30.md`
- [ ] `docs/templates/README.md`
- [ ] `docs/templates/design-system-template.md`
- [ ] `docs/templates/feature-flow-template.md`
- [ ] `docs/test-improvement-status.md`
- [ ] `docs/type-safety-action-plan.md`
- [ ] `docs/type-safety-migration.md`
- [ ] `docs/type-safety-progress-report.md`
- [ ] `docs/validation/DeterministicReserveEngine.md`
- [ ] `docs/validation/stage-validation-patched.md`
- [ ] `docs/validation/stage-validation-v3.md`
- [ ] `docs/wizard-calculations-integration.md`
- [ ] `docs/wizard/COMPLETION_SUMMARY.md`
- [ ] `docs/wizard/MIGRATION_GUIDE.md`
- [ ] `docs/wizard/RESERVES_CARD_IMPROVEMENTS.md`
- [ ] `docs/wizard/WIZARD_INTEGRATION.md`
- [ ] `docs/wizard/modeling-wizard-design.md`
- [ ] `docs/workflows/CONSOLIDATION_PLAN_V2.md`
- [ ] `docs/workflows/CONSOLIDATION_PLAN_V3_FINAL.md`
- [ ] `docs/workflows/PAIRED-AGENT-VALIDATION.md`
- [ ] `docs/workflows/PRODUCTION_SCRIPTS.md`
- [ ] `docs/workflows/README.md`
- [ ] `docs/xirr-excel-validation.md`
- [ ] `docs/xirr-golden-set-addition-summary.md`
- [ ] `docs/xirr-golden-set-migration-plan.md`
- [ ] `docs/zen-mcp-integration-summary.md`
- [ ] `triage-interleaved-thinking-failures.md`

---

_To fix staleness: Update `last_updated` field in document frontmatter._ _To set
owner: Add `owner` field in document frontmatter._ _See:
docs/.templates/DOC-FRONTMATTER-SCHEMA.md for schema details._
