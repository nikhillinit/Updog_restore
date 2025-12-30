---
status: ACTIVE
audience: both
last_updated: 2025-12-12
categories: [development, skills-tools]
keywords: [capabilities, agents, skills, tools, scripts, existing-solutions]
source_of_truth: true
agent_routing:
  priority: 1
  route_hint: 'Read this FIRST before implementing anything new.'
  use_cases: [capability_discovery, feature_planning]
maintenance:
  owner: 'Core Team'
  review_cadence: 'P90D'
---

# Claude Code Capability Inventory

_Last Updated: 2025-12-12_

This document provides a persistent reference of ALL available capabilities to
ensure optimal tool selection and prevent redundant implementations.

**IMPORTANT:** This document is 85% complete as a capability inventory. For
complete infrastructure understanding, also read:

1. **[.claude/PROJECT-UNDERSTANDING.md](.claude/PROJECT-UNDERSTANDING.md)** -
   Complete infrastructure reference (permanent guide)
2. **[docs/PHOENIX-SOT/execution-plan-v2.34.md](docs/PHOENIX-SOT/execution-plan-v2.34.md)** -
   Phoenix validation-first execution plan (current) _(Note:
   PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md archived - see
   docs/archive/phoenix/)_
3. **[AI-WORKFLOW-COMPLETE-GUIDE.md](AI-WORKFLOW-COMPLETE-GUIDE.md)** - 28
   agents, orchestration patterns
4. **[COMPREHENSIVE-WORKFLOW-GUIDE.md](COMPREHENSIVE-WORKFLOW-GUIDE.md)** -
   Extended practical guide

## BEFORE STARTING ANY TASK

1. **Read [.claude/PROJECT-UNDERSTANDING.md](.claude/PROJECT-UNDERSTANDING.md)**
   for complete infrastructure context
2. Check this inventory for existing solutions
3. Verify if an agent/tool already handles the requirement
4. Look for similar patterns that can be adapted
5. Only build new if nothing exists

## Available Agents (250+ across all levels)

### Agent Architecture (Multi-Level)

Agents are organized across three levels for optimal reusability and
maintenance:

#### **User-Level Agents (15)** - Global, available across ALL projects

