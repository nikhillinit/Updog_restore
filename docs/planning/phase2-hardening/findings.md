# Phase 2 Hardening: Findings

## Iteration 0: Post-PR447 Validation

### manage_skills.py Capabilities
Commands confirmed (lines 6-9):
- `new --title <title>` - Creates reflection + test file with atomic ID allocation
- `rebuild [--check]` - Generates SKILLS_INDEX.md, --check fails if stale
- `check --title <title>` - Duplicate detection via keyword overlap
- `validate` - Full CI integrity check

Validation checks (lines 362-438):
1. Required fields: id, title, status, date
2. Unique ID format: REFL-NNN
3. Status enumeration: VERIFIED, DRAFT, DEPRECATED
4. Test existence for VERIFIED status
5. Bidirectional link validation (test header ↔ reflection)
6. Orphaned test detection
7. Index freshness check

Path handling (PR447 fix):
- `normalize_rel_path()` at line 52 validates repo-relative paths
- Rejects absolute paths and `..` traversal
- Uses forward slashes for cross-platform portability

### Current Reflection System State
- 18 reflections: REFL-001 through REFL-018
- Template file: template-refl.md
- Index: SKILLS_INDEX.md (auto-generated)
- Tests: tests/regressions/REFL-*.test.ts

### CI Integration Points
- 17 existing workflows in .github/workflows/
- **GAP**: No workflow runs `manage_skills.py validate`
- **GAP**: No npm scripts wrap reflection commands

### Existing Related Workflows
- docs-validate.yml - likely validates other docs, not reflections
- docs-routing-check.yml - routing index, not skills

## Iteration 1: CI Strategy (Codex Consultation)

### Codex Recommendation (Session: 019bd423-7c5b-7b93-8252-a3208a29727c)

**Standalone vs ci-unified.yml:**
- Standalone workflow recommended
- Reason: Adding to ci-unified.yml would still trigger entire workflow on every PR
- Path filtering only works at workflow level, not job level

**PyYAML Handling:**
- Install explicitly in CI
- Reason: Fallback parser is intentionally lossy, could miss frontmatter issues
- Strict validation requires full YAML parser

**Workflow Location:** `.github/workflows/reflection-validate.yml`

**Triggers:**
- `docs/skills/**`
- `tests/regressions/REFL-*`
- `scripts/manage_skills.py`

## Iteration 2: Wizard Step Vocabulary

### Canonical Wizard Steps (from client/src/pages/fund-setup.tsx:33-82)

| Step # | ID | Title | Description |
|--------|-----|-------|-------------|
| 1 | fund-basics | FUND BASICS | Fund identity, capital, and economics structure |
| 2 | investment-rounds | INVESTMENT ROUNDS | Define stages, valuations, and progression rates |
| 3 | capital-structure | CAPITAL ALLOCATION | Investment stage allocations and deal modeling |
| 4 | investment-strategy | INVESTMENT STRATEGY | Stages, sectors, and allocations (pre-recycling) |
| 5 | distributions | EXIT RECYCLING | Proceeds recycling configuration |
| 6 | cashflow-management | WATERFALL & CARRY | Distribution terms and carry structure |
| 7 | review | ADVANCED SETTINGS | Fund structure and expenses |
| 8 | complete | REVIEW & CREATE | Final review and fund creation |

### Current Drift
- REFL-018 uses `step2-capital-calls`, `step5-reserves` (non-canonical)
- Should be: `investment-rounds`, `distributions` or `capital-structure`

### Validation Rule
Add to `manage_skills.py validate`:
- Warn on non-canonical wizard_steps values
- Suggest nearest canonical match
