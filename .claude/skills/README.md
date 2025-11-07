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

### 🧠 Thinking Frameworks

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

### 🔍 Debugging & Problem Solving

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

### 📝 Planning & Design

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

### 💾 Memory & Knowledge Management

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

### 🔗 Integration & Coordination

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
3. writing-plans (create implementation tasks)
   ↓
4. Execute plan with /test-smart
   ↓
5. memory-management (track progress)
   ↓
6. continuous-improvement (reflect on process)
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
  brainstorming + inversion-thinking + writing-plans

Debugging:
  systematic-debugging + root-cause-tracing + pattern-recognition

Implementation:
  writing-plans + /test-smart + /fix-auto + continuous-improvement

Research:
  extended-thinking-framework + notebooklm + memory-management

Quality:
  pattern-recognition + multi-ai-collab + continuous-improvement
```

## Best Practices

### 1. Choose the Right Skill

- **Analysis**: pattern-recognition, memory-management
- **Planning**: brainstorming, inversion-thinking, writing-plans
- **Debugging**: systematic-debugging, root-cause-tracing
- **Execution**: Project slash commands (/test-smart, /fix-auto)
- **Reflection**: continuous-improvement

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

## Summary

**13 skills across 5 categories**:

- 🧠 Thinking Frameworks (4)
- 🔍 Debugging & Problem Solving (3)
- 📝 Planning & Design (2)
- 💾 Memory & Knowledge Management (2)
- 🔗 Integration & Coordination (2)

**Core principle**: Use the right tool for the job, layer strategically, track
progress, and continuously improve.

**Start here for common tasks**:

- Bug? → **systematic-debugging**
- New feature? → **brainstorming** → **writing-plans**
- Complex analysis? → **extended-thinking-framework**
- Multiple problems? → **dispatching-parallel-agents**
- Research? → **notebooklm** + **memory-management**
