# Claude Code Skills Library

This directory contains structured thinking frameworks and workflow skills to
enhance your development and problem-solving capabilities.

## Quick Start

To use a skill, invoke it with the Skill tool:

```
Skill("skill-name")
```

The skill's prompt will then expand and guide you through its process.

## Skills Catalog

### Thinking Frameworks

#### [inversion-thinking](inversion-thinking.md)

**Overview**: Invert the question to reveal pitfalls and failure modes.

**When to use**: Before implementing complex features, during architecture
decisions, to identify edge cases

**Core process**:

1. Invert: "What would make this terrible?"
2. List failure modes
3. Convert to do-not checklist
4. Gate outputs against it

**Example**: Before implementing waterfall calculations, ask "What would make
this calculation catastrophically wrong?" → Identify missing validation, type
confusion, float precision errors

---

#### [analogical-thinking](analogical-thinking.md)

**Overview**: Use structured analogies to bridge concepts and improve
understanding.

**When to use**: Explaining complex concepts, understanding unfamiliar patterns,
designing based on existing patterns

**Core process**:

1. Draft analogy ("X is like Y because...")
2. State where it breaks ("but differs in...")
3. Validate with sources
4. Use in explanation

**Example**: "ReserveEngine is like a budget calculator (both allocate
resources) but differs in probabilistic modeling"

---

#### [pattern-recognition](pattern-recognition.md)

**Overview**: Detect patterns, contradictions, and relationships to strengthen
synthesis.

**When to use**: Comparing multiple sources, detecting convergence/divergence,
code review, refactoring

**Core process**:

1. Note repeated themes
2. Flag contradictions
3. Link cause-effect
4. Summarize cross-source insights

**Example**: Analyzing multiple API routes reveals consistent validation pattern
→ Document as convention

---

#### [extended-thinking-framework](extended-thinking-framework.md)

**Overview**: Reusable scaffold for complex tasks requiring structured
reasoning.

**When to use**: Complex tasks, code audits, architecture reviews, research
synthesis

**Core structure**:

```xml
<research_thinking>
  <initial_analysis>...</initial_analysis>
  <strategy>...</strategy>
  <execution_notes>...</execution_notes>
  <synthesis>...</synthesis>
  <quality_check>...</quality_check>
</research_thinking>
```

**Example**: Auditing waterfall implementation for correctness and edge cases

---

### Debugging & Problem Solving

#### [systematic-debugging](systematic-debugging.md)

**Overview**: Four-phase framework ensuring understanding before fixes.

**When to use**: ANY bug, test failure, or unexpected behavior

**Iron Law**: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST

**Four phases**:

1. Root Cause Investigation - Find the real problem
2. Pattern Analysis - Understand why it's broken
3. Hypothesis Testing - Test theory scientifically
4. Implementation - Fix root cause, not symptom

**Escalation**: 3+ failed fixes = Question architecture, discuss with human

---

#### [root-cause-tracing](root-cause-tracing.md)

**Overview**: Trace bugs backward through call stack to find original trigger.

**When to use**: Errors deep in execution, unclear invalid data source, long
call chains

**Core principle**: Never fix where error appears - trace back to original
trigger

**Process**: Observe symptom → Find immediate cause → Trace up call chain →
Identify trigger → Fix at source

**Example**: Git init fails → Trace back → Empty projectDir → Test setup race →
Fix initialization order

---

#### [dispatching-parallel-agents](dispatching-parallel-agents.md)

**Overview**: Dispatch multiple agents for independent problem investigation.

**When to use**: 3+ independent failures, different subsystems, no shared state

**Don't use when**: Failures are related, need full system understanding, agents
would conflict

**Process**: Identify domains → Create focused tasks → Dispatch in parallel →
Review and integrate

**Example**: 3 engine test suites failing independently → 3 parallel agents → 2
hours → 30 minutes

---

### Planning & Design

#### [brainstorming](brainstorming.md)

**Overview**: Transform rough ideas into fully-formed designs through structured
questioning.

**When to use**: Before writing code, creating new features, exploring solutions

**Six phases**:

1. Understanding - Ask questions one at a time
2. Exploration - Propose 2-3 approaches with trade-offs
3. Design Presentation - Present incrementally, validate each section
4. Documentation - Write design doc
5. Worktree Setup - Isolated workspace
6. Planning - Implementation plan

