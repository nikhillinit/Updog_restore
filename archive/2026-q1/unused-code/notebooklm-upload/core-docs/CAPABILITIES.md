# Claude Code Capability Inventory

_Last Updated: 2025-11-05_

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
```

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

## 🔁 Evaluator-Optimizer Loop (Iterative Refinement)

### Pattern Overview

The **Evaluator-Optimizer Loop** is an iterative refinement workflow where one
LLM generates content while another evaluates and provides feedback in a
continuous improvement cycle. Adapted from
[Anthropic Cookbook's evaluator-optimizer pattern](C:\dev\anthropic-cookbook\patterns\agents\evaluator_optimizer.ipynb).

**Key Insight**: Combining **ThinkingMixin** in the evaluator role enables deep
analysis of quality gaps, leading to faster convergence and fewer iterations.

### When to Use This Pattern

Use Evaluator-Optimizer Loop when:

1. ✅ **Clear evaluation criteria exist** (rubrics, quality thresholds,
   acceptance tests)
2. ✅ **Iterative refinement adds value** (quality improves with feedback)
3. ✅ **First-pass quality is insufficient** (need 94%+ but getting 85%)
4. ✅ **Quality gaps are identifiable** (evaluator can articulate specific
   improvements)

**Proven Use Cases**:

- Documentation generation (Phase 2: achieving 96%+ quality)
- Code generation with quality requirements
- Test case refinement and edge case discovery
- API response formatting and validation

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    LOOP CONTROLLER                          │
│  Orchestrates iterations, maintains context, checks exit    │
└─────────────────────────────────────────────────────────────┘
                           ↓
         ┌─────────────────┴─────────────────┐
         ↓                                   ↓
┌──────────────────┐              ┌──────────────────────┐
│   GENERATOR      │              │   EVALUATOR          │
│  (docs-architect,│              │  (with ThinkingMixin)│
│   code agent,    │──output──→   │                      │
│   any creator)   │              │  Deep analysis of:   │
│                  │              │  - Quality gaps      │
│  Creates content │              │  - Missing elements  │
│  based on task + │              │  - Conceptual issues │
│  feedback        │              │  - Edge cases        │
└──────────────────┘              └──────────────────────┘
         ↑                                   │
         │                                   │
         └────────feedback loop──────────────┘
                (if NEEDS_IMPROVEMENT)

                Exit when: PASS (quality threshold met)
```

### Implementation Pattern for Documentation

**Phase 2 Phoenix Rebuild Example**:

```typescript
// 1. GENERATOR: Create documentation content
async function generateDocs(
  task: string,
  context: string = ''
): Promise<string> {
  const prompt = context
    ? `${basePrompt}\n\nPrevious feedback:\n${context}\n\nTask: ${task}`
    : `${basePrompt}\n\nTask: ${task}`;

  const result = await Task({
    subagent_type: 'docs-architect',
    prompt: prompt,
    description: 'Generate documentation',
  });

  return result;
}

// 2. EVALUATOR: Deep analysis with ThinkingMixin
async function evaluateDocs(
  docs: string,
  requirements: Requirements
): Promise<{ status: 'PASS' | 'NEEDS_IMPROVEMENT'; feedback: string }> {
  // Use extended thinking for deep quality analysis
  const analysis = await think(
    `
    Analyze this documentation for quality gaps:

    Requirements:
    - Domain coverage: All key concepts explained
    - Code references: 35+ file:line anchors
    - Truth cases: 15-20 with complete JSON
    - Diagrams: 2-3 Mermaid visualizations
    - Edge cases: 8+ boundary conditions

    Current documentation:
    ${docs}

    Identify:
    1. What's missing or incomplete
    2. What's conceptually incorrect
    3. What would raise quality from current to 96%+
    4. Specific, actionable improvements
  `,
    { depth: 'deep' }
  ); // ~$0.08 per call

  // Multi-AI validation
  const scores = await ask_all_ais(`
    Rate this documentation on scale 0-100:
    ${docs}
  `);

  // Promptfoo quantitative check
  const promptfooScore = await runPromptfoo(docs);

  const avgScore = (scores.gemini + scores.openai) / 2;

  if (avgScore >= 94 && promptfooScore >= 0.92) {
    return { status: 'PASS', feedback: analysis.insights };
  }

  return {
    status: 'NEEDS_IMPROVEMENT',
    feedback: `
      Scores: Gemini ${scores.gemini}%, OpenAI ${scores.openai}%, Promptfoo ${promptfooScore}%

      Gaps identified:
      ${analysis.insights}

      Priority fixes:
      ${analysis.recommendations}
    `,
  };
}

// 3. LOOP CONTROLLER: Iterate until quality threshold
async function improveUntilQuality(
  task: string,
  requirements: Requirements,
  maxIterations: number = 4
): Promise<{ result: string; iterations: number }> {
  let iteration = 0;
  let context = '';
  let result = '';

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n=== ITERATION ${iteration} ===`);

    // Generate
    result = await generateDocs(task, context);
    console.log('Generated content length:', result.length);

    // Evaluate
    const evaluation = await evaluateDocs(result, requirements);
    console.log('Evaluation:', evaluation.status);

    if (evaluation.status === 'PASS') {
      console.log(`✅ Quality threshold met in ${iteration} iterations`);
      return { result, iterations: iteration };
    }

    // Build context for next iteration
    context = `
      Previous attempt (iteration ${iteration}):
      ${result}

      Feedback:
      ${evaluation.feedback}

      Improve the documentation by addressing the gaps identified above.
    `;
  }

  throw new Error(
    `Failed to reach quality threshold after ${maxIterations} iterations`
  );
}
```

### Integration with Existing Validation

**Multi-Stage Validation** (recommended for Phase 2):

1. **Mechanical Validation** (Promptfoo):
   - Keyword coverage (domain terms)
   - Code reference density (35+ file:line anchors)
   - Schema compliance (JSON structure)
   - Fast, deterministic, cheap

2. **Qualitative Validation** (Multi-AI with ThinkingMixin):
   - Conceptual coherence
   - Clarity and accessibility
   - Completeness of edge cases
   - Integration with broader system
   - Uses extended thinking to understand WHY scores differ

3. **Variance Analysis**:
   - If Gemini/OpenAI differ by >5 points → trigger deep thinking
   - Evaluator with ThinkingMixin analyzes: "Why the disagreement?"
   - Identifies which AI is correct and why
   - Generates targeted improvements

### Cost-Benefit Analysis

**Per Module Costs** (Phase 2 Documentation):

| Component                      | Cost per Call | Calls per Module | Total          |
| ------------------------------ | ------------- | ---------------- | -------------- |
| Generator (docs-architect)     | $0.50-1.00    | 2-3 iterations   | $1.00-3.00     |
| Evaluator (ThinkingMixin deep) | $0.08         | 2-3 iterations   | $0.16-0.24     |
| Multi-AI validation            | $0.10-0.20    | 2-3 iterations   | $0.20-0.60     |
| Promptfoo                      | Free          | 2-3 iterations   | $0.00          |
| **Total per module**           | -             | -                | **$1.36-3.84** |

**Time Savings**:

- Without evaluator: 3-5 iterations, manual gap identification = 6-8h per module
- With evaluator + ThinkingMixin: 2-3 iterations, automated gaps = 4-5h per
  module
- **Net savings**: 2-3 hours per module

**Quality Improvements**:

- First-pass quality: 85% → 92% (evaluator catches gaps immediately)
- Iterations to 96%: 4-5 → 2-3 (better feedback = faster convergence)
- Human review time: 2h → 0.5h (evaluator pre-validates)

### Usage Triggers for Agents

Agents should **automatically** apply Evaluator-Optimizer Loop when:

1. **Task has quality threshold** (e.g., "achieve 96%+ documentation quality")
2. **Generating Phase 2 documentation** (reserves, pacing, cohorts, monte-carlo)
3. **User explicitly requests iteration** ("keep improving until X")
4. **First-pass quality below target** (generate once, evaluate, see 88% → loop)
5. **Complex quality requirements** (multiple rubric dimensions)

**Detection Pattern**:

```typescript
// Agent detects quality requirement
if (
  task.includes('94%') ||
  task.includes('96%') ||
  task.includes('quality threshold')
) {
  // Use Evaluator-Optimizer Loop
  return improveUntilQuality(task, requirements);
} else {
  // Single-pass generation
  return generateOnce(task);
}
```

### Comparison with Other Patterns

| Pattern                      | Use Case                     | Cost       | Time | Quality |
| ---------------------------- | ---------------------------- | ---------- | ---- | ------- |
| **Single-pass generation**   | Simple tasks, no quality bar | $0.50      | 15m  | 80-85%  |
| **Multi-AI validation only** | Review after generation      | $0.30      | 5m   | 85-90%  |
| **Evaluator-Optimizer Loop** | High quality bar, iterative  | $1.50-4.00 | 2-3h | 94-99%  |
| **Manual iteration**         | Human identifies gaps        | $0.50/iter | 6-8h | 90-95%  |

### Success Metrics (Phase 2)

Track these metrics when using Evaluator-Optimizer Loop:

- **Iterations to convergence**: Target ≤3 iterations to reach 94%+
- **First-pass quality**: Target 88-92% (vs 80-85% without evaluator)
- **Cost per module**: Target ≤$4.00 including all LLM calls
- **Time per module**: Target ≤5 hours (vs 6-8h manual)
- **Quality ceiling**: Target 96%+ final score (Gemini + OpenAI average)

### Related Capabilities

- **Extended Thinking (ThinkingMixin)** - Add to evaluator for deep gap analysis
  (line 41)
- **Multi-AI Collaboration** - Use in evaluator for consensus scoring (line 98)
- **docs-architect agent** - Primary generator for documentation tasks (line 64)
- **Promptfoo Validation** - Mechanical validation in evaluator (line 273)

### References

- **Anthropic Cookbook**:
  `C:\dev\anthropic-cookbook\patterns\agents\evaluator_optimizer.ipynb`
- **ThinkingMixin Quick Start**: `packages/agent-core/THINKING_QUICK_START.md`
- **Phase 2 Strategy**: `HANDOFF-MEMO-PHASE-2-STRATEGY-2025-11-05.md`

---

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
- ✅ **Use Evaluator-Optimizer Loop for quality thresholds** (94%+ requirements)

### Iterative Quality Improvement

When tasks have **explicit quality requirements** (e.g., "achieve 96%+
documentation quality"):

1. **Single-pass generation** → Check quality → Below threshold?
2. **Apply Evaluator-Optimizer Loop** (see line 227)
   - Generator creates content
   - Evaluator (with ThinkingMixin) analyzes gaps
   - Loop until quality threshold met (2-3 iterations typical)
3. **Track metrics**: Iterations, cost, time, quality scores

**Example triggers**:

- "Document ReserveEngine to 96% quality" → Use loop
- "Generate comprehensive tests" + quality bar → Use loop
- "Create ADR" (no quality threshold) → Single-pass sufficient

## 🎯 Decision Tree

```
User Request
    ↓
[Check CAPABILITIES.md]
    ↓
Has quality threshold (94%+, 96%+)? → YES → Use Evaluator-Optimizer Loop
    ↓ NO
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

1. **Evaluator-Optimizer Loop** - Iterative quality improvement with
   ThinkingMixin for 94%+ requirements (line 227)
2. **Extended Thinking (ThinkingMixin)** - Add deep reasoning to any agent with
   zero breaking changes (especially powerful in evaluator role)
3. **context-orchestrator** - Handles multi-agent coordination automatically
4. **/log-change** and **/log-decision** - Built-in memory system
5. **test-automator** - Generates comprehensive tests with TDD
6. **MCP tools** - Get second opinions from Gemini/OpenAI
7. **code-explorer** - Understand existing code before modifying

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
