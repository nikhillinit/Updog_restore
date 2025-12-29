# Technical Debt Remediation Plan (Refined)

**Generated:** 2025-12-29
**Branch:** `claude/identify-tech-debt-ucn56`
**Review Method:** Ultra-deep analysis with verification against codebase

---

## Executive Summary

Comprehensive analysis identified **60+ technical debt items** across 6 domains. After verification, several false positives were corrected and priorities refined using WSJF (Weighted Shortest Job First).

### Key Corrections from Initial Analysis

| Initial Claim | Verification Result |
|---------------|---------------------|
| Missing security middleware on portfolio-intelligence | **FALSE** - Already applied at line 91 |
| Triple XIRR implementation | **CLARIFIED** - 2 XIRR (different day-counts) + 1 periodic IRR (different purpose) |
| Issue #309 server boundary violation | **PARTIAL** - PR #313 added shared utils, but engine imports remain with TODOs |

---

## Verified Critical Issues (WSJF Prioritized)

### Tier 1: High Value, Low Effort (Do First)

| Issue | WSJF Score | Location | Acceptance Criteria |
|-------|------------|----------|---------------------|
| **6 conflicting StageSchema definitions** | 25 | `shared/schemas.ts`, `reserves-schemas.ts`, `fund-model.ts`, `reserve-engine.contract.ts`, `types.ts`, `fund-wire-schema.ts` | Single canonical schema, all imports updated, tests pass |
| **Duplicate ReserveInputSchema** | 22 | `shared/schemas.ts:32`, `shared/types.ts:89` | Renamed to distinct names, no runtime errors |
| **Delete backup file** | 20 | `server/routes/lp-api.ts.backup` | File deleted, .gitignore updated |
| **Hardcoded Docker credentials** | 18 | `docker-compose*.yml` | All passwords use `${ENV_VAR:-default}` pattern |

### Tier 2: High Value, Medium Effort

| Issue | WSJF Score | Location | Acceptance Criteria |
|-------|------------|----------|---------------------|
| **Dual XIRR implementations (365 vs 365.25)** | 16 | `client/src/lib/xirr.ts` (365), `client/src/lib/finance/xirr.ts` (365.25) | Single implementation, Phoenix truth cases pass |
| **Storage interface uses `any`** | 15 | `server/storage.ts:38-40` | Proper types for all 3 methods |
| **WebSocket handlers untyped** | 14 | `server/websocket.ts:58-148` | Typed event handlers matching Zod schemas |

### Tier 3: Medium Value, High Effort (Plan Carefully)

| Issue | WSJF Score | Location | Acceptance Criteria |
|-------|------------|----------|---------------------|
| **Server imports from client** | 12 | `server/routes.ts:17-23` | Engines in `/shared/core/`, Issue #309 closed |
| **150+ files with `any` type** | 10 | Server + Client | Baseline count reduced by 20% per sprint |
| **Monolithic routes.ts (857 lines)** | 9 | `server/routes.ts` | Split into <200 line files |

---

## StageSchema Conflict Details (Verified Critical)

The analysis found 6 incompatible definitions:

```
shared/schemas.ts:4          → ['preseed', 'seed', 'series_a', 'series_b', 'series_c', 'series_dplus']
shared/schemas/reserves-schemas.ts:11 → ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'growth', 'late_stage']
shared/schemas/fund-model.ts:18      → ['seed', 'series_a', 'series_b', 'series_c', 'growth']
shared/contracts/reserve-engine.contract.ts:20 → ['pre-seed', 'seed', 'series-a', ...] (hyphens!)
shared/types.ts:276          → z.object({...}) (completely different structure!)
shared/fund-wire-schema.ts:23        → z.object({...}) (also object, not enum)
```

**Conflicts:**
- Naming: `preseed` vs `pre_seed` vs `pre-seed`
- Separators: underscores vs hyphens
- Coverage: Some have `growth`, some have `series_dplus`
- Structure: Some are enums, some are objects

**Fix Strategy:**
1. Create `shared/schemas/common.ts` with canonical `CompanyStageSchema`
2. Add normalization utility for legacy data
3. Update all imports with deprecation warnings
4. Run Phoenix truth cases to verify no calculation drift

---

## XIRR Implementation Analysis (Clarified)

**Two XIRR implementations with different day-count conventions:**

| File | Day Count | Use Case | Status |
|------|-----------|----------|--------|
| `client/src/lib/finance/xirr.ts` | 365.25 | Primary, matches Excel empirically | **CANONICAL** per CAPABILITIES.md |
| `client/src/lib/xirr.ts` | 365 | Alternative implementation | **DEPRECATE** |
| `client/src/lib/irr.ts` | N/A (periodic) | Period-indexed cashflows | Different purpose, keep |

