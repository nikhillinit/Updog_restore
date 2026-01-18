# Reflection System - Quick Start Guide

## 5-Minute Setup

### 1. Install Dependencies

```bash
# Python (for manage_skills.py)
pip install -r requirements.txt

# Node.js (for regression tests)
npm install vitest --save-dev
```

### 2. Setup Pre-commit Hooks (choose one)

**Option A: pre-commit (Python)**
```bash
pip install pre-commit
pre-commit install
```

**Option B: Husky (Node.js)**
```bash
npx husky install
chmod +x .husky/pre-commit
```

### 3. Create Your First Reflection

```bash
python3 scripts/manage_skills.py new --title "Your Bug Fix Title"
```

This creates:
- `docs/skills/REFL-001-your-bug-fix-title.md` - Fill in the problem/solution
- `tests/regressions/REFL-001.test.ts` - Write the regression test

### 4. Validate the System

```bash
python3 scripts/manage_skills.py validate
```

## Daily Workflow

1. **Fix a bug** in your codebase
2. **Create reflection**: `python3 scripts/manage_skills.py new --title "Brief description"`
3. **Document** the problem, root cause, and solution in the .md file
4. **Write test** that would fail with the old buggy code
5. **Commit** - hooks auto-validate and rebuild index

## Commands Reference

| Command | Purpose |
|---------|---------|
| `new --title "..."` | Create new reflection + test file |
| `rebuild` | Regenerate SKILLS_INDEX.md |
| `rebuild --check` | Check if index is stale (CI mode) |
| `validate` | Full integrity check |

## CI Integration

GitHub Actions workflow runs automatically on PRs touching:
- `docs/skills/**`
- `tests/regressions/**`
- `scripts/manage_skills.py`

## Files Overview

```
docs/skills/
  REFL-*.md          # Reflection documents (YAML frontmatter + markdown)
  SKILLS_INDEX.md    # Auto-generated registry
  template-refl.md   # Template for new reflections

tests/regressions/
  REFL-*.test.ts     # Regression tests (Vitest)

scripts/
  manage_skills.py   # CLI for managing reflections

.pre-commit-config.yaml  # Pre-commit hooks
.husky/pre-commit        # Husky hooks (alternative)
.github/workflows/       # CI validation
```
