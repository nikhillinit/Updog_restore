# Reflection System Consolidation Plan

**Date**: 2026-01-18
**Status**: APPROVED (Codex + Claude consensus)
**Approach**: Canonicalize in `docs/skills/`

## Executive Summary

Consolidate the duplicate reflection systems by migrating valuable content from `tools/reflection/` to `docs/skills/` and removing the legacy directory. This eliminates ID collisions, simplifies CI/CD, and establishes a single source of truth.

## Current State Analysis

| Location | Reflections | Test Files | Status |
|----------|-------------|------------|--------|
| `docs/skills/` | 17 (REFL-001 to REFL-017) | 17 in `tests/regressions/` | ACTIVE |
| `tools/reflection/docs/skills/` | 2 (REFL-001, REFL-002) | 1 in `tools/reflection/tests/` | LEGACY |

### ID Collision Details

| tools/reflection ID | Content | docs/skills Equivalent |
|---------------------|---------|------------------------|
| REFL-001 | Reserve Engine Null Safety | **NEW** - migrate as REFL-018 |
| REFL-002 | Router Substring Matching | **EXISTS** - REFL-013 (delete duplicate) |

## Migration Steps

### Phase 1: Content Migration

#### Step 1.1: Create REFL-018 (Reserve Engine Null Safety)

```bash
# Create new reflection doc
cp tools/reflection/docs/skills/REFL-001-reserve-engine-null-safety.md \
   docs/skills/REFL-018-reserve-engine-null-safety.md

# Update frontmatter: id: REFL-001 -> id: REFL-018
# Update frontmatter: test_file: tests/regressions/REFL-018.test.ts
```

#### Step 1.2: Migrate Test File

```bash
# Move test file with new ID
cp tools/reflection/tests/regressions/REFL-001.test.ts \
   tests/regressions/REFL-018.test.ts

# Update test file header comments:
# - REFLECTION_ID: REFL-001 -> REFLECTION_ID: REFL-018
# - linked to: docs/skills/REFL-018-reserve-engine-null-safety.md
# - describe() block title
```

### Phase 2: Configuration Updates

#### Step 2.1: Update vitest.config.ts

```typescript
// Line 98: Remove tools/reflection/tests pattern
// Before:
include: ['tests/unit/**/*.test.ts', 'tests/perf/**/*.test.ts', 'tests/regressions/**/*.test.ts', 'tools/reflection/tests/**/*.test.ts'],

// After:
include: ['tests/unit/**/*.test.ts', 'tests/perf/**/*.test.ts', 'tests/regressions/**/*.test.ts'],
```

#### Step 2.2: Update REFL-016 Test Example Path

```typescript
// tests/regressions/REFL-016.test.ts line 200-202
// The suggestPattern example uses tools/reflection - update to a valid example
// Before: 'tools/reflection/tests/parse.test.ts'
// After: 'client/src/components/Button.test.tsx'
```

### Phase 3: Script Consolidation

#### Step 3.1: Merge manage_skills.py Features

The root `scripts/manage_skills.py` is already better:
- Windows compatible (no fcntl)
- Has duplicate checking
- Referenced by CAPABILITIES.md and CI

The `tools/reflection/scripts/manage_skills.py` has:
- Atomic file locking (fcntl-based, Linux only)

**Decision**: Keep root script as-is. File locking is unnecessary for this use case (low contention).

### Phase 4: Cleanup

#### Step 4.1: Delete Legacy Directory

```bash
rm -rf tools/reflection/
```

This removes:
- `tools/reflection/docs/` (skills migrated)
- `tools/reflection/tests/` (test migrated)
- `tools/reflection/scripts/` (duplicate script)
- `tools/reflection/.github/` (unused)
- `tools/reflection/.husky/` (unused)
- `tools/reflection/CLAUDE.md` (outdated)
- `tools/reflection/QUICKSTART.md` (outdated)

### Phase 5: Validation

#### Step 5.1: Rebuild Index

```bash
python scripts/manage_skills.py rebuild
```

#### Step 5.2: Validate Integrity

```bash
python scripts/manage_skills.py validate
```

#### Step 5.3: Run Tests

```bash
npm test -- --project=server
```

Verify:
- All 17 original tests pass
- New REFL-018 test passes
- No duplicate test names

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Test name collision during migration | LOW | LOW | Atomic rename (delete old after new passes) |
| Missing references to tools/reflection | LOW | LOW | Grep search performed - only 2 locations |
| SKILLS_INDEX.md stale | LOW | LOW | Automated rebuild |

## Rollback Plan

If issues arise:
1. Revert commits
2. Re-add tools/reflection/ from git history
3. Restore vitest.config.ts include pattern

## Success Criteria

- [ ] REFL-018 exists in `docs/skills/` with correct frontmatter
- [ ] REFL-018.test.ts exists in `tests/regressions/` and passes
- [ ] `tools/reflection/` directory deleted
- [ ] vitest.config.ts updated
- [ ] SKILLS_INDEX.md shows 18 reflections
- [ ] `python scripts/manage_skills.py validate` passes
- [ ] Full test suite passes (2718+ tests)

## Appendix: Codex Consultation Summary

Codex (GPT-5.2, xhigh reasoning) evaluated 4 approaches:

1. **Canonicalize in docs/skills/** - STRONGLY RECOMMENDED
2. Canonicalize in tools/reflection/ - Not recommended (high complexity)
3. Hybrid new location - Not recommended (over-engineered)
4. Keep both - Not recommended (maintenance burden)

Consensus: Approach 1 provides minimal disruption with maximum maintainability.