**Example**: "I want to add caching" → Clarify goals → Explore Redis vs
memoization → Design with validation → Document → Plan

---

#### [task-decomposition](task-decomposition.md)

**Overview**: Break complex tasks into manageable, independently testable
subtasks with clear success criteria.

**When to use**: Complex multi-step tasks (3+ steps, >2 hours), unclear
requirements, large implementations, parallel execution opportunities

**Don't use when**: Simple single-step tasks, already have detailed plan,
trivial changes

**Core process**:

1. Analyze complexity (simple/moderate/complex)
2. Identify dependencies (sequential/parallel/hybrid)
3. Break into 10-30 minute subtasks
4. Define clear success criteria for each
5. Determine execution order

**Integration**: Combines with writing-plans for detailed steps, works with
dispatching-parallel-agents for parallel execution, feeds into
subagent-driven-development

**Example**: Monte Carlo caching → 8 subtasks → 3 batches with checkpoints →
parallel execution of independent tracks

---

#### [writing-plans](writing-plans.md)

**Overview**: Create comprehensive implementation plans with complete code
examples.

**When to use**: After design complete, breaking down complex features,
documenting implementation

**Granularity**: Each step = 2-5 minutes

- Write test (step)
- Run to verify fail (step)
- Implement (step)
- Verify pass (step)
- Commit (step)

**Save to**: `docs/plans/YYYY-MM-DD-<feature-name>.md`

**Principles**: DRY, YAGNI, TDD, Frequent Commits

---

### Memory & Knowledge Management

#### [memory-management](memory-management.md)

**Overview**: Keep structured notes to maintain context and build institutional
knowledge.

**When to use**: Complex features, exploratory research, tracking decisions,
building long-term knowledge

**Three components**:

1. Context Maintenance - Objectives, findings, credibility tracker
2. Information Organization - By topic, time, certainty
3. Cross-Referencing - Link supporting/contradicting info

**Integration**: CHANGELOG.md, DECISIONS.md, cheatsheets, .claude/skills

**Example**: Track Monte Carlo optimization findings with confidence levels
across multiple sessions

---

#### [continuous-improvement](continuous-improvement.md)

**Overview**: Self-review process to build adaptive expertise.

**When to use**: After completing tasks, end of debugging, code reviews,
retrospectives

**Five reflection prompts**:

1. What worked well?
2. What was inefficient?
3. Any surprising insights?
4. How could clarity improve?
5. What will I change next time?

**Integration**: Update CHANGELOG.md, DECISIONS.md, create cheatsheets based on
learnings

---

### Integration & Coordination

#### [integration-with-other-skills](integration-with-other-skills.md)

**Overview**: Coordinate research methods with complementary tools and skills.

**When to use**: Complex tasks requiring multiple perspectives,
cross-validation, multi-source data

**Core integrations**:

- MCP Servers (multi-ai-collab) → External AI perspectives
- Project Tools (/test-smart, /fix-auto) → Task execution
- Memory Systems (/log-change, /create-cheatsheet) → Knowledge persistence
- Thinking Frameworks → Complementary skill combinations

**Example workflows**:

- Feature implementation: inversion-thinking → implement → /test-smart →
  /fix-auto → continuous-improvement
- Code review: multi-ai consensus → pattern-recognition → memory-management

---

#### [notebooklm](notebooklm.md)

**Overview**: Query Google NotebookLM notebooks for source-grounded answers.

**When to use**: User mentions NotebookLM, shares NotebookLM URL, wants to query
documentation

**Critical**: Always use `python scripts/run.py [script]` wrapper

**Core workflow**:

1. Check auth: `python scripts/run.py auth_manager.py status`
2. Manage library: `python scripts/run.py notebook_manager.py list`
3. Ask questions: `python scripts/run.py ask_question.py --question "..."`

**Follow-up mechanism**: Every answer ends with "Is that ALL you need to know?"
→ STOP, analyze, ask follow-ups

**Limitations**: No session persistence, rate limits, browser overhead

---

## Skill Combinations

### Problem-Solving Workflow

```
1. systematic-debugging (Phase 1: Root Cause)
   ↓
2. root-cause-tracing (if deep call stack)
   ↓
3. pattern-recognition (compare with working code)
   ↓
4. systematic-debugging (Phase 3-4: Test & Implement)
   ↓
5. continuous-improvement (reflect and document)
```

