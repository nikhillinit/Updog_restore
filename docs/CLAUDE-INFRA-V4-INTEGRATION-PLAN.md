# Claude Infrastructure v4 Optimal - Integration Plan

**Status**: PLANNED
**Created**: 2025-12-16
**Author**: Claude Code
**Branch**: `claude/review-infra-update-guides-TKm1S`

---

## Executive Summary

This plan integrates the `claude-infra-v4-optimal` package into the Updog_restore repository. The package introduces a **validator-diagnoser pattern** for CI quality gates, where deterministic scripts detect issues and specialized agents diagnose root causes.

### What's Being Added

| Category | New Components | Purpose |
|----------|---------------|---------|
| **CI Scripts** | `baseline-check.sh`, `validate-schema-drift.sh`, `bench-check.sh`, `validate-claude-infra.ts` | Quality gate validation |
| **Agents** | 5 new specialized agents | Diagnose CI failures |
| **Skills** | 6 new domain skills | Codified patterns and policies |
| **Baselines** | `.baselines/` directory | Ratcheting quality metrics |

### Architecture Pattern

```
CI Pipeline (Deterministic)         Agent Layer (Judgment)
┌─────────────────────┐            ┌─────────────────────┐
│ baseline-check.sh   │──fails──>  │ baseline-regression │
│                     │            │     -explainer      │
├─────────────────────┤            ├─────────────────────┤
│ validate-schema-    │──fails──>  │ schema-drift-       │
│     drift.sh        │            │     checker         │
├─────────────────────┤            ├─────────────────────┤
│ bench-check.sh      │──fails──>  │ perf-regression-    │
│                     │            │     triager         │
├─────────────────────┤            ├─────────────────────┤
│ validate-claude-    │──fails──>  │ (manual fix -       │
│     infra.ts        │            │  config only)       │
└─────────────────────┘            └─────────────────────┘
```

---

## Phase 1: Infrastructure Setup

### 1.1 Install Dependencies

```bash
npm i -D js-yaml @types/js-yaml tsx
```

**Rationale**: `js-yaml` provides robust YAML parsing for agent frontmatter validation; `tsx` is the modern TypeScript runner.

### 1.2 Create Directory Structure

```bash
mkdir -p .baselines
mkdir -p .claude/skills/test-pyramid
mkdir -p .claude/skills/statistical-testing
mkdir -p .claude/skills/react-hook-form-stability
mkdir -p .claude/skills/baseline-governance
mkdir -p .claude/skills/financial-calc-correctness
mkdir -p .claude/skills/claude-infra-integrity
```

### 1.3 Add npm Scripts to package.json

```json
{
  "scripts": {
    "validate:claude-infra": "tsx scripts/validate-claude-infra.ts",
    "validate:schema-drift": "./scripts/validate-schema-drift.sh",
    "baseline:check": "./scripts/baseline-check.sh",
    "baseline:update": "./scripts/baseline-check.sh --update all",
    "bench:check": "./scripts/bench-check.sh"
  }
}
```

---

## Phase 2: Add CI Quality Gate Scripts

### 2.1 Scripts to Add

| Script | Location | Purpose |
|--------|----------|---------|
| `baseline-check.sh` | `scripts/` | Test pass rate, TS errors, ESLint, bundle size |
| `validate-schema-drift.sh` | `scripts/` | Migration/Drizzle/Zod/Mock alignment |
| `validate-claude-infra.ts` | `scripts/` | .claude/ directory consistency |
| `bench-check.sh` | `scripts/` | Performance regression detection |

### 2.2 Initial Baseline Creation

After adding scripts, run once to establish baselines:

```bash
./scripts/baseline-check.sh --update all "Initial baseline from v4 integration"
git add .baselines/
```

### 2.3 Environment Variables

All scripts support these for CI compatibility:

| Variable | Default | Effect |
|----------|---------|--------|
| `USE_EMOJI` | `true` | Set to `false` for ASCII output in CI |
| `TEST_REPORTER` | `auto` | Force `vitest` or `jest` |
| `VERBOSE` | `false` | Show detailed output |

---

## Phase 3: Add New Skills

### 3.1 Skills to Add

| Skill | Directory | Purpose |
|-------|-----------|---------|
| `test-pyramid` | `.claude/skills/test-pyramid/` | E2E scope control, test level governance |
| `statistical-testing` | `.claude/skills/statistical-testing/` | Monte Carlo validation patterns |
| `react-hook-form-stability` | `.claude/skills/react-hook-form-stability/` | RHF loop prevention |
| `baseline-governance` | `.claude/skills/baseline-governance/` | Quality gate policies |
| `financial-calc-correctness` | `.claude/skills/financial-calc-correctness/` | Excel parity methodology |
| `claude-infra-integrity` | `.claude/skills/claude-infra-integrity/` | .claude/ consistency rules |