**Location:** `C:\Users\nikhi\.claude\agents\`

**Architecture & Planning:**

- **architect-review** - Architectural decisions and review
- **code-explorer** - Understand existing implementations
- **context-orchestrator** - Multi-agent workflow orchestration
- **knowledge-synthesizer** - Extract patterns from interactions
- **legacy-modernizer** - Refactor and modernize code
- **dx-optimizer** - Developer experience improvements

**Database & Infrastructure:**

- **database-expert** - Schema design, optimization
- **database-admin** - Operations, HA, DR
- **devops-troubleshooter** - Production issues
- **incident-responder** - P0 incident management
- **chaos-engineer** - Resilience testing

**Documentation & Analysis:**

- **docs-architect** - Comprehensive documentation
- **debug-expert** - Error analysis

**Testing:**

- **test-automator** - Comprehensive test generation, TDD, coverage

#### **Project-Level Agents (23)** - Updog_restore specific

**Location:** `.claude\agents\`

**Domain-Specific (Venture Capital Fund Modeling):**

- **waterfall-specialist** - Waterfall/carry calculations (HANDLES ALL WATERFALL
  LOGIC)

**Testing & Quality:**

- **test-repair** - Fix failing tests, flakiness detection and management
- **test-scaffolder** - Scaffold test infrastructure for new modules/packages
  (NEW)
- **pr-test-analyzer** - PR test coverage review
- **code-reviewer** - Code quality and style checking
- **code-simplifier** - Simplify complex code
- **comment-analyzer** - Comment accuracy verification
- **type-design-analyzer** - Type design quality assessment
- **silent-failure-hunter** - Find suppressed errors

**Infrastructure:**

- **db-migration** - Schema migrations
- **perf-guard** - Performance regression detection
- **general-purpose** - Research and exploration

**CI Quality Gate Diagnosers (v4 optimal):**

- **schema-drift-checker** - Diagnose schema alignment across
  Migration/Drizzle/Zod/Mock layers
- **playwright-test-author** - Create E2E tests for browser-only behaviors
  (invoked by test-repair)
- **parity-auditor** - Assess Excel parity impact for financial calculation
  changes
- **perf-regression-triager** - Diagnose performance regressions from
  bench-check
- **baseline-regression-explainer** - Diagnose quality metric regressions
  (tests, TS, lint, bundle)

**Shared with User-Level (Project overrides):**

- chaos-engineer, code-explorer, context-orchestrator, database-expert,
  debug-expert, devops-troubleshooter, docs-architect, dx-optimizer,
  incident-responder, legacy-modernizer

#### **Marketplace Agents (200+)** - Via Plugins

**Location:**
`C:\Users\nikhi\.claude\plugins\marketplaces\claude-code-workflows\`

**40+ plugin collections including:**

- **api-scaffolding** - backend-architect, django-pro, fastapi-pro,
  graphql-architect
- **security-comprehensive** - security-auditor, sast-configuration
- **kubernetes-operations** - K8s specialist agents
- **blockchain-web3** - Smart contract development
- **cloud-infrastructure** - AWS/Azure/GCP specialists
- **database-design** - Schema and optimization experts
- **accessibility-compliance** - WCAG validation
- **code-documentation** - Doc generation and maintenance
- **cicd-automation** - Pipeline specialists
- ...and 30+ more specialized domains

**Access:** Available via Claude Code plugin system

#### **Archived Agents (27)** - BMad Methodology

**Location:** `archive/2025-10-07/directories-backup/repo/`

**BMad Project Management Agents (10):**

- analyst (Mary ), architect, pm, po, qa, sm, ux-expert
- bmad-master, bmad-orchestrator, dev

**BMad Tasks (17):** Brownfield story creation, brainstorming facilitation,
research prompts

**Status:** Safely archived Oct 7, 2025. Restorable from git history if needed.

**Restoration:**

```bash
# Restore specific agent
git mv archive/.../BMad/agents/analyst.md .claude/agents/

