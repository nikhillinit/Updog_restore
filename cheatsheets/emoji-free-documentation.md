# Emoji-Free Documentation Guide

## Why No Emojis?

This project enforces a strict no-emoji policy across all documentation, code, and scripts. This decision is based on technical, accessibility, and maintainability considerations.

## Technical Issues

### GitHub Actions Encoding
```bash
# FAILS - Emoji in GITHUB_OUTPUT
echo "summary=✅ Tests passed" >> $GITHUB_OUTPUT
# Error: Invalid format '✅ Tests passed'

# WORKS - Text replacement
echo "summary=PASS: Tests passed" >> $GITHUB_OUTPUT
```

### CI/CD Log Parsing
```bash
# FAILS - grep/awk/sed break on multi-byte characters
grep "🛑 GATE" logs.txt  # Requires Unicode regex

# WORKS - Plain text
grep "GATE:" logs.txt  # Standard ASCII search
```

### Windows Compatibility
- Some Windows terminals render emojis incorrectly
- PowerShell has inconsistent UTF-8 support
- CMD.exe doesn't support emoji at all

## Accessibility Issues

### Screen Readers
- ✅ → Announced as "white heavy check mark" (verbose)
- 🎯 → "direct hit" (confusing in context)
- 🛑 → "stop sign" (may not convey "gate" meaning)

**Impact**: Cognitive overload for screen reader users

### Visual Scanability
- Text is faster to scan than symbols
- Emojis create visual "noise" in technical docs
- Mixed emoji/text reduces readability

## Maintainability Issues

### Version Control
```diff
# Git diff shows emoji as Unicode escape sequences
- console.log('✅ Tests passed');
+ console.log('❌ Tests failed');

# Rendered in some tools as:
- console.log('\u2705 Tests passed');
+ console.log('\u274C Tests failed');
```

### Searchability
```bash
# Complex Unicode regex required
grep -P '[\x{1F000}-\x{1FAFF}]' file.md

# Simple text search
grep "GATE:" file.md
```

### Internationalization
- Emojis don't translate across locales
- Text can be localized (English → Spanish → Japanese)
- Emoji meanings vary by culture

## Approved Replacements

### Status Indicators

| Emoji | Replacement | Usage |
|-------|-------------|-------|
| ✅ | `[x]` | Completed checklist item |
| ✅ | `PASS:` | Test/validation passed |
| ✅ | `SUCCESS:` | Operation succeeded |
| ❌ | `[ ]` | Pending checklist item |
| ❌ | `FAIL:` | Test/validation failed |
| ❌ | `ERROR:` | Operation error |
| ⚠️ | `**WARNING:**` | Warning message |
| ⚠️ | `**NOTE:**` | Important note |

### Process Markers

| Emoji | Replacement | Usage |
|-------|-------------|-------|
| 🛑 | `**GATE:**` | Quality gate checkpoint |
| 🛑 | `**CHECKPOINT:**` | Manual review required |
| 🎯 | `**KEY POINT:**` | Important takeaway |
| 🎯 | `**FOCUS:**` | Attention required |
| 📋 | `-` | Bullet point |
| 📋 | `**CHECKLIST:**` | Checklist header |

### Activity Indicators

| Emoji | Replacement | Usage |
|-------|-------------|-------|
| 🔍 | `Checking:` | Verification activity |
| 🔍 | `Searching:` | Search operation |
| 🧪 | `**TESTING:**` | Test execution |
| 🧪 | `[TEST]` | Test marker |
| 🤖 | `[AI-GENERATED]` | AI-created content |
| 🤖 | `(automated)` | Automated process |
| ▶️ | `->` | Process flow |
| ▶️ | `Running:` | Command execution |

### Category Icons

| Emoji | Replacement | Usage |
|-------|-------------|-------|
| 🧪 | `Testing:` | Test-related section |
| 🐛 | `Debugging:` | Debug section |
| 🔧 | `Configuration:` | Config section |
| 📚 | `Documentation:` | Docs section |
| 🔐 | `Security:` | Security section |
| 📊 | `Analytics:` | Metrics section |
| 💰 | `Finance:` | Financial section |

## Enforcement Mechanisms

### Pre-commit Hook

Located at `.husky/pre-commit`:

```bash
# Check for emoji in staged files
if git diff --cached --name-only | grep -E '\.(md|js|mjs|ts|tsx|jsx)$' | xargs grep -P '[\x{1F000}-\x{1FAFF}]' 2>/dev/null; then
  echo "[FAIL] Emoji found in staged files."
  echo "See CLAUDE.md for approved replacements."
  exit 1
fi
```

### ESLint Rule (Future)

