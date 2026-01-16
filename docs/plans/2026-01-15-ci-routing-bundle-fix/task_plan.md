# CI Routing & Bundle-Size Fix - Task Plan

> **Session:** 2026-01-15 (updated 2026-01-16)
> **PR:** #409 (fix/ci-routing-and-bundle-combined)
> **Status:** COMPLETED

## Goal

Fix two systemic CI blockers that were failing all PRs:
1. `Validate Discovery Routing` - Non-deterministic file enumeration across platforms
2. `bundle-size` - Referenced non-existent chunks in `.size-limit.json`

## Architecture Decision

Combined both fixes into single PR #409 to unblock CI pipeline efficiently, rather than separate PRs that would each trigger full CI runs.

---

## Phase 1: Diagnosis
- [x] Identify routing check failure cause (cross-platform file enumeration)
- [x] Identify bundle-size failure cause (missing chunk references)
- [x] Analyze whether issues are related or independent

## Phase 2: Routing Fix
- [x] Add `_archive/**` and `scripts/archive/**` to exclude paths
- [x] Strip `docs` array from comparison (varies by environment)
- [x] Regenerate routing files with new exclusions
- [x] Verify routing check passes on CI

## Phase 3: Bundle-Size Fix
- [x] Remove non-existent chunks from `.size-limit.json`
- [x] Update Initial Load limit to 250 KB
- [x] Verify bundle-size check passes on CI

## Phase 4: Regression Prevention (Critical Addition)
- [x] Identify bundle-metrics format regression risk
- [x] Fix `report-metrics` compatibility (maintains `{ size: <number> }` schema)
- [x] Add schema validation before artifact upload

## Phase 5: Verification & Merge
- [x] Confirm all target checks pass
- [x] Merge PR #409 (commit 54f9992b)
- [x] Close superseded PRs (#407, #408)
- [x] Document lessons learned

## Phase 6: Follow-up (Future PRs)
- [x] ~~Fix Governance Guards (badge URL validation)~~ - Now passing
- [x] Fix integration tests (`scenario_matrices` table) - PR #416 merged
- [ ] Consider tighter routing validation (git ls-files approach)

---

## Files Modified

| File | Change |
|------|--------|
| `.size-limit.json` | Removed non-existent chunks, updated limits |
| `scripts/generate-discovery-map.ts` | Added exclusions, stripped docs array from comparison |
| `.github/workflows/performance-gates.yml` | Fixed bundle-metrics schema for backward compatibility |
| `docs/_generated/router-*.json` | Regenerated with new exclusions |
