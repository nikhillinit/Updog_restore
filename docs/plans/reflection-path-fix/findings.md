---
status: ACTIVE
last_updated: 2026-01-19
---

# Findings: Reflection Path Fix

## Root Cause Analysis

### Why the Regression Occurred

1. **Original code** used `Path("docs/skills")` - a relative path that resolved from CWD
2. **PR #444 fix** changed to `REPO_ROOT / "docs/skills"` - an absolute path from git root
3. **Missing change**: The metadata storage still used `str(f)` which now stringified the absolute path
4. **Result**: Absolute paths like `C:/dev/Updog_restore/docs/skills/...` appeared in generated index

### Key Insight

The CWD fix was correct for *finding* files, but the *storage* and *output* needed to use repo-relative paths for portability.

## Hardening Recommendations

### A. Normalize Test File Path Separators

**Risk:** If a contributor writes Windows-style backslashes in frontmatter (`tests\regressions\REFL-001.test.ts`), then on Linux/macOS that becomes a literal backslash character and `exists()` will fail.

**Current Code:**
```python
test_file = r.get('test_file', f"tests/regressions/{r.get('id')}.test.ts")
test_exists = "[x]" if (REPO_ROOT / test_file).exists() else "[ ]"
```

**Hardened Code:**
```python
test_file = r.get('test_file', f"tests/regressions/{r.get('id')}.test.ts")
test_file = test_file.replace("\\", "/")  # Normalize separators
test_exists = "[x]" if (REPO_ROOT / test_file).exists() else "[ ]"
```

**Effort:** Low (1 line)
**Impact:** Prevents cross-platform test detection failures

### B. Add Guardrail to Prevent Regression

**Risk:** Future changes could re-introduce absolute paths without detection.

**Solution:** Add validation check in `validate()` function or as unit test.

**Check Criteria:**
1. No `:` followed by `/` (Windows drive pattern like `C:/`)
2. No paths starting with `/` (Unix absolute paths)
3. All paths should start with `docs/` or `tests/`

**Implementation Options:**

**Option 1: Add to validate() function**
```python
def validate_index_paths():
    """Ensure SKILLS_INDEX.md contains no absolute paths."""
    if not INDEX_FILE.exists():
        return True
    content = INDEX_FILE.read_text(encoding='utf-8')

    # Check for Windows absolute paths (C:/, D:/, etc.)
    if re.search(r'[A-Za-z]:/', content):
        print("[ERROR] SKILLS_INDEX.md contains Windows absolute path", file=sys.stderr)
        return False

    # Check for Unix absolute paths in table rows
    if re.search(r'\| `/[^d]', content):  # Starts with / but not /docs
        print("[ERROR] SKILLS_INDEX.md contains Unix absolute path", file=sys.stderr)
        return False

    return True
```

**Option 2: Add unit test**
```python
# tests/regressions/skills-index-paths.test.ts
describe('SKILLS_INDEX.md path validation', () => {
  it('should not contain absolute Windows paths', async () => {
    const content = await fs.readFile('docs/skills/SKILLS_INDEX.md', 'utf-8');
    expect(content).not.toMatch(/[A-Za-z]:\//);
  });

  it('should not contain absolute Unix paths in links', async () => {
    const content = await fs.readFile('docs/skills/SKILLS_INDEX.md', 'utf-8');
    // Links should be relative filenames, not /absolute/paths
    expect(content).not.toMatch(/\]\(\/[^)]+\)/);
  });
});
```

**Effort:** Medium (15-30 min)
**Impact:** Catches regression in CI before merge

## Implementation Priority

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| A. Path separator normalization | Low | Medium | P1 |
| B. Guardrail validation | Medium | High | P1 |

## Codex Consultation (2026-01-19)

**Session ID:** 019bd3f6-bccf-7420-8d66-98134c6e62f9

### Key Recommendations

1. **Don't implement A alone** - path separator normalization without validation can mask issues (`C:\` → `C:/` stays absolute)

2. **Implement B1 (validate function)** as primary guardrail:
   - Already runs in CI
   - Can emit precise error tied to offending file
   - Lower maintenance than test harness

3. **Use pathlib for detection** - `PureWindowsPath(path).is_absolute()` + `PurePosixPath(path).is_absolute()` is clearer and OS-agnostic

4. **Additional edge cases to cover:**
   - POSIX absolute paths (`/home/...`) on non-Windows
   - UNC paths (`\\server\share`)
   - Mixed separators (`tests\\regressions/...`)
   - Path traversal (`..`)

### Recommended Implementation

```python
from pathlib import PurePosixPath, PureWindowsPath

def normalize_rel_path(raw: str, field: str, filename: str) -> str:
    """Normalize and validate a repo-relative path."""
    normalized = raw.replace("\\", "/")
    if PureWindowsPath(normalized).is_absolute() or PurePosixPath(normalized).is_absolute():
        raise ValueError(f"{field} must be repo-relative, got absolute path: {raw!r}")
    if ".." in PurePosixPath(normalized).parts:
        raise ValueError(f"{field} must not escape repo root: {raw!r}")
    return normalized
```

### Also Found

- `validate()` at line 379-380 has same CWD issue - uses `Path(test_path_str)` instead of `REPO_ROOT / test_path_str`

## Decision

**Implement Codex recommendations:**
1. Add `normalize_rel_path()` helper
2. Use in `validate()` for test_file checking
3. Use in `rebuild_index()` for consistency
4. Fix CWD issue in validate() at line 379-380
