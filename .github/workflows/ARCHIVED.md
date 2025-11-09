# Archived CI/CD Workflows

**Date Archived:** 2025-11-09 **Reason:** CI/CD rationalization - reduced 57 →
15 essential workflows **Archived Count:** 42 workflows **Retention:**
Indefinite (archived, not deleted)

---

## Rationale

This project accumulated 57 GitHub Actions workflows over time, creating
maintenance burden and slowing CI/CD feedback loops. This rationalization keeps
15 essential quality and security gates while archiving 42 experimental,
duplicate, or redundant workflows.

### Kept (15 Essential Workflows)

**Quality Gates (9):**

- `ci-unified.yml` - Primary PR/push CI pipeline
- `code-quality.yml` - ESLint + format checks
- `bundle-size-check.yml` - Bundle size regression detection
- `performance-gates.yml` - Performance threshold validation
- `docs-validate.yml` - Documentation validation
- `dependency-validation.yml` - Dependency safety checks
- `test.yml` - Core test suite execution
- `pr-tests.yml` - PR-specific test validation
- `validate.yml` - General validation checks

**Security Gates (6):**

- `codeql.yml` - GitHub code scanning (SAST)
- `security-scan.yml` - Security vulnerability scan
- `security-tests.yml` - Security test suite
- `zap-baseline.yml` - OWASP ZAP security testing
- `dockerfile-lint.yml` - Dockerfile security linting
- `sidecar-windows.yml` - Windows sidecar validation (critical for build)

---

## Archived Workflows (42)

### Experimental Frameworks (15 workflows)

**Guardian System (3 files)** - Experimental canary deployment system

- `guardian.yml` - Main guardian workflow
- `guardian-complete.yml` - Complete guardian checks
- `guardian-ttl-mute.yml` - TTL-based alert muting

**Quarantine System (2 files)** - Experimental test quarantine framework

- `quarantine-check.yml` - Quarantine validation
- `quarantine-nightly.yml` - Nightly quarantine sweep

**Green Scoreboard (2 files)** - Experimental quality tracking dashboard

- `green-scoreboard.yml` - Main scoreboard workflow
- `green-scoreboard-complete.yml` - Complete scoreboard checks

**Progressive Automation (8 files)** - Experimental quality improvement
automation

- `ci-breaker.yml` - Breaking change detection
- `ci-hygiene.yml` - Code hygiene checks
- `ci-memory.yml` - Memory usage monitoring
- `ci-reserves-v11.yml` - Version-specific reserves validation
- `memory-mode.yml` - Memory testing mode
- `progressive-strictness.yml` - Incremental strictness enforcement
- `promote-eslint.yml` - ESLint rule promotion
- `stub-expiry.yml` - Test stub expiration tracking

---

### Redundant Performance (3 workflows)

**Superseded by `performance-gates.yml`:**

- `perf-baseline.yml` - Performance baseline tracking
- `perf-budget.yml` - Performance budget enforcement
- `perf-smoke.yml` - Performance smoke tests

**Rationale:** Consolidated into single `performance-gates.yml` workflow

---

### Deployment & Environment (8 workflows)

**Environment-Specific Deployments:**

- `deploy-ga.yml` - Deploy to general availability
- `deploy-production.yml` - Production deployment
- `deploy-staging.yml` - Staging deployment
- `staging-monitor.yml` - Staging environment monitoring

**Post-Deployment Validation:**

- `post-deploy-attestation.yml` - Post-deploy verification
- `post-merge-validation.yml` - Post-merge checks
- `readiness-probe.yml` - Readiness health checks

**Migration Orchestration:**

- `migration-orchestrator.yml` - Database migration orchestration

**Rationale:** Deployment now handled via Vercel platform, not GitHub Actions

---

### Automation & Monitoring (6 workflows)

**AI/Automation Experiments:**

- `ai-code-review.yml` - AI-powered code review
- `ai-foundation.yml` - AI foundation testing
- `auto-label.yml` - Automatic PR labeling

**Scheduled Monitoring:**

- `bmad-weekly.yml` - Weekly BMAD reports
- `maintenance.yml` - Scheduled maintenance tasks
- `slack-regression-guard.yml` - Slack notification experiments

**Rationale:** Manual code review preferred; monitoring consolidated elsewhere

---

### Synthetics & Testing (4 workflows)

**Synthetic Monitoring:**

- `synthetic.yml` - Synthetic monitoring baseline
- `synthetics-5m.yml` - 5-minute synthetic tests
- `synthetics-e2e.yml` - E2E synthetic tests
- `synthetics-smart.yml` - Smart synthetic test selection

**Rationale:** Replaced by production monitoring and E2E tests in `test.yml`

---

### Platform-Specific (2 workflows)

**Linux Build Validation:**

- `linux-build-validation.yml` - Linux-specific build checks

**Stage Normalization:**

- `stage-normalization-ci.yml` - Stage normalization validation

**Rationale:** Cross-platform builds validated in `ci-unified.yml`

---

### Config & Contract Validation (2 workflows)

**API Contract Testing:**

- `contract-ci.yml` - Contract testing validation
- `openapi-diff.yml` - OpenAPI schema diff checking

**Runtime Configuration:**

- `validate-runtime-config.yml` - Runtime config validation

**Rationale:** Contract validation moved to unit tests; config validation in CI

---

### Demo & Specialized CI (2 workflows)

- `demo-ci.yml` - Demo environment CI
- `contract-ci.yml` - Specialized contract CI

**Rationale:** Demo deployments handled separately; contract tests in unit tests

---

## How to Restore a Workflow

If you need to restore an archived workflow:

```bash
# Copy workflow back to active directory
cp .github/workflows/archive/[workflow-name].yml .github/workflows/

# Commit the restoration
git add .github/workflows/[workflow-name].yml
git commit -m "chore(ci): restore [workflow-name] workflow"
```

---

## Workflow Removal Guidelines

**When to archive a workflow:**

- ✅ Experimental feature no longer being developed
- ✅ Duplicate functionality (covered by another workflow)
- ✅ Superseded by consolidated workflow
- ✅ Platform migration (e.g., GitHub Actions → Vercel)
- ✅ Low value / high maintenance burden

**When to keep a workflow:**

- ✅ Essential quality gate (blocks bad code)
- ✅ Security scanning (SAST, DAST, dependency checks)
- ✅ Performance regression prevention
- ✅ Platform-critical (Windows sidecar validation)

---

## Metrics

**Before Rationalization:**

- Total workflows: 57
- Average CI runtime: ~12 minutes
- Workflow maintenance burden: High

**After Rationalization:**

- Active workflows: 15
- Archived workflows: 42
- Expected CI runtime: ~6-8 minutes (estimated)
- Workflow maintenance burden: Low

**Reduction:** 73.7% (42/57 workflows archived)

---

## See Also

- **Active Workflows:** `.github/workflows/` (15 files)
- **CLAUDE.md:** Updated workflow count documentation
- **Phase 3 Handoff:** `HANDOFF-PHASE3-COMPACTION.md`

---

**Last Updated:** 2025-11-09 **Maintained By:** Press On Ventures Engineering
Team