# Restore all BMad
cp -r archive/.../BMAD-METHOD/ ./BMAD-METHOD/
```

### Extended Thinking (ThinkingMixin)

**Add deep reasoning to ANY agent via mixin pattern**

**Location:** `packages/agent-core/ThinkingMixin.ts` **Docs:**
`packages/agent-core/THINKING_QUICK_START.md`

**Migrated:** [COMPLETE] ALL 6 TypeScript agents (TestRepair,
BundleOptimization, CodexReview, DependencyAnalysis, RouteOptimization,
Zencoder)

## Built-in Tools

### File Operations

- **Read** - Read any file (prefer over Bash cat)
- **Write** - Create files (prefer over Bash echo)
- **Edit** - Modify files (prefer over sed/awk)
- **Glob** - Find files by pattern (prefer over find)
- **Grep** - Search content (prefer over grep command)

### Development

- **Bash** - System commands
- **Task** - Launch specialized agents
- **TodoWrite** - Task management
- **SlashCommand** - Execute custom commands
- **Skill** - Launch skills (see Skills Library below)

### External

- **WebFetch** - Fetch and analyze web content
- **WebSearch** - Search the web
- **AskUserQuestion** - Get user clarification

## Skills Library (Superpowers Framework)

**User-Level Location**:
`C:\Users\nikhi\.claude\plugins\cache\superpowers\skills\` (20 skills)
**Project-Level Location**: `.claude/skills/` (21 skills) **Source**:
[obra/superpowers](https://github.com/obra/superpowers)

Structured thinking frameworks and workflow patterns to enhance problem-solving.
All skills persist across sessions. **User-level skills are available across ALL
projects.** **Skills activate automatically when relevant to the task**, making
their workflows mandatory.

**Usage**: `Skill("skill-name")` - The skill's prompt expands with detailed
guidance

**Latest Addition (2025-11-29):** 6 new skills added via Week 1 Skills
Integration (+46% growth from 13 baseline)

### Testing Skills (3)

- **test-driven-development** - RED-GREEN-REFACTOR cycle (write failing test →
  implement → refactor). Activates when implementing features.
- **condition-based-waiting** - Replace arbitrary timeouts with condition
  polling for async tests. Eliminates flaky tests from timing issues.
- **testing-anti-patterns** - Prevent testing mock behavior, production
  pollution with test-only methods, and mocking without understanding
  dependencies.

### Debugging & Problem Solving (4)

- **systematic-debugging** - Four-phase framework (root cause → pattern analysis
  → hypothesis → implementation). **Iron Law: NO FIXES WITHOUT ROOT CAUSE
  FIRST**. Activates automatically when debugging.
- **root-cause-tracing** - Trace bugs backward through call stack to find
  original trigger (not just symptom)
- **verification-before-completion** - Requires running verification commands
  and confirming output before making success claims. Activates before claiming
  work complete. Evidence before assertions always.
- **defense-in-depth** - Validates at every layer data passes through to make
  bugs structurally impossible. Use when invalid data causes failures deep in
  execution.

### Collaboration Skills (9)

- **brainstorming** - Transform rough ideas into designs through Socratic
  questioning (6 phases: understanding → exploration → presentation →
  documentation → worktree → planning)
- **writing-plans** - Create implementation plans with complete code examples
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

### Thinking Frameworks (4)

- **inversion-thinking** - Identify pitfalls by inverting questions ("What would
  make this terrible?")
- **analogical-thinking** - Bridge concepts with structured analogies ("X is
  like Y because..., but differs in...")
- **pattern-recognition** - Detect patterns, contradictions, and causal
  relationships across code/docs
- **extended-thinking-framework** - Reusable XML scaffold for complex tasks
  (analysis → strategy → execution → synthesis → quality check)

### Memory & Knowledge (2)

- **memory-management** - Structured notes with confidence levels (context
  maintenance, information organization, cross-referencing)
- **continuous-improvement** - Self-review process (5 reflection prompts: what
  worked, what was inefficient, surprises, clarity improvements, next time)

### Integration & Tools (2)

- **integration-with-other-skills** - Coordinate multiple skills/tools (MCP
  servers, project tools, memory systems, thinking frameworks)
- **notebooklm** - Query Google NotebookLM notebooks for source-grounded answers
  (browser automation, follow-up mechanism)

### Meta Skills (4)

- **writing-skills** - Apply TDD to process documentation by testing with
  subagents before writing, iterating until bulletproof against rationalization
- **sharing-skills** - Guides process of branching, committing, pushing, and
  creating PR to contribute skills back to upstream repository
- **testing-skills-with-subagents** - Applies RED-GREEN-REFACTOR cycle to
  process documentation by running baseline without skill, writing to address
  failures, iterating to close loopholes
- **using-superpowers** - Establishes mandatory workflows for finding and using
  skills, including using Skill tool before announcing usage, following
  brainstorming before coding, and creating TodoWrite todos for checklists

### AI Model Utilization Skills (4) - NEW 2025-11-29

- **ai-model-selection** - Decision framework for routing tasks to optimal AI
  models (Gemini/OpenAI/DeepSeek/Grok) based on complexity, cost optimization,
  and task type
- **multi-model-consensus** - Query multiple AI models for high-stakes decisions
  requiring validation (financial calculations, security reviews, architecture
  decisions)
- **prompt-caching-usage** - Reduce latency by 85% and cost by 90% for repeated
  context (test repair agents, multi-turn conversations, evaluator-optimizer
  loops)
- **iterative-improvement** - Systematic refinement through evaluation feedback
  loops (Evaluator-Optimizer pattern with 3-criteria validation)

### Data & API Design Skills (2) - NEW 2025-11-29

- **xlsx** - Excel operations for LP reporting, portfolio import/export, and
  golden testing (always use formulas, not hardcoded values)
- **api-design-principles** - REST API design for Express + TypeScript + Zod +
  BullMQ (resource-oriented, hierarchical nesting, sync/async patterns)

### Quality Gate & Infrastructure Skills (7) - UPDATED 2025-12-20

- **test-pyramid** - E2E scope control, test level governance (unit vs
  integration vs E2E)
- **test-fixture-generator** - Factory functions, golden datasets, batch
  generators, schema sync (NEW)
- **statistical-testing** - Monte Carlo validation patterns, seeded testing, CI
  stability
- **react-hook-form-stability** - RHF infinite loop prevention, autosave
  patterns
- **baseline-governance** - Quality gate policies, ratcheting strategy, baseline
  change approval
- **financial-calc-correctness** - Excel parity methodology, truth case
  validation, tolerance norms
- **claude-infra-integrity** - .claude/ directory consistency, agent naming,
  skill references

### Superpowers Slash Commands

**Location**: `.claude/commands/superpowers/` (if installed)

These commands are thin wrappers that activate the corresponding skill:

- **/superpowers:brainstorm** - Activates brainstorming skill
- **/superpowers:write-plan** - Activates writing-plans skill
- **/superpowers:execute-plan** - Activates executing-plans skill

**Quick Reference**: See [.claude/skills/README.md](.claude/skills/README.md)
for:

- Complete skill catalog with usage examples (19 skills across 7 categories)
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

##  MCP Tools (Multi-AI Collaboration)

### Multi-AI Collaboration
- **mcp__multi-ai-collab__ask_gemini** - Ask Gemini
- **mcp__multi-ai-collab__ask_openai** - Ask OpenAI
- **mcp__multi-ai-collab__gemini_code_review** - Gemini code review
- **mcp__multi-ai-collab__gemini_think_deep** - Deep analysis
- **mcp__multi-ai-collab__gemini_brainstorm** - Creative solutions
- **mcp__multi-ai-collab__gemini_debug** - Debug assistance
- **mcp__multi-ai-collab__ai_debate** - AI debate
- **mcp__multi-ai-collab__collaborative_solve** - Multi-AI problem solving

### NotebookLM Integration  NEW (2025-11-07)
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
- [x] Zero hallucinations (refuses if info not in docs)
- [x] Multi-document synthesis across 50+ files
- [x] Persistent sessions with context
- [x] Rate limit management (50 queries/day, multi-account support)
- [x] 9 active notebooks documented in [NOTEBOOKLM-LINKS.md](NOTEBOOKLM-LINKS.md)

**Documentation**:
- [cheatsheets/notebooklm-mcp-tools.md](cheatsheets/notebooklm-mcp-tools.md) - Complete tool reference
- [cheatsheets/notebooklm-agent-integration.md](cheatsheets/notebooklm-agent-integration.md) - Integration patterns
- [NOTEBOOKLM-LINKS.md](NOTEBOOKLM-LINKS.md) - Notebook registry (9 notebooks, 70+ files)

##  Slash Commands

### Testing & Quality

- **/test-smart** - Intelligent test selection based on changes
- **/fix-auto** - Automated repair of lint/format/test failures
- **/deploy-check** - Pre-deployment validation
- **/perf-guard** - Performance regression detection

### Development

- **/dev-start** - Optimized environment setup
- **/workflows** - Interactive helper for tools

### Documentation (Memory)

- **/log-change** - Update CHANGELOG.md
- **/log-decision** - Update DECISIONS.md
- **/create-cheatsheet [topic]** - Create documentation

### Custom Commands

- **/evaluate-tools** - Run tool evaluation framework (NEW)

##  Memory Systems

### Native Memory Tool Integration  NEW (2025-11-05)

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

- [x] **TestRepairAgent** (`agent:test-repair`) - Learns test failure patterns
      and successful repairs
- [x] **BundleOptimizationAgent** (`agent:bundle-optimization`) - Learns
      optimization patterns across builds
- [x] **CodexReviewAgent** (`agent:codex-review`) - Remembers code review
      patterns and common issues
- [x] **DependencyAnalysisAgent** (`agent:dependency-analysis`) - Tracks
      dependency patterns and successful optimizations
- [x] **RouteOptimizationAgent** (`agent:route-optimization`) - Learns route
      optimization patterns and lazy loading effectiveness
- [x] **ZencoderAgent** (`agent:zencoder`) - Remembers fix patterns and
      successful code transformations

**Memory-Enabled Project-Level Agents (.claude/agents/):**

- [x] **code-reviewer** (`agent:code-reviewer`) - Learns CLAUDE.md violations
      and project conventions
- [x] **waterfall-specialist** (`agent:waterfall-specialist`) - Remembers
      waterfall validation patterns and edge cases
- [x] **test-repair** (`agent:test-repair`) - Learns test failure patterns and
      repair strategies
- [x] **perf-guard** (`agent:perf-guard`) - Tracks bundle size baselines and
      optimization strategies
- [x] **db-migration** (`agent:db-migration`) - Remembers schema migration
      patterns and rollback strategies
- [x] **code-simplifier** (`agent:code-simplifier`) - Learns project-specific
      simplification patterns
- [x] **comment-analyzer** (`agent:comment-analyzer`) - Tracks comment rot
      patterns and documentation standards
- [x] **pr-test-analyzer** (`agent:pr-test-analyzer`) - Remembers test coverage
      gaps and edge case patterns
- [x] **silent-failure-hunter** (`agent:silent-failure-hunter`) - Learns silent
      failure patterns and error handling standards
- [x] **type-design-analyzer** (`agent:type-design-analyzer`) - Remembers strong
      type designs and invariant patterns

**Memory-Enabled Global Agents (Project Overrides in .claude/agents/):**

- [x] **general-purpose** (`agent:general-purpose:updog`) - Learns research
      patterns and codebase structure
- [x] **test-automator** (`agent:test-automator:updog`) - Remembers TDD patterns
      and coverage gaps
- [x] **legacy-modernizer** (`agent:legacy-modernizer:updog`) - Tracks migration
      patterns and refactoring strategies
- [x] **incident-responder** (`agent:incident-responder:updog`) - Learns
      incident patterns and mitigation strategies
- [x] **dx-optimizer** (`agent:dx-optimizer:updog`) - Remembers workflow
      friction points and automation solutions
- [x] **docs-architect** (`agent:docs-architect:updog`) - Learns documentation
      patterns and explanation strategies
- [x] **devops-troubleshooter** (`agent:devops-troubleshooter:updog`) - Tracks
      infrastructure failure patterns
- [x] **debug-expert** (`agent:debug-expert:updog`) - Remembers bug patterns and
      debugging strategies
- [x] **database-expert** (`agent:database-expert:updog`) - Learns schema
      patterns and optimization strategies
- [x] **context-orchestrator** (`agent:context-orchestrator:updog`) - Tracks
      context management and orchestration patterns
- [x] **code-explorer** (`agent:code-explorer:updog`) - Remembers codebase
      structure and feature implementations
- [x] **chaos-engineer** (`agent:chaos-engineer:updog`) - Learns system weak
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

## Workflow Patterns

### BEFORE IMPLEMENTING ANYTHING:

1. **Check existing agents**: Is there already an agent for this?
2. **Check MCP tools**: Can Gemini or OpenAI help?
3. **Check slash commands**: Is there a command that does this?
4. **Check npm scripts**: Is there already a script?

### Common Mistakes to Avoid:

- Using Bash for file operations (use Read/Write/Edit)
- Implementing financial calculations (use waterfall-specialist)
- Writing test generation (use test-automator)
- Manual code review (use code-reviewer)
- Building evaluation frameworks (use existing evaluators)
- Creating new memory systems (use CHANGELOG/DECISIONS)

### Optimal Patterns:

- [x] Use Task tool to launch specialized agents
- [x] Run agents in parallel when independent
- [x] Use MCP tools for second opinions
- [x] Update CHANGELOG/DECISIONS for persistence
- [x] Check this file FIRST before any task

## Decision Tree

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

## Documentation Quality Validation

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

## External Resources

### Available Cookbook Patterns (C:\dev\Updog_restore\anthropic-cookbook)

**Location:** `anthropic-cookbook/` in project root

#### Basic Agent Workflows (`patterns/agents/`)

- **Prompt Chaining** - Sequential multi-step tasks
- **Routing** - Dynamic tool selection based on query classification
- **Multi-LLM Parallelization** - Concurrent LLM calls with aggregation

#### Advanced Workflows

- **Orchestrator-Workers** (`orchestrator_workers.ipynb`) - Central coordinator
  with specialized subagents
- **Evaluator-Optimizer** (`evaluator_optimizer.ipynb`) - Generate → Evaluate →
  Iterate closed-loop
- **Using Sub-Agents** (`multimodal/using_sub_agents.ipynb`) - Multi-agent task
  decomposition

#### Claude Agent SDK Examples (`claude_agent_sdk/`)

- **Research Agent** - Autonomous web research with citations
- **Chief of Staff Agent** - Executive assistant workflows (calendar, email,
  tasks)
- **Observability Agent** - System monitoring, anomaly detection, root cause
  analysis

#### Specialized Capabilities

- **Extended Thinking** (`extended_thinking/`) - Deep reasoning with
  step-by-step analysis
- **Tool Evaluation** (`tool_evaluation/`) - Automated agent benchmarking
  framework
- **Building Evals** (`misc/building_evals.ipynb`) - Quality metric design
  patterns
- **Using Citations** (`misc/using_citations.ipynb`) - Source-grounded responses
- **Prompt Caching** (`misc/prompt_caching.ipynb`) - Performance optimization

#### Updog Integrations

| Cookbook Pattern     | Updog Implementation       | Location               |
| -------------------- | -------------------------- | ---------------------- |
| Orchestrator-Workers | context-orchestrator agent | `~/.claude/agents/`    |
| Evaluator-Optimizer  | Documentation validation   | `scripts/validation/`  |
| Extended Thinking    | ThinkingMixin              | `packages/agent-core/` |
| Tool Evaluation      | Agent metrics framework    | `packages/agent-core/` |

### When to Reference Cookbook

**SUCCESS:** **Use for:**

- Implementation patterns and architecture
- Multi-agent coordination strategies
- Production-ready code examples
- Evaluation framework design

  **Don't use for:**

- Domain-specific business logic (use waterfall-specialist, etc.)
- Project-specific calculations
- Updog conventions (use CLAUDE.md, cheatsheets/)

**See:** [cheatsheets/agent-architecture.md](cheatsheets/agent-architecture.md)
for detailed cookbook workflow documentation

## Application Features & API Capabilities

### Deal Pipeline Management System (Sprint 1)

**Status**: Active (2025-12-30) **Route**: `/api/deals/*`

Complete REST API for venture capital deal tracking and pipeline management:

**Deal CRUD Operations:**

- `POST /api/deals/opportunities` - Create deal (idempotency-enabled)
- `GET /api/deals/opportunities` - List deals with cursor pagination
- `GET /api/deals/opportunities/:id` - Get deal with full related data
- `PUT /api/deals/opportunities/:id` - Update deal (idempotency-enabled,
  optimistic locking)
- `DELETE /api/deals/opportunities/:id` - Archive deal (soft delete)

**Pipeline Management:**

- `POST /api/deals/:id/stage` - Move deal through pipeline stages
- `GET /api/deals/pipeline` - Kanban-style pipeline view
- `GET /api/deals/stages` - List available pipeline stages

**Due Diligence:**

- `POST /api/deals/:id/diligence` - Add due diligence item
- `GET /api/deals/:id/diligence` - Get due diligence items by category

**Technical Features:**

- Cursor pagination with compound keys (createdAt + id)
- Idempotency middleware for create/update operations
- Base64url-encoded cursors
- Zod validation schemas
- Comprehensive anti-pattern compliance (all 24 patterns)
- 12 database indexes for optimal query performance
- 16 integration tests

**Implementation**:
[server/routes/deal-pipeline.ts](server/routes/deal-pipeline.ts),
[tests/api/deal-pipeline.test.ts](tests/api/deal-pipeline.test.ts)

## Quick Reference Questions

Before any task, ask yourself:

1. **Do I have an agent for this?** → Check agent list above
2. **Do I have a skill for this?** → Check Skills Library (`.claude/skills/`)
3. **Have I done this before?** → Check CHANGELOG.md
4. **Is there a decision about this?** → Check DECISIONS.md
5. **Can another AI help?** → Check MCP tools
6. **Is there a slash command?** → Check command list
7. **Is there an npm script?** → Check package.json

## Most Commonly Forgotten

These are the capabilities most often overlooked:

1. **Superpowers Skills Library** - 34 skills across 8 categories that
   **auto-activate when relevant**:
   - **test-driven-development** - Activates during feature implementation
   - **systematic-debugging** - Activates when debugging (NO FIXES WITHOUT ROOT
     CAUSE)
   - **verification-before-completion** - Activates before claiming work done
   - **brainstorming** - Socratic design refinement before coding
   - **executing-plans** - Batch execution with review checkpoints
   - **subagent-driven-development** - Fast iteration with code review gates
   - **ai-model-selection** - NEW: Route tasks to optimal AI model (cost
     optimization)
   - **multi-model-consensus** - NEW: Validate high-stakes decisions with
     multiple AIs
   - **iterative-improvement** - NEW: Systematic refinement with evaluation
     loops
2. **using-superpowers skill** - Establishes mandatory workflows for skill usage
   (check FIRST before announcing skill usage)
3. **Extended Thinking (ThinkingMixin)** - Add deep reasoning to any agent with
   zero breaking changes
4. **context-orchestrator** - Handles multi-agent coordination automatically
5. **/log-change** and **/log-decision** - Built-in memory system
6. **test-automator** - Generates comprehensive tests with TDD
7. **MCP tools** - Get second opinions from Gemini/OpenAI
8. **code-explorer** - Understand existing code before modifying

## Extended Thinking Integration

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

**Migrated Agents**: **SUCCESS:** **ALL 6 TypeScript agents MIGRATED** (100%
complete):

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

## Testing Infrastructure

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

**Status:** **SUCCESS:** COMPLETE (50 test cases passing, Excel-validated)

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

**Scope:** Schema validation at API boundaries **Status:** **SUCCESS:** COVERED
by Phase 3 Portfolio Route API work **Reference:** `shared/schemas/` for Zod
validation schemas **ADR:** ADR-011 Anti-Pattern Prevention Strategy

---

### Dependencies Status

#### lodash (Removed)

**Status:** **SUCCESS:** REMOVED (not found in package.json) **Date:** Prior to
Nov 2025 **Replaced With:** Native ES2023+ methods (Array.prototype.at,
Object.groupBy, etc.)

#### xlsx (Eager Loading)

**Status:** ⚠️ EAGERLY LOADED (not lazily loaded) **Current:** Direct dependency
`"xlsx": "^0.18.5"` in package.json **Rationale:** No performance issues
observed; lazy loading deferred until bundle analysis shows need **Future:**
Consider dynamic `import('xlsx')` when Excel export usage metrics available
