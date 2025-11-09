# Claude Code Capability Inventory

_Last Updated: 2025-11-07_

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
- **Extended Thinking (ThinkingMixin)** ⭐ - Add deep reasoning to ANY agent via
  mixin pattern (see `packages/agent-core/THINKING_QUICK_START.md`)

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
- **Skill** - Launch skills ⭐ (see Skills Library below)

### External

- **WebFetch** - Fetch and analyze web content
- **WebSearch** - Search the web
- **AskUserQuestion** - Get user clarification

## 🧠 Skills Library (Superpowers Framework)

**Location**: `.claude/skills/` **Source**:
[obra/superpowers](https://github.com/obra/superpowers)

Structured thinking frameworks and workflow patterns to enhance problem-solving.
All skills persist across sessions and are project-local. **Skills activate
automatically when relevant to the task**, making their workflows mandatory.

**Usage**: `Skill("skill-name")` - The skill's prompt expands with detailed
guidance

### 🧪 Testing Skills (3)

- **test-driven-development** ⭐ - RED-GREEN-REFACTOR cycle (write failing test
  → implement → refactor). Activates when implementing features.
- **condition-based-waiting** - Replace arbitrary timeouts with condition
  polling for async tests. Eliminates flaky tests from timing issues.
- **testing-anti-patterns** - Prevent testing mock behavior, production
  pollution with test-only methods, and mocking without understanding
  dependencies.

### 🐛 Debugging & Problem Solving (4)

- **systematic-debugging** ⭐ - Four-phase framework (root cause → pattern
  analysis → hypothesis → implementation). **Iron Law: NO FIXES WITHOUT ROOT
  CAUSE FIRST**. Activates automatically when debugging.
- **root-cause-tracing** - Trace bugs backward through call stack to find
  original trigger (not just symptom)
- **verification-before-completion** ⭐ - Requires running verification commands
  and confirming output before making success claims. Activates before claiming
  work complete. Evidence before assertions always.
- **defense-in-depth** - Validates at every layer data passes through to make
  bugs structurally impossible. Use when invalid data causes failures deep in
  execution.

### 🤝 Collaboration Skills (9)

- **brainstorming** ⭐ - Transform rough ideas into designs through Socratic
  questioning (6 phases: understanding → exploration → presentation →
  documentation → worktree → planning)
- **writing-plans** ⭐ - Create implementation plans with complete code examples
  (bite-sized 2-5 min tasks, TDD cycle, frequent commits)
- **executing-plans** - Execute plans in controlled batches with review
  checkpoints. Load plan, review critically, execute tasks in batches, report
  for review between batches.
- **dispatching-parallel-agents** - Launch multiple agents for independent
  problem domains (3+ failures → concurrent investigation)
- **requesting-code-review** - Pre-review checklist and quality gates before
  marking work ready for review
- **receiving-code-review** - Requires technical rigor and verification when
  receiving feedback, not performative agreement or blind implementation
- **using-git-worktrees** - Create isolated git worktrees with smart directory
  selection and safety verification for parallel development
- **finishing-a-development-branch** - Guides completion of development work by
  presenting structured options for merge, PR, or cleanup
- **subagent-driven-development** - Dispatches fresh subagent for each task with
  code review between tasks, enabling fast iteration with quality gates

### 🧠 Thinking Frameworks (4)

- **inversion-thinking** - Identify pitfalls by inverting questions ("What would
  make this terrible?")
- **analogical-thinking** - Bridge concepts with structured analogies ("X is
  like Y because..., but differs in...")
- **pattern-recognition** - Detect patterns, contradictions, and causal
  relationships across code/docs
- **extended-thinking-framework** - Reusable XML scaffold for complex tasks
  (analysis → strategy → execution → synthesis → quality check)

### 💾 Memory & Knowledge (2)

- **memory-management** - Structured notes with confidence levels (context
  maintenance, information organization, cross-referencing)
- **continuous-improvement** - Self-review process (5 reflection prompts: what
  worked, what was inefficient, surprises, clarity improvements, next time)

### 🔗 Integration & Tools (2)

- **integration-with-other-skills** - Coordinate multiple skills/tools (MCP
  servers, project tools, memory systems, thinking frameworks)
- **notebooklm** - Query Google NotebookLM notebooks for source-grounded answers
  (browser automation, follow-up mechanism)

### 📖 Meta Skills (4)

- **writing-skills** - Apply TDD to process documentation by testing with
  subagents before writing, iterating until bulletproof against rationalization
- **sharing-skills** - Guides process of branching, committing, pushing, and
  creating PR to contribute skills back to upstream repository
- **testing-skills-with-subagents** - Applies RED-GREEN-REFACTOR cycle to
  process documentation by running baseline without skill, writing to address
  failures, iterating to close loopholes
- **using-superpowers** ⭐ - Establishes mandatory workflows for finding and
  using skills, including using Skill tool before announcing usage, following
  brainstorming before coding, and creating TodoWrite todos for checklists

### 📋 Superpowers Slash Commands

**Location**: `.claude/commands/superpowers/` (if installed)

These commands are thin wrappers that activate the corresponding skill:

- **/superpowers:brainstorm** - Activates brainstorming skill
- **/superpowers:write-plan** - Activates writing-plans skill
- **/superpowers:execute-plan** - Activates executing-plans skill

**Quick Reference**: See [.claude/skills/README.md](.claude/skills/README.md)
for:

- Complete skill catalog with usage examples
- Skill combination workflows (debugging, feature dev, research)
- Integration with project tools (/test-smart, /fix-auto, /log-change)
- VC fund modeling context examples

### Common Skill Workflows

**TDD Feature Development** (Superpowers-recommended):

```
test-driven-development (auto-activates) →
  RED: Write failing test
  GREEN: Minimal implementation
  REFACTOR: Improve design
→ verification-before-completion (before claiming done) →
continuous-improvement (reflect)
```

**Debugging Workflow** (Superpowers-enforced):

```
systematic-debugging (auto-activates when debugging) →
  Phase 1: Root Cause Investigation (NO FIXES YET)
  Phase 2: Pattern Analysis
  Phase 3: Hypothesis Testing
  Phase 4: Implementation
→ verification-before-completion (run tests, confirm output) →
defense-in-depth (add validation layers) →
continuous-improvement (reflect)
```

**Feature Planning Workflow**:

```
brainstorming (Socratic design refinement) →
inversion-thinking (identify failure modes) →
writing-plans (detailed implementation tasks) →
subagent-driven-development (execute with code review gates) →
verification-before-completion (confirm success) →
finishing-a-development-branch (merge/PR decision)
```

**Plan Execution Workflow**:

```
executing-plans (load plan, batch execution) →
  Batch 1 → Review checkpoint
  Batch 2 → Review checkpoint
  ...
→ verification-before-completion (confirm all done) →
memory-management (document learnings)
```

**Code Review Workflow**:

```
requesting-code-review (pre-review checklist) →
  Submit for review
→ receiving-code-review (technical rigor, not blind agreement) →
verification-before-completion (run tests after changes)
```

**Research & Analysis**:

```
extended-thinking-framework (structure) → pattern-recognition (analyze) →
analogical-thinking (explain) → memory-management (document) →
notebooklm (validate with sources)
```

**Multi-Problem Investigation**:

````
Identify independent failures → dispatching-parallel-agents →
Each agent uses systematic-debugging → pattern-recognition (synthesize) →
continuous-improvement (refine)

## 🤖 MCP Tools (Multi-AI Collaboration)

### Multi-AI Collaboration
- **mcp__multi-ai-collab__ask_gemini** - Ask Gemini
- **mcp__multi-ai-collab__ask_openai** - Ask OpenAI
- **mcp__multi-ai-collab__gemini_code_review** - Gemini code review
- **mcp__multi-ai-collab__gemini_think_deep** - Deep analysis
- **mcp__multi-ai-collab__gemini_brainstorm** - Creative solutions
- **mcp__multi-ai-collab__gemini_debug** - Debug assistance
- **mcp__multi-ai-collab__ai_debate** - AI debate
- **mcp__multi-ai-collab__collaborative_solve** - Multi-AI problem solving

### NotebookLM Integration ⭐ NEW (2025-11-07)
**Source-grounded research with Gemini 2.5 + your documentation**

**Core Tools** (16 total):
- **mcp__notebooklm-mcp__ask_question** - Query notebooks with citations
- **mcp__notebooklm-mcp__setup_auth** - Google authentication
- **mcp__notebooklm-mcp__re_auth** - Switch accounts (rate limit workaround)
- **mcp__notebooklm-mcp__get_health** - Server status

**Session Management**:
- **list_sessions**, **close_session**, **reset_session** - Session lifecycle

**Notebook Library**:
- **add_notebook**, **list_notebooks**, **get_notebook**, **select_notebook**
- **update_notebook**, **remove_notebook**, **search_notebooks**
- **get_library_stats** - Library analytics

**Key Features**:
- ✅ Zero hallucinations (refuses if info not in docs)
- ✅ Multi-document synthesis across 50+ files
- ✅ Persistent sessions with context
- ✅ Rate limit management (50 queries/day, multi-account support)
- ✅ 9 active notebooks documented in [NOTEBOOKLM-LINKS.md](NOTEBOOKLM-LINKS.md)

**Documentation**:
- [cheatsheets/notebooklm-mcp-tools.md](cheatsheets/notebooklm-mcp-tools.md) - Complete tool reference
- [cheatsheets/notebooklm-agent-integration.md](cheatsheets/notebooklm-agent-integration.md) - Integration patterns
- [NOTEBOOKLM-LINKS.md](NOTEBOOKLM-LINKS.md) - Notebook registry (9 notebooks, 70+ files)

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

### Native Memory Tool Integration ⭐ NEW (2025-11-05)

**Claude's Native Memory Tool** (`memory_20250818`) with cross-conversation
pattern learning:

- **ToolHandler** - Process tool_use blocks from Claude API
- **HybridMemoryManager** - Redis (fast) + Native memory (persistent)
- **PatternLearningEngine** - Learn from past executions, apply to future tasks
- **TenantContext** - Multi-user/multi-project isolation
- **TokenBudgetManager** - Intelligent token allocation (30% history, 15%
  memory, 10% patterns)
- **MemoryEventBus** - Event-driven cache invalidation

**Memory Scopes:**

- `session` - Redis only (1-hour TTL, fast access)
- `project` - Redis + Native (team-shared knowledge)
- `longterm` - Native only (persistent cross-session learning)

**Usage:**

```typescript
import { PatternLearningEngine, getStorage } from '@agent-core';

// Learn from execution
const engine = new PatternLearningEngine(storage, 'user:project');
await engine.recordPattern(result, context);

// Apply to future tasks
const patterns = await engine.getRelevantPatterns({ operation, fileTypes });
````

**Memory-Enabled TypeScript Agents (packages/):**

- ✅ **TestRepairAgent** (`agent:test-repair`) - Learns test failure patterns
  and successful repairs
- ✅ **BundleOptimizationAgent** (`agent:bundle-optimization`) - Learns
  optimization patterns across builds
- ✅ **CodexReviewAgent** (`agent:codex-review`) - Remembers code review
  patterns and common issues
- ✅ **DependencyAnalysisAgent** (`agent:dependency-analysis`) - Tracks
  dependency patterns and successful optimizations
- ✅ **RouteOptimizationAgent** (`agent:route-optimization`) - Learns route
  optimization patterns and lazy loading effectiveness
- ✅ **ZencoderAgent** (`agent:zencoder`) - Remembers fix patterns and
  successful code transformations

**Memory-Enabled Project-Level Agents (.claude/agents/):**

- ✅ **code-reviewer** (`agent:code-reviewer`) - Learns CLAUDE.md violations and
  project conventions
- ✅ **waterfall-specialist** (`agent:waterfall-specialist`) - Remembers
  waterfall validation patterns and edge cases
- ✅ **test-repair** (`agent:test-repair`) - Learns test failure patterns and
  repair strategies
- ✅ **perf-guard** (`agent:perf-guard`) - Tracks bundle size baselines and
  optimization strategies
- ✅ **db-migration** (`agent:db-migration`) - Remembers schema migration
  patterns and rollback strategies
- ✅ **code-simplifier** (`agent:code-simplifier`) - Learns project-specific
  simplification patterns
- ✅ **comment-analyzer** (`agent:comment-analyzer`) - Tracks comment rot
  patterns and documentation standards
- ✅ **pr-test-analyzer** (`agent:pr-test-analyzer`) - Remembers test coverage
  gaps and edge case patterns
- ✅ **silent-failure-hunter** (`agent:silent-failure-hunter`) - Learns silent
  failure patterns and error handling standards
- ✅ **type-design-analyzer** (`agent:type-design-analyzer`) - Remembers strong
  type designs and invariant patterns

**Memory-Enabled Global Agents (Project Overrides in .claude/agents/):**

- ✅ **general-purpose** (`agent:general-purpose:updog`) - Learns research
  patterns and codebase structure
- ✅ **test-automator** (`agent:test-automator:updog`) - Remembers TDD patterns
  and coverage gaps
- ✅ **legacy-modernizer** (`agent:legacy-modernizer:updog`) - Tracks migration
  patterns and refactoring strategies
- ✅ **incident-responder** (`agent:incident-responder:updog`) - Learns incident
  patterns and mitigation strategies
- ✅ **dx-optimizer** (`agent:dx-optimizer:updog`) - Remembers workflow friction
  points and automation solutions
- ✅ **docs-architect** (`agent:docs-architect:updog`) - Learns documentation
  patterns and explanation strategies
- ✅ **devops-troubleshooter** (`agent:devops-troubleshooter:updog`) - Tracks
  infrastructure failure patterns
- ✅ **debug-expert** (`agent:debug-expert:updog`) - Remembers bug patterns and
  debugging strategies
- ✅ **database-expert** (`agent:database-expert:updog`) - Learns schema
  patterns and optimization strategies
- ✅ **context-orchestrator** (`agent:context-orchestrator:updog`) - Tracks
  context management and orchestration patterns
- ✅ **code-explorer** (`agent:code-explorer:updog`) - Remembers codebase
  structure and feature implementations
- ✅ **chaos-engineer** (`agent:chaos-engineer:updog`) - Learns system weak
  points and resilience strategies

**Total**: 28 memory-enabled agents (6 TypeScript + 10 Project-Level + 12 Global
Overrides)

**Documentation:**

- `NATIVE-MEMORY-INTEGRATION.md` - Complete integration guide
- `MIGRATION-NATIVE-MEMORY.md` - Migration from Redis-only
- `packages/agent-core/demo-native-memory.ts` - Working examples
- `cheatsheets/agent-memory-integration.md` - Step-by-step enablement guide

### Project Memory

- **CLAUDE.md** - Core architecture (THIS FILE'S NEIGHBOR!)
- **CHANGELOG.md** - All timestamped changes
- **DECISIONS.md** - Architectural decisions
- **cheatsheets/** - Detailed guides and patterns

### Persistent Storage

- **Redis** - Fast session memory (ConversationMemory)
- **Native Memory** - Persistent cross-session learning (NEW)
- **Todo lists** - Task tracking across sessions
- **File system** - Any file can be persistent storage
- **Git history** - Version control as memory

### Context Awareness

- **git status/diff** - Current work context
- **Recent test failures** - Pattern recognition
- **Package.json scripts** - Available commands
- **Learned patterns** - Success/failure patterns from past executions (NEW)

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
2. **Do I have a skill for this?** → Check Skills Library (`.claude/skills/`)
3. **Have I done this before?** → Check CHANGELOG.md
4. **Is there a decision about this?** → Check DECISIONS.md
5. **Can another AI help?** → Check MCP tools
6. **Is there a slash command?** → Check command list
7. **Is there an npm script?** → Check package.json

## 📌 Most Commonly Forgotten

These are the capabilities most often overlooked:

1. **Superpowers Skills Library** ⭐ - 28 skills across 6 categories that
   **auto-activate when relevant**:
   - **test-driven-development** - Activates during feature implementation
   - **systematic-debugging** - Activates when debugging (NO FIXES WITHOUT ROOT
     CAUSE)
   - **verification-before-completion** - Activates before claiming work done
   - **brainstorming** - Socratic design refinement before coding
   - **executing-plans** - Batch execution with review checkpoints
   - **subagent-driven-development** - Fast iteration with code review gates
2. **using-superpowers skill** - Establishes mandatory workflows for skill usage
   (check FIRST before announcing skill usage)
3. **Extended Thinking (ThinkingMixin)** - Add deep reasoning to any agent with
   zero breaking changes
4. **context-orchestrator** - Handles multi-agent coordination automatically
5. **/log-change** and **/log-decision** - Built-in memory system
6. **test-automator** - Generates comprehensive tests with TDD
7. **MCP tools** - Get second opinions from Gemini/OpenAI
8. **code-explorer** - Understand existing code before modifying

## 🧠 Extended Thinking Integration

**Location**: `packages/agent-core/ThinkingMixin.ts`

Add deep reasoning capabilities to ANY agent via mixin pattern:

```typescript
import { withThinking } from '@agent-core';

// Before
class MyAgent extends BaseAgent {}

// After - that's it!
class MyAgent extends withThinking(BaseAgent) {
  async run(input) {
    const analysis = await this.think('Analyze this...', { depth: 'deep' });
    return this.processThinking(analysis);
  }
}
```

**Features**:

- Zero breaking changes - works with all existing agents
- Automatic budget management ($1 default, configurable)
- Smart depth selection (quick ~$0.03, deep ~$0.10)
- Cost tracking and health monitoring
- Works alongside native memory (complementary capabilities)

**Migrated Agents**: ✅ **ALL 6 TypeScript agents MIGRATED** (100% complete):

- TestRepairAgent, BundleOptimizationAgent, CodexReviewAgent
- DependencyAnalysisAgent, RouteOptimizationAgent, ZencoderAgent

**Docs**:

- Quick Start: `packages/agent-core/THINKING_QUICK_START.md`
- Migration Guide: `packages/agent-core/THINKING_MIGRATION_GUIDE.md`
- Examples: `packages/agent-core/examples/thinking-integration-example.ts`
- Tests: `packages/agent-core/src/__tests__/ThinkingMixin.test.ts`

**Check Readiness**: `node scripts/check-thinking-migration-readiness.mjs`

---

**IMPORTANT**: This file should be checked at the START of every conversation
and before implementing any new functionality. Update it whenever new
capabilities are added.

---

## 🧪 Testing Infrastructure

### XIRR Calculation - Golden Test Suite

**Purpose:** Comprehensive XIRR validation with Excel parity for fund IRR
calculations

**Test Coverage:** 50 test cases across 3 test files

- **Standard cases:** 2-flow baseline, multi-round, irregular spacing
- **Edge cases:** Negative IRR, near-zero, very high returns (>100%)
- **Pathological cases:** Invalid inputs, extreme values, convergence failures
- **Real-world patterns:** Monthly/quarterly flows, early distributions +
  follow-on
- **Performance:** <10ms per calculation, 100-flow stress tests
- **Determinism:** 100-run repeatability validation

**Excel Parity:**

- Tolerance: ±1e-7 (0.00001% accuracy)
- All expected values Excel-validated
- Implementation: Newton-Raphson + Brent/bisection hybrid fallback

**Test Files:**

- [tests/unit/xirr-golden-set.test.ts](tests/unit/xirr-golden-set.test.ts) (18
  cases)
- [server/services/**tests**/xirr-golden-set.test.ts](server/services/__tests__/xirr-golden-set.test.ts)
  (20 cases)
- [tests/unit/analytics-xirr.test.ts](tests/unit/analytics-xirr.test.ts) (12
  cases)

**Implementation:**
[client/src/lib/finance/xirr.ts](client/src/lib/finance/xirr.ts)

**Usage Example:**

```typescript
import { xirrNewtonBisection } from '@/lib/finance/xirr';

const flows = [
  { date: new Date('2020-01-01'), amount: -10000000 },
  { date: new Date('2025-01-01'), amount: 25000000 },
];

const result = xirrNewtonBisection(flows);
// result.irr: 0.2010340779 (20.10% IRR)
// result.converged: true
// result.method: 'newton'
```

**Status:** ✅ COMPLETE (50 test cases passing, Excel-validated)

---

### Deferred Testing Work

The following testing enhancements are deferred to separate PRs:

#### Property-Based Testing (Deferred - Phase 4)

**Scope:** Concatenation property for XIRR calculations **Framework:**
[fast-check](https://github.com/dubzzz/fast-check) **Estimate:** 2 days
(research + framework setup + test cases) **Tracking:** Create GitHub issue in
Phase 4 planning

#### Bundle Analysis for Recharts (Deferred - Future optimization)

**Scope:** Lazy loading investigation for chart library **Rationale:** Requires
bundle analysis to justify optimization cost **Action:** Run
`npm run perf-guard` for baseline before optimization **Current Size:** TBD
(baseline measurement needed)

#### Runtime Zod Validations (Covered - Phase 3)

**Scope:** Schema validation at API boundaries **Status:** ✅ COVERED by Phase 3
Portfolio Route API work **Reference:** `shared/schemas/` for Zod validation
schemas **ADR:** ADR-011 Anti-Pattern Prevention Strategy

---

### Dependencies Status

#### lodash (Removed)

**Status:** ✅ REMOVED (not found in package.json) **Date:** Prior to Nov 2025
**Replaced With:** Native ES2023+ methods (Array.prototype.at, Object.groupBy,
etc.)

#### xlsx (Eager Loading)

**Status:** ⚠️ EAGERLY LOADED (not lazily loaded) **Current:** Direct dependency
`"xlsx": "^0.18.5"` in package.json **Rationale:** No performance issues
observed; lazy loading deferred until bundle analysis shows need **Future:**
Consider dynamic `import('xlsx')` when Excel export usage metrics available
