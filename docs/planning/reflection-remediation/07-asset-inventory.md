# Asset Inventory: Tools and Skills

## Metadata
- Last Updated: 2026-01-18T22:40:00Z
- Codebase Search Completed: PARTIAL

---

## Phase 1 Assets

### Step 1.1: Consolidation [COMPLETE]

**Tools Used:**
- `git rm -rf` for directory removal
- `git mv` (implicit via copy + add)
- `python scripts/manage_skills.py rebuild` for index regeneration
- `python scripts/manage_skills.py validate` for integrity check

**Codex Consultations:**
- Iteration 0: Initial discovery audit
- Iteration 1: Strategy evaluation (4 approaches)
- Validation: 6-point checklist confirmation

---

### Step 1.2: Fix CWD Dependency [PENDING]

**Existing Patterns to Search:**
```bash
# Search for existing repo root detection
grep -r "find_repo_root\|get_repo_root\|repository_root" --include="*.py"
grep -r "git rev-parse --show-toplevel" --include="*.py" --include="*.sh"
```

**Candidate Libraries:**
- pathlib (Python standard library)
- subprocess + `git rev-parse --show-toplevel`
- os.path with marker file detection

**Selected Approach:** [PENDING - requires discovery]

---

### Step 1.3: Enhance /advise [PENDING]

**Discovery Required:**
```bash
# Locate /advise implementation
grep -r "/advise\|advise command" --include="*.md" --include="*.py" --include="*.ts"
```

**Current Status:** Implementation location unknown

---

### Step 1.4: Cross-links [PENDING]

**Existing Asset:**
- scripts/manage_skills.py contains rebuild_index() function
- Need to audit and extend

---

## Phase 2 Assets

### Step 2.1: Portable Tooling

**npm Script Patterns:**
```json
{
  "scripts": {
    "reflection:new": "python scripts/manage_skills.py new",
    "reflection:validate": "python scripts/manage_skills.py validate",
    "reflection:rebuild": "python scripts/manage_skills.py rebuild"
  }
}
```

### Step 2.3: Defensive CI

**Existing CI Structure:**
- .github/workflows/ contains multiple workflow files
- Need to add Python linting job

---

## New Assets Created This Session

1. **docs/plans/reflection-consolidation-plan.md**
   - Comprehensive consolidation strategy
   - Created during pre-formal iteration

2. **docs/skills/REFL-018-reserve-engine-null-safety.md**
   - Migrated from tools/reflection/
   - Three-layer validation pattern

3. **tests/regressions/REFL-018.test.ts**
   - Migrated test file
   - 9 test cases

4. **docs/planning/reflection-remediation/**
   - This forensic documentation structure
   - 9 documentation files

---

## Reusable Patterns Discovered

[PENDING - requires deeper codebase analysis]
