# /retrospective

Create a codified reflection from a bug fix or lesson learned.

## Usage

```
/retrospective --title "Short descriptive title of the learning"
```

## Protocol

When invoked, follow this workflow:

### 1. Analyze the Learning

Review the current context to identify:
- **The Anti-Pattern**: What incorrect approach was taken?
- **The Root Cause**: Why did this mistake happen?
- **The Verified Fix**: What is the correct approach?
- **Financial/System Impact**: What could go wrong if repeated?

### 2. Check for Duplicates

```bash
python scripts/manage_skills.py check --title "Your Title"
```

If duplicates found, consider updating existing reflection instead.

### 3. Create the Reflection

```bash
python scripts/manage_skills.py new --title "Your Title"
```

This creates:
- `docs/skills/REFL-XXX-your-title.md` - Reflection template
- `tests/regressions/REFL-XXX.test.ts` - Test stub

### 4. Populate the Reflection

Fill in the generated files with:

**docs/skills/REFL-XXX-*.md:**
- Update frontmatter (severity, wizard_steps, error_codes, components, keywords)
- Write "The Anti-Pattern" section with recognition signals
- Write "The Verified Fix" section with implementation pattern
- Add code examples (both anti-pattern and fix)

**tests/regressions/REFL-XXX.test.ts:**
- Write test that FAILS with buggy code
- Write test that PASSES with fixed code

### 5. Update Status

Once tests pass, change `status: DRAFT` to `status: VERIFIED` in the reflection.

### 6. Rebuild Index

```bash
python scripts/manage_skills.py rebuild
```

## When to Use

- After fixing a logic bug in financial calculations
- After discovering a pattern that caused repeated issues
- After a production incident with lessons learned
- After discovering a non-obvious architectural constraint

## Integration Points

- **CHANGELOG.md**: Log the fix with `/log-change`
- **DECISIONS.md**: If architectural, log with `/log-decision`
- **Planning-with-files**: Extract learnings from `findings.md`

## Example

```
/retrospective --title "GP Catch-up Fails on Zero IRR"
```

Creates reflection documenting that GP catch-up calculations must handle edge case where fund IRR equals exactly zero (division by zero risk).
