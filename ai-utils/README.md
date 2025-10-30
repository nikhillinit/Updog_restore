# AI Utilities - Memory & Context Management

Intelligent code review system with cross-conversation learning using Claude
Sonnet 4.5's memory and context management capabilities.

## Features

- **Cross-conversation learning**: Claude remembers patterns from previous
  reviews
- **Context management**: Automatically handles long review sessions without
  losing memory
- **PR integration**: Works with GitHub Actions for automated PR reviews
- **Domain expertise**: Learns your project's specific patterns and conventions
- **Token efficiency**: Smart context clearing keeps costs down while preserving
  knowledge

## Quick Start

### 1. Install Dependencies

```bash
cd ai-utils
pip install -r requirements.txt
```

### 2. Configure API Key

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

Get your API key from: https://console.anthropic.com/

### 3. Run a Simple Review

```bash
cd examples
python simple_review.py
```

This will:

1. Review code with a race condition bug
2. Store the pattern in memory
3. Review similar code and instantly recognize the pattern
4. Show you the learned memory files

### 4. Review Your Own Code

```bash
python pr_review.py --mode waterfall
```

This reviews your waterfall calculation code with domain-specific expertise.

## How It Works

### Memory System

Claude uses a file-based memory system to persist knowledge:

```
memory_storage/
└── memories/
    ├── patterns/           # Code patterns and anti-patterns
    ├── bugs/              # Common bugs and solutions
    ├── project_rules/     # Project-specific conventions
    └── review_history.md  # Review tracking
```

### Context Management

When reviews get long (50k+ tokens), the system automatically:

1. Clears old tool results to free space
2. Keeps recent context for continuity
3. **Preserves all memory files** - your knowledge persists!

### Learning Process

**Session 1: Learning**

```python
# Claude reviews code with a bug
assistant.review_code(code_with_bug, "file1.ts")
# → Identifies race condition
# → Writes pattern to /memories/patterns/concurrency.md
```

**Session 2: Applying**

```python
# NEW conversation, but memory persists
assistant.clear_conversation()
assistant.review_code(similar_code, "file2.ts")
# → Checks memory immediately
# → Recognizes the pattern INSTANTLY
# → Faster review, more consistent
```

## Integration with Your Project

### GitHub Actions Setup

The repository includes `.github/workflows/ai-code-review.yml` for automatic PR
reviews.

**Setup:**

1. Add your Anthropic API key as a GitHub secret:
   - Go to Settings → Secrets → Actions
   - Add `ANTHROPIC_API_KEY`

2. The workflow runs automatically on PRs with TS/JS changes

3. Reviews appear as PR comments with:
   - File-by-file analysis
   - Issue severity ratings
   - Learned patterns applied

### Manual PR Review

```python
from code_review_assistant import create_assistant

assistant = create_assistant(memory_path="./project_memory")

result = assistant.review_pr(
    files=[
        {"filename": "src/foo.ts", "content": "..."},
        {"filename": "src/bar.ts", "content": "..."},
    ],
    pr_description="Add new feature X",
    pr_number=123,
)

print(f"Issues found: {result['summary']['total_issues']}")
for review in result['reviews']:
    print(f"{review['filename']}: {review['issues_found']} issues")
```

### Domain-Specific Reviews

Teach Claude about your project's domain:

```python
result = assistant.review_code(
    code=waterfall_code,
    filename="waterfall.ts",
    description="Carry distribution calculations",
    context={
        "domain": "Venture capital waterfalls",
        "conventions": "Use applyWaterfallChange() helper",
        "patterns": "Immutable updates, schema validation",
    },
)
```

After a few reviews, Claude learns:

- Your specific patterns (like `applyWaterfallChange()`)
- Common bugs in your domain (race conditions in async code)
- Project conventions (immutability, type safety)

## API Reference

### CodeReviewAssistant

```python
from code_review_assistant import create_assistant

# Create assistant
assistant = create_assistant(memory_path="./memory_storage")

# Review single file
result = assistant.review_code(
    code: str,
    filename: str,
    description: str = "",
    context: Optional[Dict[str, str]] = None,
)

# Review pull request
result = assistant.review_pr(
    files: List[Dict[str, str]],  # [{"filename": "...", "content": "..."}]
    pr_description: str = "",
    pr_number: Optional[int] = None,
)

# Clear conversation (keeps memory)
assistant.clear_conversation()

# Get memory statistics
stats = assistant.get_memory_stats()
# → {"total_files": 3, "total_size_kb": 12.5}
```

### Return Format

```python
{
    "review": "Detailed review text with issue descriptions",
    "issues_found": 5,  # Count of issues identified
    "token_usage": {
        "input_tokens": 8234,
        "output_tokens": 1523,
    },
    "context_cleared": False,  # Whether context was cleared
}
```

## Configuration

### Context Management

Adjust when and how context is cleared:

```python
CONTEXT_MANAGEMENT = {
    "edits": [{
        "type": "clear_tool_uses_20250919",
        "trigger": {"type": "input_tokens", "value": 50000},  # When to trigger
        "keep": {"type": "tool_uses", "value": 5},  # How many to keep
        "clear_at_least": {"type": "input_tokens", "value": 3000},  # Min to clear
    }]
}
```

