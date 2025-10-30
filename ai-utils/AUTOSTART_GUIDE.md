# Auto-Start Guide for AI Code Review

Three ways to automatically invoke AI code review, from most to least automated:

## Option 1: GitHub Actions (Automatic on PR) ✅ RECOMMENDED

**Already configured!** Reviews run automatically when you:

- Open a pull request
- Push new commits to a PR
- Modify any `.ts`, `.tsx`, `.js`, `.jsx` files

### Setup (One-Time)

1. Go to GitHub repository settings
2. Navigate to: **Settings → Secrets and variables → Actions**
3. Click **New repository secret**
4. Add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your API key from
     [console.anthropic.com](https://console.anthropic.com)

5. That's it! Reviews will appear as PR comments automatically.

**Workflow file:** `.github/workflows/ai-code-review.yml`

---

## Option 2: Pre-commit Hook (Before Every Commit)

Reviews staged files automatically before each commit.

### Setup

1. **Enable the hook:**

   ```bash
   # Add to .env or your shell profile
   export AI_REVIEW_ENABLED=1
   ```

2. **Test it:**

   ```bash
   # Stage some files
   git add client/src/lib/waterfall.ts

   # Commit (review runs automatically)
   git commit -m "Update waterfall logic"
   ```

3. **Output:**
   ```
   🔍 Pre-commit checks...
   🤖 Running AI code review...
   📄 client/src/lib/waterfall.ts
      Issues: 2 (1 critical)
   ✅ Pre-commit passed
   ```

### Configuration

**Quick mode** (default in hook):

- Only shows issue counts
- Fast (~5 seconds)
- Non-blocking

**Detailed mode** (manual):

```bash
python ai-utils/scripts/review_staged.py
```

**Block commits with critical issues:**

```bash
python ai-utils/scripts/review_staged.py --fail-on-issues
```

### Disable Temporarily

```bash
# For one commit
AI_REVIEW_ENABLED=0 git commit -m "Quick fix"

# Or skip hooks entirely
git commit --no-verify -m "Skip all hooks"
```

---

## Option 3: Dev Session Start (Manual)

Run review at the start of your development session.

### Add to package.json

```json
{
  "scripts": {
    "dev:start": "npm run ai:review && npm run dev",
    "ai:review": "python ai-utils/quickstart.py",
    "ai:review:quick": "python ai-utils/scripts/review_staged.py"
  }
}
```

### Usage

```bash
# Start dev session with review
npm run dev:start

# Or just run review
npm run ai:review
```

### Shell Alias (Optional)

Add to your `.bashrc` or `.zshrc`:

```bash
# Quick AI review of current changes
alias air='python ai-utils/scripts/review_staged.py'

# Review with details
alias air-full='python ai-utils/examples/pr_review.py --mode pr'
```

Then just type:

```bash
air  # Quick review of staged files
```

---

## Option 4: IDE Integration (VS Code)

### Task Configuration

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "AI Code Review",
      "type": "shell",
      "command": "python",
      "args": ["ai-utils/scripts/review_staged.py"],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "problemMatcher": []
    }
  ]
}
```

### Keyboard Shortcut

In VS Code:

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Tasks: Configure Task"
3. Select "AI Code Review"
4. Assign keyboard shortcut (e.g., `Ctrl+Shift+R`)

Now press your shortcut to run AI review anytime!

---

## Comparison Matrix

| Method              | When          | Speed  | Detail | Setup   |
| ------------------- | ------------- | ------ | ------ | ------- |
| **GitHub Actions**  | On PR         | Medium | Full   | Easy ⭐ |
| **Pre-commit Hook** | Before commit | Fast   | Quick  | Easy    |
| **Dev Session**     | Manual        | Medium | Full   | Easy    |
| **IDE Integration** | On-demand     | Fast   | Custom | Medium  |

---

## Recommended Workflow

### For Teams (Production)

```
1. GitHub Actions (automatic PR reviews)
   ↓
2. Pre-commit hook (optional, quick check)
   ↓
