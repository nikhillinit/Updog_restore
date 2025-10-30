# Claude Code Capability Inventory

_Last Updated: 2025-10-28_

This document provides a persistent reference of ALL available capabilities to
ensure optimal tool selection and prevent redundant implementations.

## 🎯 BEFORE STARTING ANY TASK

1. Check this inventory for existing solutions
2. Verify if an agent/tool already handles the requirement
3. Look for similar patterns that can be adapted
4. Only build new if nothing exists

## 📋 Available Agents (30+)

### Financial & Domain Experts

- **waterfall-specialist** - Waterfall/carry calculations (ALREADY HANDLES ALL
  WATERFALL LOGIC)
- **kellogg-bidding-advisor** - MBA course bidding strategies

### Testing & Quality

- **test-automator** ⭐ - Comprehensive test generation, TDD, coverage
- **pr-test-analyzer** - PR test coverage review
- **code-reviewer** - Code quality and style checking
- **code-simplifier** - Simplify complex code
- **comment-analyzer** - Comment accuracy verification
- **type-design-analyzer** - Type design quality assessment
- **silent-failure-hunter** - Find suppressed errors

### Architecture & Development

- **architect-review** ⭐ - Architectural decisions and review
- **code-explorer** - Understand existing implementations
- **context-orchestrator** ⭐ - Multi-agent workflow orchestration
- **knowledge-synthesizer** - Extract patterns from interactions
- **legacy-modernizer** - Refactor and modernize code
- **dx-optimizer** - Developer experience improvements

### Database & Infrastructure

- **database-expert** - Schema design, optimization
- **database-admin** - Operations, HA, DR
- **devops-troubleshooter** - Production issues
- **incident-responder** - P0 incident management
- **chaos-engineer** - Resilience testing
- **db-migration** - Schema migrations
- **perf-guard** - Performance regression detection

### API & Backend

- **api-scaffolding:backend-architect** - Scalable API design
- **api-scaffolding:django-pro** - Django development
- **api-scaffolding:fastapi-pro** - FastAPI async patterns
- **api-scaffolding:graphql-architect** - GraphQL systems
- **api-scaffolding:fastapi-templates** - FastAPI project templates

### Documentation & Analysis

- **docs-architect** ⭐ - Comprehensive documentation
- **tutorial-engineer** - Educational content
- **debug-expert** - Error analysis
- **test-repair** - Fix failing tests

### Security

- **security-scanning:security-auditor** - DevSecOps and compliance
- **security-scanning:sast-configuration** - Static analysis setup

## 🛠 Built-in Tools

### File Operations

- **Read** - Read any file (prefer over Bash cat)
- **Write** - Create files (prefer over Bash echo)
- **Edit** - Modify files (prefer over sed/awk)
- **Glob** - Find files by pattern (prefer over find)
- **Grep** - Search content (prefer over grep command)

### Development

- **Bash** - System commands
- **Task** - Launch specialized agents ⭐
- **TodoWrite** - Task management
- **SlashCommand** - Execute custom commands
- **Skill** - Launch skills

### External

- **WebFetch** - Fetch and analyze web content
- **WebSearch** - Search the web
- **AskUserQuestion** - Get user clarification

## 🤖 MCP Tools (Multi-AI Collaboration)

- **mcp**multi-ai-collab**ask_gemini** - Ask Gemini
- **mcp**multi-ai-collab**ask_openai** - Ask OpenAI
- **mcp**multi-ai-collab**gemini_code_review** - Gemini code review
- **mcp**multi-ai-collab**gemini_think_deep** - Deep analysis
- **mcp**multi-ai-collab**gemini_brainstorm** - Creative solutions
- **mcp**multi-ai-collab**gemini_debug** - Debug assistance
- **mcp**multi-ai-collab**ai_debate** - AI debate
- **mcp**multi-ai-collab**collaborative_solve** - Multi-AI problem solving

## 📝 Slash Commands

### Testing & Quality

- **/test-smart** - Intelligent test selection based on changes
- **/fix-auto** - Automated repair of lint/format/test failures
- **/deploy-check** - Pre-deployment validation
- **/perf-guard** - Performance regression detection

### Development

- **/dev-start** - Optimized environment setup
- **/workflows** - Interactive helper for tools

### Documentation (Memory)

- **/log-change** - Update CHANGELOG.md ⭐
- **/log-decision** - Update DECISIONS.md ⭐
- **/create-cheatsheet [topic]** - Create documentation

### Custom Commands

- **/evaluate-tools** - Run tool evaluation framework (NEW)

## 💾 Memory Systems

### Project Memory