### Memory Organization

Suggested directory structure:

```
memories/
├── patterns/
│   ├── concurrency.md       # Race conditions, thread safety
│   ├── error_handling.md    # Error patterns
│   └── validation.md        # Input validation patterns
├── bugs/
│   ├── waterfall_bugs.md    # Domain-specific bugs
│   └── async_issues.md      # Async/await problems
├── project_rules/
│   ├── naming.md           # Naming conventions
│   └── architecture.md     # Architecture patterns
└── review_history.md       # Track progress
```

## Best Practices

### 1. Start Fresh, Then Preserve

```python
# First time: Clear to establish baseline
assistant.memory_handler.clear_all_memory()

# After that: Let it learn and grow
# Don't clear memory between sessions!
```

### 2. Provide Context

```python
# Good: Rich context helps Claude learn
assistant.review_code(
    code=code,
    filename="waterfall.ts",
    description="Fix hurdle rate calculation bug",
    context={
        "domain": "VC carry distribution",
        "related_files": ["types.ts", "schema.ts"],
        "conventions": "Use helpers, validate with schemas",
    },
)

# Less effective: Minimal context
assistant.review_code(code, "waterfall.ts")
```

### 3. Review Related Code Together

```python
# Better: Review related files in same session
# Claude can connect patterns across files
files = [
    "src/waterfall.ts",
    "src/__tests__/waterfall.test.ts",
    "src/types.ts",
]
assistant.review_pr(files, pr_description="Waterfall refactor")
```

### 4. Monitor Memory Growth

```python
stats = assistant.get_memory_stats()
if stats['total_size_kb'] > 100:  # Example threshold
    # Review and consolidate memory files
    # Delete outdated patterns
    pass
```

### 5. Use Separate Memory for Different Projects

```python
# Project A: VC fund modeling
assistant_a = create_assistant(memory_path="./memory_fund")

# Project B: Trading system
assistant_b = create_assistant(memory_path="./memory_trading")
```

## Examples

### Example 1: First-Time Review

```bash
cd ai-utils/examples
python simple_review.py
```

Output:

```
SESSION 1: Learning from a bug
Issues found: 2
- Race condition in shared state
- Missing synchronization

Claude writes to: /memories/patterns/concurrency.md

SESSION 2: Applying learned pattern
Issues found: 1
- Same race condition pattern (recognized instantly!)

✅ Review 40% faster due to memory
```

### Example 2: PR Review

```bash
python pr_review.py --mode pr
```

Reviews multiple files and posts aggregate results.

### Example 3: Domain-Specific

```bash
python pr_review.py --mode waterfall
```

Reviews waterfall code with VC domain expertise.

## Integration with Existing Tools

### With ESLint

```javascript
// In your lint-staged config
{
  "*.{ts,tsx}": [
    "eslint --fix",
    "python ai-utils/scripts/review_staged.py"
  ]
}
```

### With Pre-commit Hooks

```bash
# .husky/pre-commit
npm run lint-staged
python ai-utils/scripts/review_staged.py --quick
```

### With CI/CD

Already integrated! See `.github/workflows/ai-code-review.yml`

## Troubleshooting

### "ANTHROPIC_API_KEY not found"

```bash
cp .env.example .env
# Edit .env and add your API key
```

### "Module not found: anthropic"

```bash
cd ai-utils
pip install -r requirements.txt
```

### Memory not persisting

Check that:

1. Memory path is correct and writable
2. You're not calling `clear_all_memory()` between sessions
3. You're using the same `memory_path` across runs

### Reviews taking too long

1. Review fewer files at once
2. Increase context clearing threshold
3. Use `max_tokens` parameter to limit output

## Advanced Usage

### Custom System Prompts

```python
assistant._create_system_prompt = lambda: """
You are an expert in VC fund modeling.
Focus on:
- Financial calculation correctness
- Waterfall distribution logic
- Schema validation
- Performance optimization
"""
```

### Parallel Reviews

```python
from concurrent.futures import ThreadPoolExecutor

files = [...]  # Your files

with ThreadPoolExecutor(max_workers=3) as executor:
    futures = []
    for file in files:
        assistant = create_assistant(memory_path=f"./memory_{file['filename']}")
        future = executor.submit(assistant.review_code, file['content'], file['filename'])
        futures.append(future)

    results = [f.result() for f in futures]
```

### Memory Analysis

````python
import os
from pathlib import Path

memory_dir = Path("./memory_storage/memories")

for md_file in memory_dir.rglob("*.md"):
    with open(md_file) as f:
        content = f.read()
        print(f"\n{md_file.name}:")
        print(f"  Patterns learned: {content.count('##')}")
        print(f"  Examples: {content.count('```')}")
````

## Support

- **Issues**: [GitHub Issues](https://github.com/anthropics/claude-code/issues)
- **Docs**: [Claude Code Documentation](https://docs.claude.com/claude-code)
- **API**: [Anthropic API Docs](https://docs.anthropic.com)

## License

MIT (same as parent project)

---

**Built with Claude Sonnet 4.5** 🤖
