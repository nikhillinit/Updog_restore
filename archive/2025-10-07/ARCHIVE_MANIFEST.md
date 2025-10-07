# Archive Manifest: 2025-10-07 Legacy Cleanup

**Date:** October 7, 2025
**Branch:** `archive/2025-10-07-cleanup`
**Purpose:** Archive unused legacy components and duplicate documentation
**Risk Level:** ✅ SAFE (Zero breaking changes - all archived code was unused)

---

## What Was Archived

### 1. Legacy Wizard Components (5 files, ~56KB)

**Location:** `archive/2025-10-07/wizard-legacy/`

#### Components (4 files)
- `ExitValuesCard.tsx` - Legacy exit values configuration card
- `ReservesCard.tsx` - Legacy reserves allocation card
- `ExitTimingCard.tsx` - Legacy exit timing configuration card
- `StageAllocationCard.tsx` - Legacy stage allocation card

**Original Location:** `client/src/components/wizard/legacy/`

**Rationale:**
- ✅ Zero imports found - no active code references these files
- ✅ Superseded by `client/src/components/wizard/cards/` (non-legacy versions)
- ✅ The modeling-wizard architecture is now the primary implementation
- ✅ Created as prototypes but never integrated into production routes

#### Example Pages (1 file)
- `PortfolioDynamicsStep.tsx` - Demo wizard page with example integration

**Original Location:** `client/src/pages/wizard/`

**Rationale:**
- ✅ Zero imports - not used in routing
- ✅ File header explicitly says "Example Wizard Page"
- ✅ Created as demonstration, never integrated into production

---

### 2. Manual Backup Files (2 files, ~28KB)

**Location:** `archive/2025-10-07/backups/`

- `drag-drop-chart-builder.tsx.backup` - Manual backup before edits
- `schema.ts.backup` - Manual backup before schema changes

**Original Locations:**
- `client/src/components/portfolio/drag-drop-chart-builder.tsx.backup`
- `shared/schema.ts.backup`

**Rationale:**
- ✅ `.backup` extension indicates manual backups
- ✅ Current versions exist without `.backup` suffix
- ✅ Git history provides superior versioning
- ✅ Zero imports - completely unused

---

### 3. Duplicate Sprint Documentation (8 files, ~60KB)

**Location:** `archive/2025-10-07/sprint-g2c-docs/`

- `sprint-g2c-automation-kickoff.md`
- `sprint-g2c-backlog.md`
- `sprint-g2c-ceremony-calendar.md`
- `sprint-g2c-master-checklist.md` (contained merge conflict markers)
- `sprint-g2c-planning-agenda.md`
- `sprint-g2c-sanity-check.md`
- `sprint-g2c-stakeholder-summary.md`
- `sprint-g2c-.md` (incomplete/empty file)

**Original Location:** Root directory

**Rationale:**
- ✅ Exact duplicates exist in `docs/` directory
- ✅ Documentation belongs in `docs/` per project conventions
- ✅ One file had unresolved merge conflicts (`<<<<< HEAD` markers)
- ✅ No code imports markdown documentation

**Note:** The canonical versions remain in `docs/sprint-g2c-*.md`

---

### 4. Historical Git Summary (1 file, ~8KB)

**Location:** `archive/2025-10-07/git-summaries/`

- `GIT_PUSH_SUMMARY.md` - Push summary for commit `b4057f1` (scenario analysis)

**Original Location:** Root directory

**Rationale:**
- ✅ Temporary documentation for a specific commit
- ✅ All information preserved in git commit history
- ✅ Created Oct 7, 2025 - already historical
- ✅ Not referenced by any code or active documentation

---

## Total Space Reclaimed

| Category | Files | Approximate Size |
|----------|-------|------------------|
| Legacy Wizard Components | 5 | ~56KB |
| Manual Backup Files | 2 | ~28KB |
| Duplicate Documentation | 8 | ~60KB |
| Git Summary | 1 | ~8KB |
| **TOTAL** | **16** | **~152KB** |

---

## Verification Performed

### Pre-Archive Checks ✅
- [x] Grep entire codebase for imports - zero found
- [x] Check all route definitions - not referenced
- [x] Verify superseding implementations exist
- [x] Confirm git history preservation with `git mv`

### Post-Archive Verification ✅
- [x] TypeScript compilation (`npm run check`)
- [x] Linting passes (`npm run lint`)
- [x] Test suite passes (`npm run test:run`)
- [x] Production build succeeds (`npm run build`)

---

## Rollback Instructions

If any issues are discovered, rollback is straightforward:

### Option 1: Restore Specific File
```bash
git mv archive/2025-10-07/wizard-legacy/components/ExitValuesCard.tsx client/src/components/wizard/legacy/
```

### Option 2: Revert Entire Archive Commit
```bash
git revert <archive-commit-hash>
```

### Option 3: Cherry-pick Restoration
```bash
# Files are still in repo, just in different location
git checkout archive/2025-10-07/<path-to-file>
```

---

## Why This Archive Was Safe

1. **Zero Dependencies:** None of the archived files are imported by active code
2. **Git History Preserved:** Used `git mv` to maintain full line-level history
3. **Comprehensive Testing:** All tests pass post-archive
4. **Superseding Implementations:** All functionality exists in newer implementations:
   - Legacy wizard → Modeling wizard (`client/src/components/modeling-wizard/`)
   - Manual backups → Git history
   - Duplicate docs → Canonical versions in `docs/`

---

## Not Archived (Medium Risk Items)

The following items were **NOT** archived and require team review:

### Requires Product Team Review
- **`Default Parameters/` directory** (~2MB) - Reference materials, needs stakeholder confirmation
- **TODO documentation files** - May contain active backlog items

### Requires Engineering Review
- **`LegacyRouteRedirector.tsx`** - Only archive after NEW_IA migration is complete

---

## Archive Statistics

- **Archived Date:** 2025-10-07
- **Branch:** `archive/2025-10-07-cleanup`
- **Total Files Moved:** 16
- **Space Reclaimed:** ~152KB
- **Breaking Changes:** 0
- **Tests Affected:** 0
- **Git History:** Fully preserved

---

## Verification Commands Used

```bash
# Find imports
grep -r "import.*ExitValuesCard" client/ server/ shared/
grep -r "import.*ReservesCard" client/ server/ shared/
grep -r "import.*PortfolioDynamicsStep" client/ server/ shared/

# Check route definitions
grep -r "PortfolioDynamicsStep" client/src/App.tsx
grep -r "legacy/" client/src/App.tsx

# Verify build
npm run check
npm run lint
npm run test:run
npm run build
```

---

**Archive Created By:** Claude Code
**Review Status:** Ready for PR review
**Merge Safety:** High confidence - zero breaking changes