3. Manual review for deep dives
```

### For Individual Development

```
1. Pre-commit hook (catch issues early)
   ↓
2. GitHub Actions (final review on PR)
   ↓
3. Manual review for learning
```

---

## Performance & Cost

### Per-commit Review (Pre-commit Hook)

- **Time**: 5-10 seconds (quick mode)
- **Cost**: ~$0.02 per commit (2-3 files)
- **Frequency**: Every commit

**Daily cost** (10 commits): ~$0.20/day = **$4/month**

### Per-PR Review (GitHub Actions)

- **Time**: 30-60 seconds
- **Cost**: ~$0.15 per PR (10 files)
- **Frequency**: Per PR

**Weekly cost** (5 PRs): ~$0.75/week = **$3/month**

### Combined Cost

- Pre-commit hooks: $4/month
- PR reviews: $3/month
- **Total**: ~$7/month per active developer

---

## Troubleshooting

### Pre-commit Hook Not Running

**Check 1:** Hook enabled?

```bash
echo $AI_REVIEW_ENABLED
# Should output: 1
```

**Check 2:** Python available in git hook?

```bash
which python
# Should show path
```

**Check 3:** Script executable?

```bash
chmod +x .husky/pre-commit
```

### Review Taking Too Long

**Solution 1:** Use quick mode

```bash
# In .husky/pre-commit, use --quick flag
python ai-utils/scripts/review_staged.py --quick
```

**Solution 2:** Skip for large commits

```bash
git commit --no-verify -m "Large refactor"
```

**Solution 3:** Batch review after committing

```bash
# Disable pre-commit, then review manually
AI_REVIEW_ENABLED=0 git commit -m "WIP"
python ai-utils/examples/pr_review.py
```

### API Rate Limits

If you hit rate limits:

1. **Reduce frequency**: Disable pre-commit hook, use only PR reviews
2. **Increase delay**: Add sleep between file reviews
3. **Batch files**: Review fewer files at once

---

## Advanced: Conditional Reviews

### Only Review Specific Directories

Edit `.husky/pre-commit`:

```bash
# Only review if waterfall files changed
if git diff --cached --name-only | grep -q "client/src/lib/waterfall"; then
  echo "🤖 Reviewing waterfall changes..."
  python ai-utils/scripts/review_staged.py --quick
fi
```

### Skip Reviews for Docs/Tests

Edit `ai-utils/scripts/review_staged.py`:

```python
# Add to get_staged_files()
skip_patterns = [".test.", ".spec.", "docs/", "README"]
code_files = [
    f for f in files
    if not any(skip in f for skip in skip_patterns)
]
```

### Only Review on Main Branch

```bash
# In .husky/pre-commit
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ] && [ "$AI_REVIEW_ENABLED" = "1" ]; then
  python ai-utils/scripts/review_staged.py --fail-on-issues
fi
```

---

## Memory Persistence

All automatic reviews use the same memory storage (`.ai_memory/`), so:

1. ✅ Patterns learned in pre-commit reviews
2. ✅ Applied automatically in PR reviews
3. ✅ Shared across your entire team (in repo)
4. ✅ Gets better over time

**Location:** `.ai_memory/memories/`

**Commit it?** Yes! This shares learned patterns with your team.

---

## Getting Started

**Fastest setup** (2 minutes):

```bash
# 1. Enable pre-commit reviews
export AI_REVIEW_ENABLED=1

# 2. Add to your shell profile
echo 'export AI_REVIEW_ENABLED=1' >> ~/.bashrc  # or ~/.zshrc

# 3. Make a test commit
echo "// test" >> test.ts
git add test.ts
git commit -m "Test AI review"

# 4. See the review run automatically!
```

**For production** (5 minutes):

1. Add `ANTHROPIC_API_KEY` to GitHub secrets
2. Enable pre-commit hook (above)
3. Push a PR to test both flows
4. Done! ✅

---

## Questions?

- **Full docs**: `ai-utils/README.md`
- **Quick ref**: `cheatsheets/ai-code-review.md`
- **Issues**: https://github.com/anthropics/claude-code/issues
