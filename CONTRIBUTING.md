# Contributing to Updog

Thanks for improving the project! This doc explains how to set up your environment, what quality bars apply, and how to ship small, safe changes.

## Quick Start

```bash
# Node 20.19.0+ is required (see .nvmrc)
node --version  # Should be v20.19.0+

# Install dependencies
npm ci

# Verify setup
npm run check          # TypeScript type checking
npm test               # Fast unit tests
npm run test:parity    # Golden dataset parity check (requires csv-parse)
# npm run test:perf:smoke  # Performance smoke test (optional, requires running server)
```

## Branching & Pull Requests

### Trunk-Based Development
- Branch from `main` for all changes
- Open a PR early (mark as draft if work-in-progress)
- Keep PRs **≤ 400 LOC changed** (excluding snapshots/fixtures/golden datasets)
- Link to ADR-0001 in PR description (see `docs/adrs/0001-iteration-a-deterministic-engine.md`)

### PR Template
All PRs must include:
1. **Summary:** What changed and why
2. **ADR Link:** Reference to ADR-0001 (Iteration-A scope)
3. **Checklist:** Typecheck ✅, Lint ✅, Tests ✅, Parity ✅
4. **Golden Dataset Changes:** If outputs changed, explain why

See `.github/pull_request_template.md` for the full template.

---

## Required CI Checks (PR-Blocking)

These checks **MUST PASS** before merging to `main`:

### 1. TypeCheck (Fail-Fast)
```bash
npm run check  # or: npx tsc --noEmit
```

- **Enforcement:** TypeScript `strict` mode
- **Target:** Zero errors (not warnings)
- **Context:** We had 695 errors as of Oct 12, 2025. Goal is zero before Iteration-A ships.

**Pre-commit Hook:** Install Husky hooks to catch errors early:
```bash
npx husky install
```

---

### 2. Lint (Zero Warnings)
```bash
npm run lint  # ESLint + Prettier
```

- **Enforcement:** `--max-warnings=0`
- **Auto-fix:** `npm run lint:fix`
- **Standards:**
  - `noUnusedLocals`, `noUnusedParameters` enabled
  - Conventional commit messages appreciated (`feat:`, `fix:`, `chore:`)

---

### 3. Unit & Integration Tests
```bash
npm test  # or: npm run test:unit
```

- **Fast tests only:** Unit and fast integration tests
- **Current Status:** 64.5% pass rate (560/869 tests) as of Oct 12, 2025
- **Goal:** 95%+ pass rate before Iteration-A ships
- **Quarantine:** Flaky tests go in `*.flaky.test.ts` (run nightly, not in PRs)

**Test Organization:**
- `tests/unit/` - Fast, isolated unit tests
- `tests/integration/` - API and database integration tests
- `tests/parity/` - Golden dataset parity tests (Excel comparison)
- `tests/quarantine/` - Known flaky or broken tests

---

### 4. Golden Dataset Parity
```bash
npm run test:parity
```

- **What it checks:** XIRR, TVPI, DPI calculations vs Excel outputs
- **Tolerance:** ±1e-6 (0.000001) - financial accuracy standard
- **Golden Datasets:** Located in `tests/parity/golden/`
  - `seed-fund-basic.csv` - Input cashflows
  - `seed-fund-basic.results.csv` - Expected Excel results

**Changing Golden Datasets:**
1. Golden datasets are **semantic fixtures** (like code)
2. Changes require PR with clear justification
3. Use `npm run generate:golden:reserve` to regenerate if needed
4. Review diff carefully - parity drift indicates bugs

**Expected Results (seed-fund-basic):**
- XIRR: -0.062418
- TVPI: 0.875000
- DPI: 0.125000

---

### 5. Performance Smoke Test (Optional for Now)
```bash
# Requires server running on port 3001
npm run test:perf:smoke
```

- **Budget:** p95 < 800ms for reserve calculation (100 companies, 40 quarters)
- **Status:** Not yet enforced (advisory)
- **Future:** Will become PR-blocking after Week 3-4

---

## Golden Datasets (Critical for Parity)

### What Are Golden Datasets?
Golden datasets are **curated test scenarios** with Excel-calculated expected results. They serve as the "source of truth" for financial calculation accuracy.

### Location
- **Inputs:** `tests/parity/golden/*.csv` (cashflow data)
- **Expected Outputs:** `tests/parity/golden/*.results.csv` (Excel-calculated XIRR/TVPI/DPI)
- **Documentation:** `tests/parity/golden/README.md`

