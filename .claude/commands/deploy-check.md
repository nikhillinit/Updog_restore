---
description: Comprehensive pre-deployment validation (build, bundle, smoke tests, idempotency)
---

# Deploy Check - Pre-Deployment Validation

Run comprehensive validation before deployment to catch issues early.

## Validation Phases

### Phase 1: Code Quality (Parallel)

Run these checks in parallel for speed:

```bash
# Type checking
npm run check

# Linting
npm run lint

# Test suite
npm test
```

**Pass Criteria:**
- [x] Zero TypeScript errors (or all baselined)
- [x] Zero lint errors
- [x] 100% test pass rate

### Phase 2: Build Validation

```bash
# Clean build
rm -rf dist/
npm run build
```

**Checks:**
- [x] Build completes without errors
- [x] No warnings about missing dependencies
- [x] All entry points generated
- [x] Source maps created

### Phase 3: Bundle Analysis

Suggest invoking **perf-guard agent** to analyze bundle:

- [x] Total bundle size within limits (<500 KB target)
- [x] No unexpected size regressions (>15% increase)
- [x] Code splitting working correctly
- [x] No duplicate dependencies

### Phase 4: Smoke Tests

Run critical path tests:

```bash
# API health check
npm run dev:api &
sleep 5
curl http://localhost:5000/api/health
kill %1

# Frontend build serves
cd dist/
python -m http.server 8080 &
sleep 2
curl http://localhost:8080
kill %1
```

**Checks:**
- [x] API starts without errors
- [x] Health endpoint responds
- [x] Frontend bundle serves correctly
- [x] No console errors on load

### Phase 5: Database Schema Sync

Suggest invoking **db-migration agent** to verify:

- [x] Schema matches TypeScript types
- [x] No pending migrations
- [x] All foreign keys valid
- [x] Indexes in place for critical queries

### Phase 6: Environment Check

```bash
# Check required env vars documented
grep -r "process.env" server/ client/ | cut -d: -f2 | sort -u

# Compare against .env.example
diff <(sort .env.example) <(sort .env.local)
```

**Checks:**
- [x] All `process.env` usages documented in `.env.example`
- [x] No hardcoded secrets in codebase
- [x] Environment-specific configs properly abstracted

### Phase 7: Dependency Audit

```bash
# Check for vulnerabilities
npm audit --production

# Check for outdated critical deps
npm outdated --depth=0
```

**Checks:**
- [x] No high/critical vulnerabilities in production deps
- [x] No severely outdated major versions
- [x] License compliance (no GPL in production if needed)

### Phase 8: Git Status

```bash
# Check for uncommitted changes
git status --porcelain

# Check current branch
git branch --show-current

# Check remote sync
git fetch origin
git status
```

**Checks:**
- [x] No uncommitted changes (or document intentional)
- [x] On correct branch for deployment
- [x] Up to date with remote
- [x] All tests passing on CI (check GitHub Actions)

## Deployment Readiness Report

```
+----------------------------------------------------------+
|           DEPLOYMENT READINESS REPORT                    |
+----------------------------------------------------------+
|                                                          |
| [PASS] Phase 1: Code Quality                             |
|    +-- TypeScript: 0 errors                              |
|    +-- Linting: 0 errors                                 |
|    +-- Tests: 127 passed                                 |
|                                                          |
| [PASS] Phase 2: Build Validation                         |
|    +-- Build completed in 24.3s                          |
|                                                          |
| [PASS] Phase 3: Bundle Analysis                          |
|    +-- Total: 412 KB (baseline: 398 KB, +3.5%)           |
|    +-- Vendor: 285 KB                                    |
|    +-- App: 127 KB                                       |
|                                                          |
| [PASS] Phase 4: Smoke Tests                              |
|    +-- API health: 200 OK                                |
|    +-- Frontend serves: 200 OK                           |
|                                                          |
| [PASS] Phase 5: Database Schema                          |
|    +-- Schema in sync                                    |
|                                                          |
| [PASS] Phase 6: Environment Check                        |
|    +-- All env vars documented                           |
|                                                          |
| [WARN] Phase 7: Dependency Audit                         |
|    +-- 2 moderate vulnerabilities (non-blocking)         |
|    +-- 1 package 2 major versions behind                 |
|                                                          |
| [PASS] Phase 8: Git Status                               |
|    +-- Clean working tree, synced with origin            |
|                                                          |
+----------------------------------------------------------+
| DEPLOYMENT READY                                         |
|                                                          |
| Minor warnings present but non-blocking.                 |
| Safe to proceed with deployment.                         |
+----------------------------------------------------------+
```

## Fast Mode

For quick validation, run minimal checks:

```bash
npm run check && npm run lint && npm run test:quick && npm run build
```

## Integration

This command coordinates with:
- **perf-guard agent**: Bundle analysis (Phase 3)
- **db-migration agent**: Schema validation (Phase 5)
- **test-repair agent**: If test failures detected (Phase 1)

## Failure Handling

**Critical Failures** (BLOCK deployment):
- Build errors
- Test failures
- Type errors (unless baselined)
- High/Critical security vulnerabilities

**Warnings** (REVIEW but don't block):
- Moderate vulnerabilities
- Outdated dependencies (minor versions)
- Bundle size increases <15%
- Uncommitted changes (if intentional)

## Performance

- **Target runtime**: <5 minutes for full validation
- **Parallel execution**: Phase 1 checks run concurrently
- **Fast mode**: <2 minutes (skips smoke tests, audits)

## Notes

- Run before every deployment to production
- Can be run locally or in CI/CD pipeline
- Generates deployment readiness report
- Suggests remediation for failures