### Feature Development Workflow

```
1. brainstorming (refine idea → design)
   ↓
2. inversion-thinking (identify failure modes)
   ↓
3. task-decomposition (break into subtasks)
   ↓
4. writing-plans (create detailed steps per subtask)
   ↓
5. Execute plan with /test-smart
   ↓
6. memory-management (track progress)
   ↓
7. continuous-improvement (reflect on process)
```

### Research & Analysis Workflow

```
1. extended-thinking-framework (structure investigation)
   ↓
2. pattern-recognition (analyze findings)
   ↓
3. analogical-thinking (explain concepts)
   ↓
4. memory-management (document with confidence levels)
   ↓
5. notebooklm (query documentation if needed)
```

### Multi-Agent Coordination

```
1. Identify independent failures
   ↓
2. dispatching-parallel-agents (concurrent investigation)
   ↓
3. Each agent uses systematic-debugging
   ↓
4. pattern-recognition (synthesize findings)
   ↓
5. continuous-improvement (refine coordination)
```

## Integration with Project Tools

### Slash Commands

- `/test-smart` - Intelligent test selection
- `/fix-auto` - Automated repair
- `/deploy-check` - Pre-deployment validation

### Memory Commands

- `/log-change` - Update CHANGELOG.md
- `/log-decision` - Update DECISIONS.md
- `/create-cheatsheet` - New documentation

### Recommended Combinations

```
Planning:
  brainstorming + inversion-thinking + task-decomposition + writing-plans

Debugging:
  systematic-debugging + root-cause-tracing + pattern-recognition

Implementation:
  task-decomposition + writing-plans + /test-smart + /fix-auto + continuous-improvement

Research:
  extended-thinking-framework + notebooklm + memory-management

Quality:
  pattern-recognition + multi-ai-collab + continuous-improvement

Complex Features:
  brainstorming + task-decomposition + dispatching-parallel-agents
```

## Best Practices

### 1. Choose the Right Skill

- **Analysis**: pattern-recognition, memory-management
- **Planning**: brainstorming, task-decomposition, inversion-thinking,
  writing-plans
- **Debugging**: systematic-debugging, root-cause-tracing
- **Execution**: Project slash commands (/test-smart, /fix-auto)
- **Reflection**: continuous-improvement
- **Coordination**: task-decomposition, dispatching-parallel-agents

### 2. Layer Skills Strategically

```
Foundation: memory-management (persistent context)
     ↓
Analysis: pattern-recognition + inversion-thinking
     ↓
Execution: Project tools + systematic-debugging
     ↓
Validation: multi-ai-collab
     ↓
Improvement: continuous-improvement
```

### 3. Track Confidence Levels

When using memory-management or extended-thinking-framework:

- **HIGH**: Verified in code/tests/documentation
- **MEDIUM**: Observed pattern, not exhaustive
- **LOW**: Assumption needs validation

### 4. Build Feedback Loops

```
Plan → Execute → Measure → Reflect → Update Memory → Repeat
```

## Project-Specific Context

### VC Fund Modeling Patterns

When using these skills in this codebase:

**Common patterns to recognize**:

- Immutable calculation engines (Reserve, Pacing, Cohort)
- Discriminated unions (AMERICAN vs EUROPEAN waterfalls)
- Zod schema validation
- BullMQ worker pattern for async jobs

**Typical workflows**:

- Engine optimization: extended-thinking + pattern-recognition
- Waterfall changes: inversion-thinking + systematic-debugging
- API routes: writing-plans + pattern-recognition (follow existing patterns)
- Test failures: systematic-debugging + /test-smart

**Memory integration**:

- Document patterns in cheatsheets/
- Log decisions in DECISIONS.md
- Track changes in CHANGELOG.md
- Create skills for recurring workflows

## Troubleshooting

### Skill Not Loading

```bash
# Check skill exists
ls .claude/skills/

# Verify skill format (must be .md file)
cat .claude/skills/skill-name.md

# Skills are project-local, persist across sessions
```

### When to Use Which Skill?

**See the "When to use" section in each skill's documentation.**

General guideline:

- **Unknown problem?** → systematic-debugging
- **Need design?** → brainstorming
- **Need plan?** → writing-plans
- **Complex analysis?** → extended-thinking-framework
- **Multiple failures?** → dispatching-parallel-agents
- **Research?** → notebooklm + memory-management

## Contributing New Skills

If you create new skills for this project:

1. **Format**: Markdown file in `.claude/skills/`
2. **Naming**: kebab-case (e.g., `my-new-skill.md`)
3. **Structure**:
   - Overview
   - When to use
   - Core process/steps
   - Examples (ideally from this codebase)
   - Integration with other skills

4. **Update this README**: Add to appropriate category

### AI Model Utilization

#### [ai-model-selection](ai-model-selection.md)

**Overview**: Decision framework for routing to optimal AI model based on task
characteristics.

**When to use**: Before MCP multi-AI collaboration, cost optimization, unclear
complexity

**Decision Matrix**: Task type → Best model (Gemini/OpenAI/DeepSeek/Grok)

**Complexity Thresholds**:

- Level 1-2 (Trivial): Gemini (free)
- Level 3-7 (Moderate): Strategic choice based on task
- Level 8-10 (Complex): OpenAI o1 or multi-AI consensus

**Cost Optimization**: Free-first routing, consensus for critical decisions
($10k+ impact), hybrid workflows

**Example**: Waterfall calculation bug → DeepSeek for debugging (logical
reasoning) → Gemini validation (free)

---

#### [multi-model-consensus](multi-model-consensus.md)

**Overview**: Query multiple AI models for high-stakes decisions requiring
validation.

**When to use**: Financial calculations, security reviews, architecture
decisions, legal/compliance

**DON'T use**: Simple fixes, low stakes (3-5x cost not justified)

**Four Patterns**:

1. **Consensus** (`ai_consensus`) - Validation and agreement
2. **Debate** (`ai_debate`) - Trade-off exploration
3. **Multi-perspective** (`ask_all_ais`) - Diverse viewpoints
4. **Collaborative** (`collaborative_solve`) - Complex problem solving

**Example**: Waterfall calculation validation → ai_consensus → All models agree
→ HIGH confidence proceed

---

#### [prompt-caching-usage](prompt-caching-usage.md)

**Overview**: Reduce latency by 85% and cost by 90% for repeated context.

**When to use**: Test repair agents, multi-turn conversations,
evaluator-optimizer loops

**Expected Impact**: First call 20s/$0.30 → subsequent calls 3s/$0.03

**Cache These**: CLAUDE.md, schemas, test structures, evaluation criteria (high
reuse)

**Don't Cache**: User queries, dynamic test failures, git diffs (low reuse)

**Pattern**: Separate cacheable (static) from dynamic content with cache_control

**Example**: Test repair agent - cache project context (50k chars) → 10
iterations $3.00 → $0.33

---

#### [iterative-improvement](iterative-improvement.md)

**Overview**: Systematic refinement through evaluation feedback loops
(Evaluator-Optimizer pattern).

**When to use**: Test repair, code generation, architectural design, performance
optimization

**Core Pattern**: Generate → Evaluate (3 criteria) → Optimize (with feedback) →
Repeat

**3-Criteria Pattern**:

1. **Functional**: Does it work? (tests pass, requirements met)
2. **Safe**: No regressions? (no anti-patterns, backwards compatible)
3. **Conventional**: Follows project patterns? (matches codebase style)

**Max Iterations**: 3 (beyond that = architectural issue)

**Status Decision**: PASS (all 3 met) | NEEDS_IMPROVEMENT (continue) | FAIL
(stop early)

**Integration**: systematic-debugging FIRST (root cause), then iterate

**Example**: Reserve engine null error → Iteration 1: null check → Iteration 2:
type guards → Iteration 3: error handling → PASS

---

### Data & API Design

#### [xlsx](xlsx.md)

**Overview**: Excel operations for LP reporting, portfolio import/export, and
golden testing.

**Critical Principle**: Always use Excel formulas (not hardcoded Python values)
for dynamic spreadsheets

**When to use**: LP quarterly reports, waterfall distributions, portfolio data
import, golden tests vs Excel models

**Core Operations**:

- Read: pandas (`pd.read_excel`)
- Write with formulas: openpyxl (`sheet['B1'] = '=SUM(A1:A10)'`)
- Modify existing: `load_workbook` (preserve formulas)