### Committing Golden Files
Golden datasets are committed to Git like code:
```bash
git add tests/parity/golden/my-scenario.csv
git add tests/parity/golden/my-scenario.results.csv
git commit -m "feat(parity): add my-scenario golden dataset

This scenario covers [explain edge case or use case].
Expected XIRR: [value], TVPI: [value], DPI: [value]"
```

### Changing Golden Files (Product Decision)
Changing a golden file means changing what "correct" means. This requires:
1. Clear explanation in PR body ("why is Excel output changing?")
2. Review by at least one core maintainer
3. Verification that change is intentional (not a bug)

### Generating New Golden Datasets
```bash
# 1. Create input CSV
cat > tests/parity/golden/my-scenario.csv << EOF
date,amount
2023-01-01,-10000000
2024-12-31,12000000
EOF

# 2. Calculate expected results in Excel
# Use XIRR(), compute TVPI/DPI manually
# Save to my-scenario.results.csv

# 3. Verify parity
npm run test:parity
```

---

## Flaky Tests & Quarantine

### What Is a Flaky Test?
A test that **sometimes passes, sometimes fails** with no code changes. Common causes:
- Timing dependencies (setTimeout, race conditions)
- External dependencies (network, file system)
- Test interdependence (one test affects another)

### Quarantine Process
1. **Identify:** Test fails intermittently in CI
2. **Mark:** Rename file to `*.flaky.test.ts`
3. **File Issue:** Create GitHub issue with failure logs
4. **Nightly Run:** Flaky tests run nightly to track stability
5. **Fix or Delete:** Within 30 days, either fix the test or delete it

**CI Behavior:**
- PR runs: Ignore `*.flaky.test.ts` files
- Nightly runs: Execute all `*.flaky.test.ts` files
- Main branch: Flaky tests don't block merges

**Example:**
```bash
# Before (flaky test blocking PRs)
mv tests/unit/flaky-test.test.ts tests/unit/flaky-test.flaky.test.ts

# After (runs nightly, doesn't block PRs)
git commit -m "test: quarantine flaky-test (issue #123)"
```

---

## Coding Standards

### TypeScript
- **Strict mode:** Enabled in all `tsconfig.json` files
- **No implicit any:** All parameters must have explicit types
- **No unused code:** Enable `noUnusedLocals`, `noUnusedParameters`
- **Type safety bypasses:** Avoid `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`
  - **Current status:** 19 bypasses as of Oct 12, 2025
  - **Goal:** Zero bypasses (or documented exceptions)

### Engine Logic (Financial Calculations)
- **Pure functions:** Avoid side effects and mutable state
- **Decimal precision:** Use `decimal.js` for all monetary calculations
  - JavaScript `number` is FORBIDDEN for engine math (floating-point errors)
  - Tolerance: 1e-6 for XIRR/TVPI/DPI
- **Determinism:** Same inputs MUST produce same outputs (bitwise equality after rounding)
- **Invariants:** All 8 invariants (ADR-0001) must hold on every run

**Example (Bad):**
```typescript
// ❌ WRONG: JavaScript number has floating-point errors
const tvpi = (distributions + nav) / contributions;  // 0.1 + 0.2 = 0.30000000000000004
```

**Example (Good):**
```typescript
// ✅ CORRECT: Decimal.js for exact arithmetic
import Decimal from 'decimal.js';
const tvpi = new Decimal(distributions)
  .plus(nav)
  .dividedBy(contributions)
  .toNumber();  // 0.1 + 0.2 = 0.3 (exact)
```

### Test Coverage
- **Add tests for branches:** Every `if/else` in engine code needs a test
- **Property-based testing:** Use `fast-check` for invariant validation
- **Golden datasets:** High-value integration tests (Excel parity)

**Example (Property-Based Test):**
```typescript
import fc from 'fast-check';

test('Invariant 1: Non-negativity', () => {
  fc.assert(
    fc.property(
      fc.record({ fundSize: fc.nat(), ... }), // Arbitrary valid inputs
      (inputs) => {
        const results = runEngine(inputs);
        return results.every(p => p.nav >= 0 && p.contributions >= 0);
      }
    )
  );
});
```

---

## Commit Messages

