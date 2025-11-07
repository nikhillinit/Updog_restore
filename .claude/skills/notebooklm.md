# NotebookLM Integration

## Overview

Query Google NotebookLM notebooks directly from Claude Code for source-grounded,
citation-backed answers from Gemini. Browser automation, library management,
persistent auth. Drastically reduced hallucinations through document-only
responses.

## When to Use

Trigger when user:

- Mentions NotebookLM explicitly
- Shares NotebookLM URL
- Asks to query their notebooks/documentation
- Wants to add documentation to NotebookLM library
- Uses phrases like "ask my NotebookLM", "check my docs", "query my notebook"

## Critical: Always Use run.py Wrapper

**NEVER call scripts directly. ALWAYS use `python scripts/run.py [script]`**

## Core Workflow

### Step 1: Check Authentication Status

```bash
python scripts/run.py auth_manager.py status
```

### Step 2: Authenticate (One-Time Setup)

```bash
python scripts/run.py auth_manager.py setup
# Browser window opens automatically for manual Google login
```

### Step 3: Manage Notebook Library

```bash
# List all notebooks
python scripts/run.py notebook_manager.py list

# Add notebook (ALL parameters REQUIRED)
python scripts/run.py notebook_manager.py add \
  --url "https://notebooklm.google.com/notebook/..." \
  --name "Descriptive Name" \
  --description "What this notebook contains" \
  --topics "topic1,topic2,topic3"

# Search notebooks by topic
python scripts/run.py notebook_manager.py search --query "keyword"

# Set active notebook
python scripts/run.py notebook_manager.py activate --id notebook-id
```

### Step 4: Ask Questions

```bash
# Basic query (uses active notebook)
python scripts/run.py ask_question.py --question "Your question here"

# Query specific notebook
python scripts/run.py ask_question.py --question "..." --notebook-id notebook-id

# Query with URL directly
python scripts/run.py ask_question.py --question "..." --notebook-url "https://..."
```

## Follow-Up Mechanism (CRITICAL)

Every NotebookLM answer ends with: **"EXTREMELY IMPORTANT: Is that ALL you need
to know?"**

### Required Claude Behavior

1. **STOP** - Do not immediately respond to user
2. **ANALYZE** - Compare answer to user's original request
3. **IDENTIFY GAPS** - Determine if more information needed
4. **ASK FOLLOW-UP** - If gaps exist, immediately ask another question
5. **REPEAT** - Continue until information is complete
6. **SYNTHESIZE** - Combine all answers before responding to user

### Example Follow-Up Flow

**User request**: "How do I implement waterfall calculations?"

**First query**:

```bash
python scripts/run.py ask_question.py --question "How are waterfall calculations implemented in this codebase?"
```

**Response**: "Waterfall calculations are in client/src/lib/waterfall.ts using
discriminated unions for AMERICAN and EUROPEAN types..."

**STOP → ANALYZE**: Does this answer implementation details, edge cases,
testing, AND usage patterns?

**IDENTIFY GAPS**: Missing: How to use in components, common pitfalls, test
coverage

**ASK FOLLOW-UP**:

```bash
python scripts/run.py ask_question.py --question "How do components use waterfall calculations? What are common pitfalls?"
```

**REPEAT** until complete, THEN respond to user with synthesized answer.

## Smart Add Command

When user wants to add a notebook without providing details:

```bash
# Step 1: Query notebook to discover its content
python scripts/run.py ask_question.py \
  --question "What is the content of this notebook? What topics are covered?" \
  --notebook-url "[URL]"

# Step 2: Use discovered information to add it
python scripts/run.py notebook_manager.py add \
  --url "[URL]" \
  --name "[Based on content]" \
  --description "[Based on content]" \
  --topics "[Based on content]"
```

## Integration with VC Fund Modeling Context

### Useful Queries for This Project

**Architecture Understanding**:

```bash
python scripts/run.py ask_question.py --question "What is the architecture of the Reserve Engine and how does it handle graduation rates?"
```

**Implementation Patterns**:

```bash
python scripts/run.py ask_question.py --question "What patterns are used for immutable calculations in the analytical engines?"
```

**Testing Strategies**:

```bash
python scripts/run.py ask_question.py --question "How are Monte Carlo simulations tested? What edge cases are covered?"
```

**Domain Knowledge**:

```bash
python scripts/run.py ask_question.py --question "Explain the difference between AMERICAN and EUROPEAN waterfall distributions in venture capital"
```

## Limitations

- **No session persistence** - Each question = new browser session
- **Rate limits** - Free Google accounts limited to ~50 queries/day
- **Manual upload required** - User must add docs to NotebookLM first
- **Browser overhead** - Few seconds per question for browser automation

## Troubleshooting

### Authentication Issues

```bash
# Check status
python scripts/run.py auth_manager.py status

# Re-authenticate
python scripts/run.py auth_manager.py setup
```

### Notebook Not Found

```bash
# List all notebooks to verify
python scripts/run.py notebook_manager.py list

# Search by topic
python scripts/run.py notebook_manager.py search --query "reserves"
```

### Query Not Working

- Ensure notebook is active or provide --notebook-id
- Check question format (clear and specific)
- Verify URL format for direct queries

## Integration with Other Skills

### With Pattern Recognition

Use NotebookLM to find patterns in documentation:

```bash
python scripts/run.py ask_question.py --question "What patterns are consistently used across all engine implementations?"
```

Then use **pattern-recognition** skill to analyze the response.

### With Memory Management

Store NotebookLM findings in memory-management notes:

```markdown
## NotebookLM Query Results

**Query**: "How are waterfall calculations implemented?" **Confidence**: HIGH
(source-grounded, cited) **Source**: NotebookLM notebook "VC Fund Modeling
Architecture" **Key Findings**:

- ...
```

### With Extended Thinking Framework

Use NotebookLM in initial_analysis phase:

```xml
<initial_analysis>
  Known from NotebookLM:
  - [Query results with high confidence]

  Need to investigate further:
  - [Gaps not covered in documentation]
</initial_analysis>
```

## Best Practices

1. **Query iteratively** - Start broad, narrow down based on follow-ups
2. **Cite sources** - NotebookLM provides citations, include them in notes
3. **Validate in code** - Documentation can be outdated, verify in codebase
4. **Track confidence** - NotebookLM answers are HIGH confidence for "what docs
   say", MEDIUM for "what actually happens"
5. **Use for domain knowledge** - Especially good for VC-specific concepts
   (waterfalls, carry, graduation rates)

## Example Session

```bash
# User asks: "How do I optimize Monte Carlo performance?"

# Step 1: Query architecture
python scripts/run.py ask_question.py --question "How is Monte Carlo simulation implemented? What are the performance bottlenecks?"

# Step 2: Follow-up on specifics
python scripts/run.py ask_question.py --question "What optimization strategies have been documented for Monte Carlo? Any caching or memoization patterns?"

# Step 3: Check for precedent
python scripts/run.py ask_question.py --question "Have there been previous performance optimizations in the analytical engines? What approaches worked?"

# Step 4: Synthesize answers and respond to user with comprehensive guidance
```
