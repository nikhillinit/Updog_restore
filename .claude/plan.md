# Technical Debt Remediation Plan

**Generated:** 2025-12-29
**Branch:** `claude/identify-tech-debt-ucn56`

## Executive Summary

A comprehensive analysis of the codebase identified **60+ significant technical debt items** across 6 domains. This plan prioritizes the most impactful issues by severity and effort.

---

## Critical Findings by Domain

### 1. Server-Side (10 items)
- **50+ files** disable `@typescript-eslint/no-explicit-any`
- Monolithic `routes.ts` (857 lines)
- Cross-boundary import violation (server imports from client)
- 627 console.log calls instead of structured logging

### 2. Client-Side (10 items)
- **100+ files** with `any` type usage
- Large monolithic components (up to 1,205 lines)
- Missing useEffect dependencies causing stale closures
- Only 106 ARIA attributes across 28 files (accessibility gap)

### 3. Shared Types (10 items)
- **6 conflicting StageSchema definitions** with incompatible enums
- Duplicate `ReserveInputSchema` with entirely different structures
- Missing Zod validation for interface-only types
- Inconsistent decimal/number handling for financial values

### 4. Test Suite (10 items)
- **92% API routes untested** (34/37 routes lack tests)
- ~45 skipped tests across the suite
- Entire test suites in skip state (AI components, snapshots)
- Flaky Monte Carlo tests marked skip instead of fixed

### 5. Configuration (10 items)
- 18 GitHub workflows with significant duplication
- Hardcoded database credentials in Docker Compose
- Permissive TypeScript configs bypass strict mode
- Node.js version mismatch in CI (tests 18.x, requires 20.19+)

### 6. Architecture (10 items)
- **Triple XIRR/IRR implementation** with different algorithms
- Layer violation: server imports from client
- Dual fund calculation engines (v1 and v2 coexist)
- Two server entry points with different route registrations

---

## Priority 1: Security & Correctness (Immediate)

| Issue | Location | Impact |
|-------|----------|--------|
| Missing security middleware on portfolio-intelligence routes | `server/routes/portfolio-intelligence.ts` | Security vulnerability |
| Hardcoded DB passwords in Docker | `docker-compose*.yml` | Credential exposure |
| Triple XIRR implementation (different day-counts) | `client/src/lib/xirr.ts`, `finance/xirr.ts`, `irr.ts` | Financial calculation drift |
| 6 conflicting StageSchema definitions | `shared/schemas.ts`, `reserves-schemas.ts`, etc. | Data integrity |
| Duplicate ReserveInputSchema | `shared/schemas.ts:32`, `shared/types.ts:89` | Runtime errors |

**Estimated effort:** 2-3 days

---

## Priority 2: Type Safety (High Impact)

| Issue | Scope | Impact |
|-------|-------|--------|
| 50+ server files with `any` | `/server/**/*.ts` | Type safety loss |
| 100+ client files with `any` | `/client/**/*.ts` | Runtime bugs |
| Storage interface uses `any` | `server/storage.ts:38-40` | Data layer unsafe |
| WebSocket handlers untyped | `server/websocket.ts:58-148` | Event handling unsafe |
| 542 `as any` assertions | 170 files | Bypassed type checking |

**Estimated effort:** 1-2 weeks (incremental)

---

## Priority 3: Architecture & Structure (Medium-Term)

| Issue | Location | Suggested Fix |
|-------|----------|---------------|
| Server imports from client | `server/routes.ts:17-23` | Move engines to `/shared/core/` |
| Monolithic routes.ts (857 lines) | `server/routes.ts` | Split into modular route files |
| Dual fund-calc engines | `fund-calc.ts`, `fund-calc-v2.ts` | Complete v2 migration, remove v1 |
| Two server entry points | `server/app.ts`, `server/server.ts` | Consolidate to single entry |
| Large components (>500 lines) | 6 components | Extract into composable pieces |