- **CLAUDE.md** - Core architecture (THIS FILE'S NEIGHBOR!)
- **CHANGELOG.md** - All timestamped changes
- **DECISIONS.md** - Architectural decisions
- **cheatsheets/** - Detailed guides and patterns

### Persistent Storage

- **Todo lists** - Task tracking across sessions
- **File system** - Any file can be persistent storage
- **Git history** - Version control as memory

### Context Awareness

- **git status/diff** - Current work context
- **Recent test failures** - Pattern recognition
- **Package.json scripts** - Available commands

## 🔄 Workflow Patterns

### BEFORE IMPLEMENTING ANYTHING:

1. **Check existing agents**: Is there already an agent for this?
2. **Check MCP tools**: Can Gemini or OpenAI help?
3. **Check slash commands**: Is there a command that does this?
4. **Check npm scripts**: Is there already a script?

### Common Mistakes to Avoid:

- ❌ Using Bash for file operations (use Read/Write/Edit)
- ❌ Implementing financial calculations (use waterfall-specialist)
- ❌ Writing test generation (use test-automator)
- ❌ Manual code review (use code-reviewer)
- ❌ Building evaluation frameworks (use existing evaluators)
- ❌ Creating new memory systems (use CHANGELOG/DECISIONS)

### Optimal Patterns:

- ✅ Use Task tool to launch specialized agents
- ✅ Run agents in parallel when independent
- ✅ Use MCP tools for second opinions
- ✅ Update CHANGELOG/DECISIONS for persistence
- ✅ Check this file FIRST before any task

## 🎯 Decision Tree

```
User Request
    ↓
[Check CAPABILITIES.md]
    ↓
Has existing agent? → YES → Use Task tool
    ↓ NO
Needs multiple agents? → YES → Use context-orchestrator
    ↓ NO
Needs external AI? → YES → Use MCP tools
    ↓ NO
File operation? → YES → Use Read/Write/Edit/Glob/Grep
    ↓ NO
System command? → YES → Use Bash
    ↓ NO
[Only then implement new solution]
```

## 📊 Documentation Quality Validation

### Framework Overview

A **Promptfoo-based evaluation system** for Phase 1 documentation modules,
adapted from Anthropic's cookbook summarization evaluation pattern. This
framework provides automated, multi-dimensional scoring of documentation quality
before marking tasks complete.

**Location:** `scripts/validation/`

**Evaluation Rubric (4 dimensions, 100 total points):**

- **Entity Truthfulness** (30%) - Accurate representation of financial concepts,
  formulas, and domain facts
- **Mathematical Accuracy** (25%) - Correct calculations, formula
  implementation, and numerical examples
- **Schema Compliance** (25%) - Documentation matches truth case schemas and
  structural requirements
- **Integration Clarity** (20%) - Clear explanation of how module integrates
  with broader system

**Minimum Threshold:** 92% (Phase 1 requirement) **Gold Standard:** 96%+
(matches Phase 1A XIRR baseline)

### When to Use

Agents should **AUTOMATICALLY** use this framework when:

1. **Completing any Phase 1 documentation module** - XIRR, fees, exit recycling,
   capital allocation
2. **Generating new ADRs** related to financial calculations
3. **Creating or updating truth case scenarios** - Validate against schemas
4. **Validating mathematical formulas** or implementation accuracy
5. **Before marking documentation tasks as "complete"** - Domain score must be
   92%+

**Integration Points:**

- Pre-commit validation for `docs/` changes
- CI/CD quality gates (enforce >= 92% before merge)
- Agent task completion verification workflow
- Automated regression detection across documentation updates

### Usage Patterns

**Manual CLI Usage (Interactive):**

```bash
cd scripts/validation
npx promptfoo eval -c fee-validation.yaml
npx promptfoo view  # Interactive HTML results dashboard
```

**Python Script Usage (Programmatic):**

```bash
python scripts/validation/custom_evals/fee_doc_domain_scorer.py \
  docs/notebooklm-sources/fees.md \
  docs/fees.truth-cases.json \
  docs/schemas/fee-truth-case.schema.json
```

**Expected Output:**

```
Domain Score: 96.3%
Entity Truthfulness: 29/30
Mathematical Accuracy: 25/25
Schema Compliance: 24/25
Integration Clarity: 20/20

Assessment: PASS (exceeds 92% threshold)
```

**Integration in Agent Workflows:**

```typescript
// Example: Validate before task completion
const result = await validateDocumentation({
  docPath: 'docs/notebooklm-sources/fees.md',
  truthCases: 'docs/fees.truth-cases.json',
  schema: 'docs/schemas/fee-truth-case.schema.json',
  minScore: 0.92,
});

if (result.score >= 0.92) {
  markTaskComplete('phase-1-fees');
} else {
  // Return list of issues for remediation
  suggestImprovements(result.feedback);
}
```

### Files & Structure

**Core Evaluator:**

- `scripts/validation/custom_evals/fee_doc_domain_scorer.py` - LLM-as-Judge
  evaluator with rubric scoring

**Prompt Templates:**

- `scripts/validation/prompts/validate_fee_doc.py` - Structured validation
  prompts for each dimension

**Configuration:**

- `scripts/validation/fee-validation.yaml` - Promptfoo configuration (test
  cases, assertions, outputs)

**Results & Logs:**

- `scripts/validation/results/` - Output directory for scores, detailed
  assessments, and trend analysis

**Test Data:**

- `docs/fees.truth-cases.json` - Ground truth cases for validation
- `docs/schemas/fee-truth-case.schema.json` - JSON Schema for structural
  validation

### Adaptation for New Modules (Phase 1C/1D/1E)

When creating validation for subsequent Phase 1 modules:

1. **Copy template:** `cp fee-validation.yaml [module]-validation.yaml`
2. **Update test cases:** Replace fee-specific cases with module content
3. **Adjust content checks:** Modify assertions in the YAML for domain-specific
   validation
4. **Configure scorer:** Update `custom_evals/[module]_doc_domain_scorer.py`
5. **Run validation:** `npx promptfoo eval -c [module]-validation.yaml`
6. **Iterate:** Continue until achieving 92%+ score
7. **Document results:** Log final score to `CHANGELOG.md` with timestamp

**Template Structure:**

```yaml
# [module]-validation.yaml
evaluateOptions:
  rubric:
    dimensions:
      - name: Entity Truthfulness
        weight: 0.30
        description: '[Module-specific entities]'
      - name: Mathematical Accuracy
        weight: 0.25
      - name: Schema Compliance
        weight: 0.25
      - name: Integration Clarity
        weight: 0.20

tests:
  - description: '[Module-specific test case]'
    vars:
      doc: 'docs/notebooklm-sources/[module].md'
      truthCases: 'docs/[module].truth-cases.json'
      schema: 'docs/schemas/[module]-truth-case.schema.json'
```

### Existing Implementation Examples

**Phase 1A (XIRR Documentation):**

- Validation config: `scripts/validation/xirr-validation.yaml`
- Score achieved: 96.3% (gold standard)
- Truth cases: `docs/xirr.truth-cases.json`

**Phase 1B (Fees Documentation):**

- Validation config: `scripts/validation/fee-validation.yaml`
- Score achieved: 96.1% (gold standard)
- Truth cases: `docs/fees.truth-cases.json`

### Troubleshooting Validation Issues

| Issue                      | Solution                                                   |
| -------------------------- | ---------------------------------------------------------- |
| Score below 92%            | Run detailed assessment, focus on lowest-scoring dimension |
| "Cannot find schema"       | Verify path in YAML matches actual file location           |
| Inconsistent scores        | Run multiple times, document variance in results           |
| LLM evaluator disagreement | Adjust prompt clarity, provide more specific examples      |
| Timeout on large docs      | Split documentation into smaller modules                   |

---

## 📚 External Resources

### Available Cookbook Patterns (C:\dev\anthropic-cookbook)

- Tool evaluation framework
- Memory system implementation
- Extended thinking patterns
- Evaluator-optimizer loops
- Agent routing patterns
- Financial modeling examples (DCF, sensitivity)

### When to Reference Cookbook:

- For implementation patterns (not domain knowledge)
- For architectural inspiration
- For production-ready code examples
- NOT for basic financial calculations (we have agents)

## 🔍 Quick Reference Questions

Before any task, ask yourself:

1. **Do I have an agent for this?** → Check agent list above
2. **Have I done this before?** → Check CHANGELOG.md
3. **Is there a decision about this?** → Check DECISIONS.md
4. **Can another AI help?** → Check MCP tools
5. **Is there a slash command?** → Check command list
6. **Is there an npm script?** → Check package.json

## 📌 Most Commonly Forgotten

These are the capabilities most often overlooked:

1. **context-orchestrator** - Handles multi-agent coordination automatically
2. **/log-change** and **/log-decision** - Built-in memory system
3. **test-automator** - Generates comprehensive tests with TDD
4. **MCP tools** - Get second opinions from Gemini/OpenAI
5. **code-explorer** - Understand existing code before modifying

---

**IMPORTANT**: This file should be checked at the START of every conversation
and before implementing any new functionality. Update it whenever new
capabilities are added.