**Fix Strategy:**
1. Verify `finance/xirr.ts` passes all 50 golden test cases
2. Add deprecation notice to `lib/xirr.ts`
3. Update imports to use canonical implementation
4. Run `/phoenix-truth focus=xirr` to validate

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| StageSchema migration breaks existing data | Medium | High | Add normalization layer, test with production data snapshot |
| XIRR consolidation causes calculation drift | Low | Critical | Run Phoenix truth cases before/after |
| Type strictness breaks runtime behavior | Medium | Medium | Enable file-by-file with test coverage |
| Server/client split causes API changes | Low | Medium | Keep backward compatibility during transition |

---

## Integration with Existing Tooling

### Use These Tools

| Task | Tool/Command | Purpose |
|------|--------------|---------|
| XIRR validation | `/phoenix-truth focus=xirr` | Verify calculation correctness |
| Type safety tracking | TypeScript baseline system | Track `any` reduction |
| Schema validation | `schema-drift-checker` agent | Ensure Drizzle/Zod/Mock alignment |
| Financial accuracy | `phoenix-precision-guardian` agent | Detect numeric drift |

### Validation Commands

```bash
# Before any financial calculation changes
npm run test -- --project=server --grep="xirr"
npm run test -- --project=server --grep="golden"

# After StageSchema changes
npm run check  # TypeScript baseline
npm run test   # Full test suite

# Verify no regression
/phoenix-truth focus=all
```

---

## Refined Sprint Plan

### Sprint 1: Quick Wins (1-2 days)

- [ ] Delete `server/routes/lp-api.ts.backup`
- [ ] Rename `ReserveInputSchema` to avoid collision
- [ ] Replace hardcoded Docker passwords with env vars
- [ ] Pin pgAdmin version in docker-compose.yml

**Verification:** `git status` clean, `npm test` passes

### Sprint 2: Schema Unification (3-4 days)

- [ ] Create canonical `CompanyStageSchema` in `shared/schemas/common.ts`
- [ ] Add stage normalization utility
- [ ] Update all StageSchema imports (6 files)
- [ ] Add deprecation notices to old locations
- [ ] Run `/phoenix-truth` to validate

**Verification:** Single source of truth, no type errors, Phoenix passes

### Sprint 3: XIRR Consolidation (2-3 days)

- [ ] Verify `finance/xirr.ts` passes all 50 golden tests
- [ ] Add deprecation to `lib/xirr.ts`
- [ ] Update imports across codebase
- [ ] Run `/phoenix-truth focus=xirr`

**Verification:** XIRR golden tests pass, no calculation drift

### Sprint 4: Type Safety Foundation (1 week)

- [ ] Type `storage.ts` interface methods
- [ ] Type WebSocket event handlers
- [ ] Enable strict mode on 10 files (start with `shared/`)
- [ ] Reduce baseline errors by 10%

**Verification:** Baseline count decreases, no runtime errors

### Sprint 5: Architecture (1-2 weeks)

- [ ] Move core engines to `shared/core/` (Issue #309)
- [ ] Split `routes.ts` into modular files
- [ ] Consolidate server entry points

**Verification:** No cross-boundary imports, routes.ts < 200 lines

---

## Metrics to Track

| Metric | Current | Sprint 1 Target | Sprint 4 Target |
|--------|---------|-----------------|-----------------|
| Files with `eslint-disable any` | 150+ | 150 | 130 |
| TypeScript baseline errors | ~45 | 45 | 35 |
| StageSchema definitions | 6 | 1 canonical | 1 canonical |
| XIRR implementations | 2 | 1 canonical | 1 canonical |
| Skipped tests | ~45 | 45 | 35 |
| API routes without tests | 34/37 | 34 | 30 |

---

## Files Requiring Immediate Attention

| File | Issue | Priority | Effort |
|------|-------|----------|--------|
| `shared/schemas.ts` | Conflicting StageSchema | P0 | Low |
| `shared/types.ts` | Duplicate ReserveInputSchema | P0 | Low |
| `server/routes/lp-api.ts.backup` | Delete | P0 | Trivial |
| `docker-compose.yml` | Hardcoded credentials | P1 | Low |
| `client/src/lib/xirr.ts` | Duplicate XIRR (365 day-count) | P1 | Medium |
| `server/storage.ts:38-40` | `any` in interface | P2 | Low |
| `server/routes.ts:17-23` | Layer violation (Issue #309) | P2 | High |

---

## Decisions Required

Before proceeding, clarify with stakeholders:

1. **StageSchema canonical values**: Which enum values are authoritative?
   - Option A: `['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'growth', 'late_stage']`
   - Option B: Keep domain-specific variants with normalization

2. **XIRR day-count convention**: 365 or 365.25?
   - Current `finance/xirr.ts` uses 365.25 (matches Excel empirically)
   - Need confirmation this is the intended behavior

3. **Server/client engine split timeline**:
   - Issue #309 partially addressed in PR #313
   - Full refactor requires API contract review

---

## Notes

- This plan supersedes the initial analysis
- False positives have been removed (security middleware was already applied)
- Priorities refined using WSJF (Cost of Delay / Job Size)
- All changes should be validated with existing Phoenix truth cases