**Estimated effort:** 1-2 weeks

---

## Priority 4: Test Coverage (Critical Gaps)

| Gap | Current State | Target |
|-----|---------------|--------|
| API route coverage | 3/37 routes tested | All critical routes |
| Skipped AI component tests | 19 tests skipped | Unskip and fix |
| Snapshot service tests | TDD RED phase stuck | Complete implementation |
| Reallocation API tests | Requires real DB | Add Testcontainers |
| Integration tests excluded | Not in CI | Create dedicated job |

**Estimated effort:** 2-3 weeks

---

## Priority 5: Configuration & CI (Maintenance)

| Issue | Fix |
|-------|-----|
| Duplicate CI workflows | Consolidate to single `ci.yml` |
| Permissive tsconfig files | Remove `tsconfig.build.json`, `tsconfig.ignore.json` |
| Node.js 18.x in test matrix | Update to 20.x, 22.x only |
| PostgreSQL version drift | Standardize on `postgres:16-alpine` |
| 637 console.log in server | Replace with structured logger |

**Estimated effort:** 3-5 days

---

## Priority 6: Documentation & Cleanup (Low Priority)

| Issue | Action |
|-------|--------|
| 50+ TODO/FIXME comments | Convert to GitHub issues |
| Backup files in repo | Delete `lp-api.ts.backup` |
| Deprecated code still in use | Remove or migrate |
| Missing JSDoc on public APIs | Add documentation |
| Accessibility gaps | Add ARIA attributes |

**Estimated effort:** Ongoing

---

## Quick Wins (Can Do This Week)

1. **Delete backup file:** `server/routes/lp-api.ts.backup`
2. **Rename duplicate schema:** `ReserveInputSchema` -> `ReserveAllocationInputSchema` / `ReserveCompanyInputSchema`
3. **Fix sourcemap config:** `vite.config.ts:314` - remove always-true conditional
4. **Pin pgAdmin version:** `docker-compose.yml:44`
5. **Add security middleware:** Portfolio-intelligence routes

---

## Recommended Sprint Plan

### Sprint 1 (Immediate)
- [ ] Fix security middleware on portfolio-intelligence routes
- [ ] Create canonical StageSchema, update all references
- [ ] Rename duplicate ReserveInputSchema definitions
- [ ] Replace hardcoded Docker passwords with env vars
- [ ] Delete backup files

### Sprint 2 (Type Safety)
- [ ] Type storage.ts interface methods
- [ ] Type WebSocket event handlers
- [ ] Enable strict mode incrementally (file by file)
- [ ] Add Zod schemas for interface-only types

### Sprint 3 (Architecture)
- [ ] Move core engines to shared package (Issue #309)
- [ ] Split monolithic routes.ts
- [ ] Consolidate XIRR implementations
- [ ] Complete fund-calc v2 migration

### Sprint 4 (Testing)
- [ ] Add tests for critical API routes
- [ ] Unskip AI component tests
- [ ] Complete SnapshotService implementation
- [ ] Set up Testcontainers for integration tests

---

## Files Requiring Immediate Attention

| File | Issue | Priority |
|------|-------|----------|
| `server/routes/portfolio-intelligence.ts` | Missing security middleware | P0 |
| `shared/schemas.ts` | Conflicting StageSchema | P1 |
| `shared/types.ts` | Duplicate ReserveInputSchema | P1 |
| `docker-compose.yml` | Hardcoded credentials | P1 |
| `client/src/lib/xirr.ts` | Duplicate XIRR | P1 |
| `server/routes.ts:17-23` | Layer violation | P2 |
| `server/storage.ts:38-40` | `any` in interface | P2 |

---

## Metrics to Track

- TypeScript errors blocked by baseline: Currently ~45
- Files with `eslint-disable no-explicit-any`: 150+
- Test coverage percentage: Track with Vitest
- Skipped tests count: ~45 -> Target: 0
- API routes without tests: 34 -> Target: 0