Planned ESLint rule for scripts that write to `$GITHUB_OUTPUT`:

```javascript
// eslint-rules/no-emoji-in-github-output.js
// Detects emoji in strings that write to GITHUB_OUTPUT
```

### CI Validation (Future)

Planned CI workflow to fail PRs with emoji:

```yaml
- name: Check for emoji
  run: |
    if grep -rP '[\x{1F000}-\x{1FAFF}]' *.md scripts/**/*.{js,mjs,ts}; then
      echo "ERROR: Emoji found in files"
      exit 1
    fi
```

## VS Code Snippets

Add to `.vscode/markdown.code-snippets`:

```json
{
  "Gate Marker": {
    "prefix": "gate",
    "body": ["**GATE:** $1"],
    "description": "Add a gate marker (no emoji)"
  },
  "Checkpoint": {
    "prefix": "checkpoint",
    "body": ["**CHECKPOINT:** $1"],
    "description": "Add a checkpoint marker"
  },
  "Key Point": {
    "prefix": "keypoint",
    "body": ["**KEY POINT:** $1"],
    "description": "Highlight important point"
  },
  "Warning": {
    "prefix": "warn",
    "body": ["**WARNING:** $1"],
    "description": "Add warning message"
  },
  "Pass/Fail": {
    "prefix": "passfail",
    "body": ["${1|PASS,FAIL|}: $2"],
    "description": "Add pass/fail indicator"
  }
}
```

## Migration Guide

### Step 1: Find Emojis

```bash
# Find all emoji in documentation
grep -rP '[\x{1F000}-\x{1FAFF}]' *.md

# Find emoji in scripts
grep -rP '[\x{1F000}-\x{1FAFF}]' scripts/
```

### Step 2: Replace Systematically

```bash
# Use sed or Python script
python scripts/remove-emojis.py
```

### Step 3: Verify Removal

```bash
# Confirm zero emojis
python -c "
import re, glob
emoji_pattern = re.compile(r'[\U0001F300-\U0001F9FF]', re.UNICODE)
for file in glob.glob('*.md'):
    content = open(file, encoding='utf-8').read()
    if emoji_pattern.search(content):
        print(f'Emoji found in {file}')
"
```

## Examples

### Before (with emoji)

```markdown
## Status

✅ Tests passing
❌ Build failed
⚠️ Warning: API deprecated

### Next Steps

🛑 **GATE:** Code review required
🎯 Focus on performance
🧪 Run integration tests
```

### After (emoji-free)

```markdown
## Status

[x] Tests passing
[ ] Build failed
**WARNING:** API deprecated

### Next Steps

**GATE:** Code review required
**KEY POINT:** Focus on performance
**TESTING:** Run integration tests
```

## Common Mistakes

### ❌ Mixing Emoji and Text

```markdown
✅ **Success:** Tests passed  # Redundant
```

### ✅ Use Text Alone

```markdown
**SUCCESS:** Tests passed
# or
[x] Tests passed
```

### ❌ Emoji in Commit Messages

```bash
git commit -m "✅ Fix emoji issue"  # Will fail pre-commit
```

### ✅ Text Commit Messages

```bash
git commit -m "fix: Remove emoji from documentation"
```

## FAQ

### Q: Can I use emoji in terminal output for humans?

**A:** Acceptable but discouraged. If you do:
- Only in `console.log()` for terminal display
- NEVER in `GITHUB_OUTPUT` or CI/CD output
- Prefer text for consistency

### Q: What about Unicode symbols (→, ✓, ×)?

**A:** These are generally okay:
- `→` (arrow) is widely supported
- `✓` (checkmark) works in most terminals
- `×` (cross) is safe

But still prefer ASCII: `->`, `[x]`, `[ ]` for maximum compatibility.

### Q: Does this apply to commit messages?

**A:** Yes. Commit messages should be plain text:
- No emoji in commit subject
- No emoji in commit body
- Exception: Co-Authored-By tags can have unicode names (rare)

### Q: How do I update legacy docs?

**A:** Use the migration guide above:
1. Find all emoji usage
2. Use find-and-replace with approved replacements
3. Verify with pre-commit hook
4. Commit changes

## Resources

- [CLAUDE.md: No Emoji Policy](../CLAUDE.md#no-emoji-policy)
- [GitHub Actions Output Format](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-output-parameter)
- [WCAG Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/)
- [Unicode Emoji Chart](https://unicode.org/emoji/charts/full-emoji-list.html)

---

**Last Updated:** 2025-11-09
**Policy Status:** Enforced via pre-commit hook
**Questions?** See CLAUDE.md or ask in team chat