**Financial Standards**:

- Blue text: Hardcoded inputs
- Black text: Formulas/calculations
- Currency: `$#,##0` with unit headers
- Mandatory formula recalculation (`python recalc.py`) before LP delivery

**Example**: Export waterfall to Excel with formulas for Return of Capital,
Preferred Return, Catch-up, Split

---

#### [api-design-principles](api-design-principles.md)

**Overview**: REST API design for Express + TypeScript + Zod + BullMQ VC fund
platform.

**When to use**: Designing new endpoints, refactoring routes, establishing API
standards

**Core Principles**:

1. Resource-oriented (nouns not verbs): `/api/funds/:fundId`
2. HTTP method semantics: GET (retrieve), POST (create), PATCH (update), DELETE
   (remove)
3. Hierarchical nesting (max 2 levels): `/api/funds/:fundId/allocations`

**VC Fund Patterns**:

- Synchronous: `POST /api/waterfalls/calculate` (fast, < 100ms)
- Async (BullMQ): `POST /api/simulations` → 202 Accepted with Location header
- Validation: Zod schemas at endpoint level
- Concurrency: Optimistic locking with version fields
- Idempotency: Idempotency-Key header for POST/PATCH

**Example**: Monte Carlo simulation → POST creates job → 202 Accepted → GET
`/api/simulations/:jobId` → 200 OK when complete

---

#### [architecture-patterns](architecture-patterns.md)

**Overview**: Clean Architecture, Hexagonal Architecture, and Domain-Driven
Design patterns for VC fund modeling platform.

**When to use**: Designing new backend systems, refactoring for maintainability,
establishing architecture standards

**Three Patterns**:

1. **Clean Architecture**: Dependency inversion (domain → use cases → adapters →
   frameworks)
2. **Hexagonal Architecture**: Ports (interfaces) + Adapters (implementations)
3. **Domain-Driven Design**: Bounded contexts, entities, value objects,
   aggregates

**VC Fund Context**:

- Bounded Contexts: Fund Management, Portfolio Tracking, Scenario Planning
- Entities: Fund, Portfolio, Company (identity + behavior)
- Value Objects: Money, Waterfall, Percentage (immutable)
- Aggregates: Fund (with Allocations), Portfolio (with Companies)

**Key Benefits**:

- Testable domain logic (no framework dependencies)
- Swappable adapters (mock for testing, PostgreSQL/Redis for production)
- Business rules in entities (rich domain models)

**Example**: WaterfallEngine (domain) → IWaterfallCalculator (port) →
AmericanWaterfallCalculator (adapter)

---

### Testing Infrastructure

#### [test-fixture-generator](test-fixture-generator/SKILL.md)

**Overview**: Patterns for generating test fixtures, factory functions, and
golden datasets.

**When to use**: Creating test data, refactoring hard-coded fixtures, building
golden datasets, stress test data generation

**Core patterns**:

1. Factory functions with sensible defaults and overrides
2. Golden datasets validated against external sources (Excel)
3. Batch generators with seeded randomness
4. Schema synchronization to prevent fixture drift

**Integration**:

- Works with test-scaffolder agent (generates fixtures for new modules)
- Works with test-repair agent (updates fixtures on schema changes)
- Referenced by test-pyramid skill (fixtures for all test levels)

**Example**: `createTestFund({ size: '100000000.00' })` → Complete fund object
with defaults

---

## Summary

**22 skills across 8 categories**:

- Thinking Frameworks (4)
- Debugging & Problem Solving (3)
- Planning & Design (3)
- Memory & Knowledge Management (2)
- Integration & Coordination (2)
- AI Model Utilization (4)
- Data & API Design (3)
- Testing Infrastructure (1)

**Core principle**: Use the right tool for the job, layer strategically, track
progress, and continuously improve.

**Start here for common tasks**:

- Bug? → **systematic-debugging**
- New feature? → **brainstorming** → **task-decomposition** → **writing-plans**
- Complex analysis? → **extended-thinking-framework**
- Multiple problems? → **dispatching-parallel-agents**
- Research? → **notebooklm** + **memory-management**
- Large task breakdown? → **task-decomposition**
- Test fixtures? → **test-fixture-generator**