### 3.2 Integration with Existing Skills

The new skills complement existing Phoenix domain skills:
- `phoenix-precision-guard` + `financial-calc-correctness` - Numeric accuracy
- `phoenix-truth-case-orchestrator` + `statistical-testing` - Test validation
- `phoenix-waterfall-ledger-semantics` + `financial-calc-correctness` - Waterfall parity

---

## Phase 4: Add New Agents

### 4.1 Agents to Add

| Agent | File | Invoked By | Purpose |
|-------|------|------------|---------|
| `schema-drift-checker` | `.claude/agents/schema-drift-checker.md` | `db-migration`, `code-reviewer` | Diagnose schema alignment |
| `playwright-test-author` | `.claude/agents/playwright-test-author.md` | `test-repair` | Create E2E tests |
| `parity-auditor` | `.claude/agents/parity-auditor.md` | `waterfall-specialist`, `xirr-fees-validator` | Excel parity impact |
| `perf-regression-triager` | `.claude/agents/perf-regression-triager.md` | `perf-guard`, `code-reviewer` | Performance diagnosis |
| `baseline-regression-explainer` | `.claude/agents/baseline-regression-explainer.md` | `code-reviewer` | Quality metric diagnosis |

### 4.2 Agent Frontmatter Standard

All agents must follow this format:

```yaml
---
name: agent-name  # Must match filename
description: Brief description
model: sonnet  # or opus/haiku
tools: Read, Grep, Glob, Bash, Edit
skills: skill1, skill2
permissionMode: default
---
```

### 4.3 Update Existing Agents

**code-reviewer.md** - Add delegation patterns:

```markdown
## Quality Gate Failures

When CI validators fail, delegate to the appropriate diagnoser:

| If This Fails | Delegate To |
|---------------|-------------|
| `baseline-check.sh` | baseline-regression-explainer |
| `validate-schema-drift.sh` | schema-drift-checker |
| `bench-check.sh` | perf-regression-triager |
| Truth-case tests | parity-auditor |
```

**test-repair.md** - Add Playwright delegation:

```markdown
## Browser-Only Bug Detection

When bug only reproduces in real browser (not jsdom):
1. Delegate to `playwright-test-author` agent
2. Provide bug description and reproduction steps
3. Review returned test for data-testid usage
```

**db-migration.md** - Add schema drift check:

```markdown
## Post-Migration Verification

After applying any migration, if CI validator `validate-schema-drift.sh` fails:
1. Delegate to `schema-drift-checker` agent
2. Review the alignment report
3. Fix drift before completing migration task
```

---

## Phase 5: CI/CD Integration

### 5.1 GitHub Actions Workflow

Add to `.github/workflows/ci-unified.yml`:

```yaml
  quality-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dorny/paths-filter@v3
        id: changes
        with:
          filters: |
            claude:
              - '.claude/**'
              - 'scripts/validate-claude-infra.ts'
            code:
              - 'src/**'
              - 'server/**'
              - 'shared/**'
              - 'client/**'

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Baseline check
        if: steps.changes.outputs.code == 'true'
        run: ./scripts/baseline-check.sh
        env:
          USE_EMOJI: 'false'

      - name: Validate .claude infra
        if: steps.changes.outputs.claude == 'true'
        run: npm run validate:claude-infra
        env:
          USE_EMOJI: 'false'
```

### 5.2 Pre-commit Hook (Optional)

Add to `.git/hooks/pre-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Quick baseline check before commit
./scripts/baseline-check.sh
npm run validate:claude-infra
```

---

## Phase 6: Documentation Updates

### 6.1 CAPABILITIES.md Updates

Add under "## CI Validators":

```markdown
## CI Validators

| Validator Script | Detects | On Failure, Invoke |
|------------------|---------|-------------------|
| `baseline-check.sh` | Quality metric regression | baseline-regression-explainer |
| `validate-schema-drift.sh` | Schema layer misalignment | schema-drift-checker |
| `validate-claude-infra.ts` | .claude/ config errors | (manual fix) |
| `bench-check.sh` | Performance regression | perf-regression-triager |

## Specialized Diagnoser Agents

These agents are invoked by parent agents when CI validators detect issues:

### schema-drift-checker
Diagnoses alignment across migrations, Zod/Drizzle schemas, mocks, and tests.
**Trigger**: CI validator `validate-schema-drift.sh` fails

### playwright-test-author
Creates Playwright E2E tests for browser-only behaviors.
**Trigger**: Browser-only bug identified, jsdom limitations documented

### parity-auditor
Assesses impact of calculation changes on Excel parity and truth cases.
**Trigger**: Truth-case tests fail

### perf-regression-triager
Diagnoses performance regressions detected by bench-check.
**Trigger**: CI validator `bench-check.sh` fails

### baseline-regression-explainer
Diagnoses quality metric regressions detected by baseline-check.
**Trigger**: CI validator `baseline-check.sh` fails
```

