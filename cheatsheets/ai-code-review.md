# AI Code Review Cheatsheet

Quick reference for the AI-powered code review system with memory & context
management.

## Setup (One-Time)

```bash
# 1. Install dependencies
cd ai-utils
pip install -r requirements.txt

# 2. Configure API key
cp .env.example .env
# Edit .env and add ANTHROPIC_API_KEY

# 3. Verify setup
python quickstart.py
```

## Quick Commands

```bash
# Run setup check
python ai-utils/quickstart.py

# Basic demo (see learning in action)
python ai-utils/examples/simple_review.py

# Review waterfall code (domain-specific)
python ai-utils/examples/pr_review.py --mode waterfall

# Review PR files
python ai-utils/examples/pr_review.py --mode pr

# GitHub Actions (automatic on PR)
# Just push code - workflow runs automatically
```

## Python API

### Single File Review

```python
from code_review_assistant import create_assistant

assistant = create_assistant(memory_path="./my_memory")

result = assistant.review_code(
    code="...",
    filename="waterfall.ts",
    description="Fix calculation bug",
    context={
        "domain": "VC carry distribution",
        "conventions": "Use immutable helpers",
    },
)

print(f"Issues: {result['issues_found']}")
print(result['review'])
```

### PR Review (Multiple Files)

```python
files = [
    {"filename": "src/foo.ts", "content": "..."},
    {"filename": "src/bar.ts", "content": "..."},
]

result = assistant.review_pr(
    files=files,
    pr_description="Add feature X",
    pr_number=123,
)

for review in result['reviews']:
    print(f"{review['filename']}: {review['issues_found']} issues")
```

### Clear Conversation (Keep Memory)

```python
# Clear conversation history but preserve learned patterns
assistant.clear_conversation()
```

### Memory Statistics

```python
stats = assistant.get_memory_stats()
# → {"total_files": 5, "total_size_kb": 12.8}
```

## Memory Management

### Memory Directory Structure

```
memory_storage/
└── memories/
    ├── patterns/           # Code patterns & anti-patterns
    │   ├── concurrency.md
    │   ├── validation.md
    │   └── error_handling.md
    ├── bugs/              # Common bugs & fixes
    │   ├── waterfall_bugs.md
    │   └── async_issues.md
    ├── project_rules/     # Project conventions
    │   ├── naming.md
    │   └── architecture.md
    └── review_history.md  # Track progress
```

### View Memory Files

```python
# Manually inspect what Claude learned
import os
from pathlib import Path

memory_dir = Path("memory_storage/memories")
for md_file in memory_dir.rglob("*.md"):
    print(f"\n{md_file.name}:")
    with open(md_file) as f:
        print(f.read()[:200] + "...")
```

### Clear All Memory (Use Caution!)

```python
assistant.memory_handler.clear_all_memory()
# ⚠️ This deletes all learned patterns!
```

## Context Management

### Configuration

```python
CONTEXT_MANAGEMENT = {
    "edits": [{
        "type": "clear_tool_uses_20250919",
        "trigger": {"type": "input_tokens", "value": 50000},  # When to clear
        "keep": {"type": "tool_uses", "value": 5},           # How many to keep
        "clear_at_least": {"type": "input_tokens", "value": 3000},  # Min to clear
    }]
}
```

### When Context Clears

- **Triggered at**: 50,000 input tokens
- **What's cleared**: Old tool results (memory operations)
- **What's kept**: Last 5 tool uses + all memory files
- **Minimum cleared**: 3,000 tokens per edit

## GitHub Actions Integration

### Setup

1. Add secret to GitHub:
   - Go to: `Settings → Secrets → Actions`
   - Add: `ANTHROPIC_API_KEY`

2. Push code changes

3. Create/update PR

4. AI review appears as comment automatically

### Workflow File

Located at: `.github/workflows/ai-code-review.yml`

Triggers on:

- PR opened
- PR synchronized (new commits)
- Changes to `.ts`, `.tsx`, `.js`, `.jsx` files

## Best Practices

### 1. Start Fresh, Then Preserve

```python
# First time only: Clear to establish baseline
assistant.memory_handler.clear_all_memory()

# After that: Let memory grow
# Don't clear between sessions!
```

### 2. Provide Rich Context

```python
# Good ✓
result = assistant.review_code(
    code=code,
    filename="waterfall.ts",
    description="Fix hurdle rate edge case",
    context={
        "domain": "VC carry distribution",
        "related_files": ["types.ts", "schema.ts"],
        "conventions": "Immutable updates with helpers",
        "issue": "#123 - Incorrect distribution for 0% hurdle",
    },
)

# Less effective ✗
result = assistant.review_code(code, "waterfall.ts")
```

### 3. Review Related Files Together

