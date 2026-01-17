# Test Remediation Findings

## Discovery Summary (2026-01-16)

### Quantitative Analysis
- **Total skipped tests**: 113
- **Files with skips**: 51
- **Documented quarantines**: 5
- **Undocumented quarantines**: 54 files (90 skips)
- **Test-related TODOs/FIXMEs**: 42

### Category Breakdown

#### 1. E2E Runtime Preconditions (28 skips)
Files: `tests/e2e/performance.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/navigation-and-routing.spec.ts`
Root cause: Tests skip when auth not available or fund not configured
Fix approach: Improve test fixtures, ensure proper setup in beforeAll

#### 2. Monte Carlo Stochastic Tests (13 skips)
File: `tests/unit/engines/monte-carlo-orchestrator.test.ts`
Root cause: Phase 2 Monte Carlo not complete, stochastic mode not deterministic
Fix approach: Complete Phase 2 OR mock randomness with seeded generators

#### 3. Infrastructure Dependencies (12 skips)
Files: `tests/middleware/idempotency-dedupe.test.ts`, `tests/integration/circuit-breaker-db.test.ts`
Root cause: Require Redis/PostgreSQL not available in demo CI
Fix approach: Use ioredis-mock, implement proper DI for storage layer

#### 4. Time-Travel API Middleware (13 skips)
File: `tests/unit/api/time-travel-api.test.ts`
Root cause: Middleware dependencies not mockable
Fix approach: Refactor to dependency injection pattern

#### 5. XIRR Solver Edge Cases (4 skips)
Files: `tests/unit/xirr-golden-set.test.ts`, `tests/unit/analytics-xirr.test.ts`
Root cause: Newton-Raphson diverges on extreme returns (10x in 6 months)
Fix approach: Implement Brent's method fallback, improve initial guess

#### 6. Flaky Monte Carlo Validation (3 describe blocks)
Files: `tests/unit/services/monte-carlo-power-law-*.test.ts`
Root cause: Statistical tests sensitive to random seed
Fix approach: Use seeded PRNG, increase tolerance, or snapshot testing

#### 7. AI-Enhanced Components (6 skips)
File: `tests/unit/components/ai-enhanced-components.test.tsx`
Root cause: Advanced component testing patterns not implemented
Fix approach: Add proper mocks for AI service calls

### Technical Decisions

| Topic | Decision | Alternatives Considered |
|-------|----------|------------------------|
| Redis mocking | Use ioredis-mock | Real Redis in CI, custom mock |
| XIRR fallback | Brent's method | Bisection, secant method |
| Monte Carlo seeds | Deterministic seeded PRNG | Snapshot testing, wider tolerances |

### Resources Consulted
- `tests/quarantine/REPORT.md` - Auto-generated quarantine report
- `tests/README.md` - 542-line testing guide
- `cheatsheets/test-pyramid.md` - Test organization guidelines
- `vitest.config.ts` - Test configuration details