### 6.2 docs/INDEX.md Updates

Add under "## Quality & CI":

```markdown
## Quality & CI

| Document | Description | When to Use |
|----------|-------------|-------------|
| [cheatsheets/baseline-governance.md](../cheatsheets/baseline-governance.md) | Quality gate policies | Updating baselines |
| [cheatsheets/test-pyramid.md](../cheatsheets/test-pyramid.md) | E2E test scope control | Adding E2E tests |
| [cheatsheets/ci-validator-guide.md](../cheatsheets/ci-validator-guide.md) | CI script usage | CI failures |
```

### 6.3 New Cheatsheets

Create the following cheatsheets:

| Cheatsheet | Purpose |
|------------|---------|
| `cheatsheets/baseline-governance.md` | When/how to update baselines |
| `cheatsheets/test-pyramid.md` | E2E admission criteria |
| `cheatsheets/ci-validator-guide.md` | CI script reference |
| `cheatsheets/schema-alignment.md` | Schema layer consistency |

### 6.4 CLAUDE.md Updates

Add under "## Essential Commands":

```markdown
### CI Quality Gates

- `npm run baseline:check` - Verify quality metrics against baseline
- `npm run baseline:update` - Update baselines (after approval)
- `npm run validate:claude-infra` - Validate .claude/ consistency
- `npm run validate:schema-drift` - Check schema layer alignment
- `npm run bench:check` - Run performance benchmarks
```

---

## Phase 7: Schema Drift Configuration

### 7.1 Configure Schema Mappings

Update `scripts/validate-schema-drift.sh` with project-specific mappings:

```bash
SCHEMA_MAPPINGS=(
  "funds:funds:fundSchema:createMockFund"
  "investors:investors:investorSchema:createMockInvestor"
  "transactions:transactions:transactionSchema:createMockTransaction"
  "commitments:commitments:commitmentSchema:createMockCommitment"
  "distributions:distributions:distributionSchema:createMockDistribution"
  "waterfall_tiers:waterfallTiers:waterfallTierSchema:createMockWaterfallTier"
)
```

### 7.2 Configure Directory Paths

```bash
MIGRATION_DIR="migrations"
DRIZZLE_DIR="server/db/schema"
ZOD_DIR="shared/schemas"
MOCK_DIR="server/tests/mocks"
```

---

## Implementation Order

### Step 1: Core Infrastructure (Day 1)
1. Install dependencies
2. Add scripts (baseline-check.sh, validate-claude-infra.ts)
3. Create .baselines/ with initial values
4. Add npm scripts to package.json

### Step 2: Skills (Day 1-2)
1. Create skill directories
2. Add SKILL.md files for all 6 skills

### Step 3: Agents (Day 2)
1. Add 5 new agent files
2. Update existing agents with delegation patterns

### Step 4: Documentation (Day 2-3)
1. Update CAPABILITIES.md
2. Update docs/INDEX.md
3. Create new cheatsheets
4. Update CLAUDE.md

### Step 5: CI/CD (Day 3)
1. Update GitHub Actions workflows
2. Test CI pipeline
3. Optional: Add pre-commit hooks

---

## Verification Checklist

- [ ] `npm run validate:claude-infra` passes
- [ ] `npm run baseline:check` passes
- [ ] All new agents have matching filename/name
- [ ] All agent skills references exist
- [ ] All cheatsheet links resolve
- [ ] CAPABILITIES.md lists all new agents
- [ ] CI workflow runs without errors

---

## Rollback Plan

If issues arise:

1. **Scripts failing**: Remove scripts from package.json, revert scripts/
2. **Baseline regression**: Delete .baselines/, skip baseline checks
3. **Agent issues**: Remove agent files, revert delegation changes

---

## Related Documents

- [CAPABILITIES.md](../CAPABILITIES.md) - Capability inventory
- [DECISIONS.md](../DECISIONS.md) - Architecture decisions
- [CHANGELOG.md](../CHANGELOG.md) - Change history
- [cheatsheets/pr-merge-verification.md](../cheatsheets/pr-merge-verification.md) - Current test baseline