```python
# Better: Review related files in same session
# Claude connects patterns across files
files = [
    "src/waterfall.ts",
    "src/__tests__/waterfall.test.ts",
    "src/types.ts",
]
result = assistant.review_pr(files, "Waterfall refactor")
```

### 4. Use Separate Memory for Projects

```python
# Project A: VC fund modeling
assistant_vc = create_assistant(memory_path="./memory_vc")

# Project B: Trading system
assistant_trading = create_assistant(memory_path="./memory_trading")
```

### 5. Monitor Memory Size

```python
stats = assistant.get_memory_stats()
if stats['total_size_kb'] > 100:  # Example threshold
    # Review memory files
    # Consolidate or delete outdated patterns
    pass
```

## Common Issues

### API Key Not Found

```bash
# Check .env file exists
ls ai-utils/.env

# Check key is set
cat ai-utils/.env | grep ANTHROPIC_API_KEY

# If not found:
cp ai-utils/.env.example ai-utils/.env
# Edit and add your key
```

### Module Not Found

```bash
# Install dependencies
cd ai-utils
pip install -r requirements.txt

# Verify installation
pip list | grep anthropic
```

### Memory Not Persisting

Check:

1. Same `memory_path` used across runs?
2. Not calling `clear_all_memory()` between sessions?
3. Directory is writable?

```python
# Verify memory path
from pathlib import Path
memory_path = Path("./memory_storage")
print(f"Exists: {memory_path.exists()}")
print(f"Writable: {os.access(memory_path, os.W_OK)}")
```

### Reviews Too Slow

```python
# Option 1: Review fewer files at once
files_batch = files[:5]  # Review in batches

# Option 2: Increase context clearing threshold
CONTEXT_MANAGEMENT["edits"][0]["trigger"]["value"] = 100000

# Option 3: Limit output tokens
result = assistant.review_code(
    code=code,
    filename="file.ts",
    max_tokens=2048,  # Shorter reviews
)
```

## Integration Points

### With ESLint

```javascript
// In lint-staged config
{
  "*.{ts,tsx}": [
    "eslint --fix",
    "python ai-utils/scripts/review_file.py"
  ]
}
```

### With Pre-commit Hooks

```bash
# .husky/pre-commit
#!/bin/sh
npm run lint-staged
python ai-utils/scripts/review_staged.py --quick
```

### With npm Scripts

```json
{
  "scripts": {
    "ai:review": "python ai-utils/quickstart.py",
    "ai:review:pr": "python ai-utils/examples/pr_review.py",
    "ai:review:waterfall": "python ai-utils/examples/pr_review.py --mode waterfall"
  }
}
```

## Cost Estimation

**Claude Sonnet 4.5 Pricing:**

- Input: $3 per million tokens
- Output: $15 per million tokens

**Typical Costs:**

- Single file review: $0.04
- 10-file PR: $0.15 (with memory)
- 20 PRs/month: ~$30/month

**Savings with Memory:**

- 38% token reduction after learning
- ~$18/month savings vs without memory

## Example Workflow

### Daily Development

```bash
# Morning: Start fresh session
cd ai-utils
python quickstart.py

# During development: Review files
python -c "
from code_review_assistant import create_assistant
assistant = create_assistant(memory_path='./dev_memory')
with open('../client/src/lib/waterfall.ts') as f:
    result = assistant.review_code(f.read(), 'waterfall.ts')
    print(result['review'])
"

# Before commit: Quick check
python scripts/review_staged.py
```

### PR Reviews

```bash
# Automatic via GitHub Actions
git push origin feature-branch
gh pr create

# Or manual review
python examples/pr_review.py --mode pr
```

### Weekly Maintenance

```bash
# Check memory growth
python -c "
from code_review_assistant import create_assistant
assistant = create_assistant()
stats = assistant.get_memory_stats()
print(f'Memory files: {stats[\"total_files\"]}')
print(f'Size: {stats[\"total_size_kb\"]} KB')
"

# Review memory files
ls -lh memory_storage/memories/

# Consolidate if needed
# (Manually edit/combine memory files)
```

## Key Files

```
ai-utils/
├── __init__.py              # Package entry point
├── memory_tool.py           # Memory operations
├── code_review_assistant.py # Main API
├── requirements.txt         # Dependencies
├── .env.example            # Config template
├── README.md               # Full documentation
├── quickstart.py           # Setup checker
│
├── examples/
│   ├── simple_review.py    # Learning demo
│   └── pr_review.py        # PR review
│
└── scripts/
    └── github_pr_review.py # GitHub Actions
```

## Resources

- **Full Docs**: `ai-utils/README.md`
- **Integration Summary**: `ai-utils/INTEGRATION_SUMMARY.md`
- **Anthropic Docs**:
  https://docs.anthropic.com/claude/docs/memory-and-context-management
- **Issues**: https://github.com/anthropics/claude-code/issues

---

**Quick Start:** `python ai-utils/quickstart.py`