We appreciate (but don't require) [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(engine): add net MOIC to timeline output
fix(ci): enforce parity gate after unit tests
chore(docs): add ADR-0001 for Iteration-A scope
test(parity): add complex waterfall golden dataset
```

**Format:**
- `feat:` - New feature
- `fix:` - Bug fix
- `chore:` - Maintenance (deps, config, docs)
- `test:` - Test-only changes
- `refactor:` - Code restructuring (no behavior change)
- `perf:` - Performance improvement

---

## Useful Scripts

### Development
```bash
npm run dev              # Start full dev environment (client + server on port 5000)
npm run dev:client       # Frontend only (Vite dev server)
npm run dev:api          # Backend API only (Express with hot reload)
```

### Testing
```bash
npm test                 # Fast unit tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests (requires database)
npm run test:parity      # Golden dataset parity check
npm run test:flaky       # Run quarantined flaky tests
npm run test:ui          # Tests with interactive Vitest UI
```

### Quality Checks
```bash
npm run check            # TypeScript type checking (all projects)
npm run check:client     # Client-only type check
npm run check:server     # Server-only type check
npm run lint             # ESLint + Prettier
npm run lint:fix         # Auto-fix linting issues
```

### Database
```bash
npm run db:push          # Push Drizzle schema changes to database
npm run db:studio        # Open Drizzle Studio (database GUI)
```

### Parity & Golden Datasets
```bash
npm run generate:golden:reserve  # Regenerate golden datasets (maintainers only)
npm run parity                   # Alias for test:parity
```

### Build & Deploy
```bash
npm run build            # Production build (frontend + backend)
npm run build:web        # Frontend build only
```

---

## Security

### Dependency Management
- **Dependabot:** Enabled for automated security updates
- **Monthly review:** Check `npm audit` output
- **No secrets in code:** Use environment variables or repository secrets

**Check vulnerabilities:**
```bash
npm audit                # Check for known vulnerabilities
npm audit fix            # Auto-fix non-breaking issues
npm audit fix --force    # Fix breaking issues (review changes)
```

**Current Status (Oct 12, 2025):**
- 3 HIGH severity (path-to-regexp ReDoS) - **MITIGATED via overrides**
- 6 Dependabot PRs pending (10 days old)

### Secrets Management
- **Local:** Use `.env.local` (never commit)
- **CI:** Use GitHub repository secrets
- **Production:** Use environment variables or secrets manager

---

## Releasing (Maintainers Only)

### Merge to Main
1. All CI checks green ✅
2. At least one approving review
3. No unresolved comments
4. Linked to ADR-0001 or relevant issue

### Creating a Release
```bash
# 1. Update version in package.json
npm version minor  # or: major, patch

# 2. Create release tag
git tag -a v1.4.0 -m "Release v1.4.0: Iteration-A MVP

- Zero TypeScript errors
- 95%+ test pass rate
- Golden dataset parity enforced
- Performance budgets met"

# 3. Push tag
git push origin v1.4.0

# 4. GitHub Actions will build and attach artifacts
```

---

## Getting Help

### Documentation
- **ADR-0001:** Iteration-A scope and invariants (`docs/adrs/0001-iteration-a-deterministic-engine.md`)
- **STRATEGY-SUMMARY:** Original 2-week plan (archived, superseded by ADR-0001)
- **VALIDATION_CONSENSUS:** Multi-agent validation report (Oct 12, 2025)
- **README.md:** Project overview and setup

### Communication
- **GitHub Issues:** Bug reports, feature requests
- **Pull Requests:** Code review and discussion
- **ADR Comments:** Strategic questions and scope clarification

### Common Issues
- **TypeScript errors:** See `VALIDATION_CONSENSUS_2025-10-12.md` Section 2
- **Test failures:** See `VALIDATION_CONSENSUS_2025-10-12.md` Section 3
- **CI failures:** See `VALIDATION_CONSENSUS_2025-10-12.md` Section 4
- **Parity mismatches:** Check `tests/parity/golden/README.md`

---

## Current Project Status (Oct 12, 2025)

### Reality Check
- **Completion:** 50-60% (not 85-95% previously claimed)
- **TypeScript errors:** 695 (goal: 0)
- **Test pass rate:** 64.5% (goal: 95%+)
- **Engine integration:** 33% (2/6 engines wired to UI)
- **Timeline:** 4-6 weeks realistic (not 2-4 weeks)

See `VALIDATION_CONSENSUS_2025-10-12.md` for full multi-agent validation report.

### Priorities (Week 1-2)
1. Fix 695 TypeScript errors (70-98 hours estimated)
2. Stabilize test suite to 95%+ pass rate (8-15 hours)
3. Fix CI/CD critical failures (12-20 hours)
4. Complete engine-UI wiring for in-scope engines (15-20 hours)

**Total Estimated Effort:** 105-153 hours (13-19 business days)

---

## Questions?

If anything is unclear, please:
1. Check the ADR (`docs/adrs/0001-iteration-a-deterministic-engine.md`)
2. Review validation consensus (`VALIDATION_CONSENSUS_2025-10-12.md`)
3. Ask in GitHub issues or PR comments

Thank you for contributing to Updog! 🚀
