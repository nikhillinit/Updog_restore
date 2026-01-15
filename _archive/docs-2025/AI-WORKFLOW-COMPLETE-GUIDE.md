# Complete AI-Augmented Workflow Guide

## **28 Agents + Orchestration + Superpowers + Thinking Skills**

**Version:** 1.0.0 **Date:** 2025-01-09 **Project:** Press On Ventures VC Fund
Modeling Platform

**Quick Links:**

- [28 Specialized Agents](#28-specialized-agents-summary)
- [Orchestration Patterns](#orchestration-quick-reference)
- [28 Superpowers Skills](#superpowers-skills-complete-list)
- [Coding Pairs](#coding-pairs-patterns)
- [Logic & Thinking Skills](#logic--thinking-frameworks)
- [Quick Reference Card](#quick-reference-card)

---

## 28 Specialized Agents (Summary)

### Testing & Quality (7)

1. **test-automator** - TDD, test generation, coverage
2. **test-repair** - Auto-fix failing tests (47 tests in 12 min)
3. **code-reviewer** - Style, anti-patterns, conventions
4. **comment-analyzer** - Doc accuracy verification
5. **type-design-analyzer** - Type quality ratings (0-10)
6. **silent-failure-hunter** - Find suppressed errors
7. **pr-test-analyzer** - PR test coverage review

### Domain Specialists (2)

8. **waterfall-specialist** (CRITICAL) - ALL VC carry calculations (MANDATORY
   for waterfall)
9. **cohort-specialist** - Cohort analytics (future)

### Architecture & Planning (4)

10. **architect-review** (CRITICAL) - Design decisions, system review
11. **code-explorer** - Understand existing code
12. **dx-optimizer** - Developer experience
13. **legacy-modernizer** - Refactoring, tech debt

### Database (3)

14. **db-migration** (CRITICAL) - Risk assessment (Safe/Risky/Dangerous)
15. **database-expert** - Schema design, optimization
16. **database-admin** - Operations, HA, DR

### Infrastructure & Incidents (3)

17. **incident-responder** - P0 incidents, post-mortems
18. **devops-troubleshooter** - Build issues, deployments
19. **chaos-engineer** - Resilience testing

### Documentation (2)

20. **docs-architect** (CRITICAL) - Technical docs (8 agents -> 2,400 lines in
    45 min)
21. **debug-expert** - Root cause analysis

### General Purpose (4)

22. **general-purpose** - Complex research, multi-step
23. **context-orchestrator** (CRITICAL) - Multi-agent coordinator (META)
24. **knowledge-synthesizer** - Pattern extraction
25. **code-simplifier** - Simplify complex code

### Performance & Security (3)

26. **perf-guard** - Bundle analysis, regressions
27. **security-comprehensive** - Vulnerability scanning
28. **accessibility-compliance** - WCAG testing

---

## Orchestration Quick Reference

### Mode 1: PARALLEL INDEPENDENT (87-91% savings)

**Use for:** Documentation, batch operations, independent modules **Example:** 8
docs-architect agents → 2,400 lines in 45 min **Validation:** Spot-check 2-3
outputs

```typescript
await Promise.all([
  Task({ agent: 'docs-architect', module: 'reserves' }),
  Task({ agent: 'docs-architect', module: 'pacing' }),
  // ... 6 more in parallel
]);
```

### Mode 2: SEQUENTIAL WITH GATES (30-50% savings)

**Use for:** High-risk changes, new features, dependencies **Example:**
Architecture → (gate) → Implement → (gate) → Test **Validation:** Human
checkpoint every phase (2-5 min)

```typescript
const arch = await Task({ agent: 'architect-review', ... });
// GATE: GATE: Human reviews
const impl = await Task({ agent: 'general-purpose', ... });
// GATE: GATE: Code review
await bash('/test-smart');
```

### Mode 3: HYBRID PIPELINE (50-75% savings)

**Use for:** PR reviews, deployment prep, refactoring **Example:** Parallel
research → Sequential fixes → Parallel cleanup **Validation:** Spot-check
parallel, review sequential

```typescript
// Parallel
const [code, comments, types] = await Promise.all([...]);
// GATE: GATE
// Sequential fixes
await Task({ agent: 'general-purpose', fixes });
// Parallel cleanup
await Promise.all([simplify, fix, test]);
```

---

## Superpowers Skills (Complete List)

### Testing Skills (3)

1. **test-driven-development** - RED-GREEN-REFACTOR cycle
   - Auto-activates: Feature implementation
   - Workflow: Write failing test → Minimal code → Refactor

2. **condition-based-waiting** - Replace timeouts with polling
   - Use when: Flaky tests, race conditions
   - Benefit: Eliminates timing guesses

3. **testing-anti-patterns** - Prevent mock abuse
   - Auto-activates: Writing/changing tests
   - Gates: Testing mock behavior, test-only methods

### Debugging Skills (4)

4. **systematic-debugging** (CRITICAL) - Four-phase framework
   - Auto-activates: ANY debugging
   - **Iron Law:** NO FIXES WITHOUT ROOT CAUSE FIRST
   - Phases: Root Cause → Pattern → Hypothesis → Fix

5. **root-cause-tracing** - Trace backward through call stack
   - Use when: Error deep in execution
   - Method: Add instrumentation, find origin

6. **verification-before-completion** (CRITICAL) - Verify before claiming
   success
   - Auto-activates: Before "work complete"
   - **Mandatory:** Run verification, confirm output

7. **defense-in-depth** - Validate at every layer
   - Use when: Invalid data causes deep failures
   - Method: Layer validation, structural impossibility

### Collaboration Skills (9)

8. **brainstorming** (CRITICAL) - Socratic design refinement
   - Use when: Before coding/planning
   - Phases: Understanding → Exploration → Presentation → Documentation →
     Worktree → Planning

9. **writing-plans** (CRITICAL) - Detailed implementation tasks
   - Use when: Design complete, need execution plan
   - Output: 2-5 min tasks, TDD cycles, verification steps

10. **executing-plans** - Batch execution with gates
    - Use when: Have detailed plan
    - Method: Execute in batches, review between

11. **dispatching-parallel-agents** - 3+ independent failures
    - Use when: Multiple independent problems
    - Method: Concurrent investigation, no shared state

12. **requesting-code-review** - Pre-review checklist
    - Use when: Major feature complete
    - Method: Quality gates, agent review

13. **receiving-code-review** - Technical rigor
    - Use when: Receiving feedback
    - **Important:** Verify, don't blindly accept

14. **using-git-worktrees** - Isolated development
    - Use when: Feature needs isolation
    - Method: Create worktree, smart directory selection

15. **finishing-a-development-branch** - Merge/PR decision
    - Use when: Work complete, ready to integrate
    - Options: Merge, PR, cleanup

16. **subagent-driven-development** - Fresh agent per task
    - Use when: Executing multi-task plan
    - Method: Agent per task, code review between

### Thinking Frameworks (4)

17. **inversion-thinking** (CRITICAL) - "What would make this terrible?"
    - Use when: Design validation
    - Method: Identify failure modes, avoid pitfalls

18. **analogical-thinking** - Structured analogies
    - Use when: Explaining complex concepts
    - Method: Map relationships, transfer insights

19. **pattern-recognition** - Detect patterns/contradictions
    - Use when: Analyzing systems
    - Method: Identify recurring structures

20. **continuous-improvement** - 5 reflection prompts
    - Use when: After task completion
    - Method: What worked? What didn't? What learned?

### Memory & Knowledge (2)

21. **memory-management** - Structured notes with confidence
    - Use when: Capturing knowledge
    - Method: Confidence levels, retrieval optimization

22. **integration-with-other-skills** - Coordinate multiple skills
    - Use when: Complex tasks
    - Method: Orchestrate skill activation

### Advanced Frameworks (2)

23. **extended-thinking-framework** (CRITICAL) - XML scaffold for complexity
    - Use when: Complex financial calculations
    - Method: Deep reasoning, structured thinking

24. **notebooklm** - Query Google NotebookLM
    - Use when: Need source-grounded answers
    - Method: Browser automation, citation-backed responses
    - Benefit: Drastically reduced hallucinations

### Domain Specialists (2)

25. **venture-finance-suite** (CRITICAL) - Scenario/DCF/ratios
    - Modes: `scenario | dcf | statements`
    - Use when: Financial modeling for VC funds

26. **mcp-builder** - Create MCP servers
    - Use when: Building MCP integrations
    - Languages: Python (FastMCP), Node (MCP SDK)

### Meta Skills (2)

27. **writing-skills** - TDD for process documentation
    - Use when: Creating new skills
    - Method: Test first, iterate to bulletproof

28. **skill-creator** - Effective skill creation
    - Use when: Extending Claude capabilities
    - Method: Specialized knowledge, workflows, integrations

---

## Logic & Thinking Frameworks

### Extended Thinking (ThinkingMixin)

**Purpose:** Add deep reasoning to ANY agent **Implementation:** Zero-config
mixin pattern

```typescript
// Before
class MyAgent extends BaseAgent {}

// After
class MyAgent extends withThinking(BaseAgent) {
  async run(input) {
    const analysis = await this.think('Analyze...', { depth: 'deep' });
    return this.processThinking(analysis);
  }
}
```

**Features:**

- Automatic budget management ($1 default)
- Smart depth selection:
  - `quick`: ~$0.03, 30s
  - `deep`: ~$0.10, 2-3 min
  - `extended`: ~$0.30, 5-10 min
- Cost tracking, health monitoring
- **Migrated:** ALL 6 TypeScript agents (100%)

**When to use:**

- Complex financial calculations (waterfall, XIRR)
- Novel problems requiring exploration
- Multi-step reasoning with dependencies
- High-stakes decisions

---

### Systematic Debugging Framework

**The Iron Law:** NO FIXES WITHOUT ROOT CAUSE FIRST

**Four Phases:**

```
Phase 1: ROOT CAUSE INVESTIGATION
- Reproduce: Minimal test case
- Trace: Execution path
- Isolate: Where does it fail?
- Instrument: Add logging

Phase 2: PATTERN ANALYSIS
- Similar failures: Historical data
- Common causes: Known anti-patterns
- Impact scope: How widespread?

Phase 3: HYPOTHESIS TESTING
- Theory: Why does this happen?
- Prediction: What should we see?
- Experiment: Test prediction
- Validate: Did prediction hold?

Phase 4: IMPLEMENTATION
- Fix root cause (not symptom!)
- Add regression test
- Document in CHANGELOG
- Update anti-pattern catalog if new
```

**Example:**

```
Bug: XIRR returns NaN for certain portfolios

Phase 1: Root Cause
- Reproduce: Portfolio with zero cash flows
- Trace: xirr.ts line 45 → division by zero
- Isolate: validateCashFlows() missing check

Phase 2: Pattern
- Historical: 3 similar bugs (division by zero)
- Anti-pattern: AP-MATH-01 (unchecked division)

Phase 3: Hypothesis
- Theory: Zero cash flows → sum = 0 → NaN
- Prediction: Add check, should throw error
- Test: Add validation, verify error

Phase 4: Fix
- Add: if (sum === 0) throw new Error(...)
- Test: Add regression test
- Document: /log-change "fix: XIRR zero cash flow"
```

---

## Coding Pairs Patterns

### PATTERN A: Driver-Navigator (AI Drives, Human Navigates)

**Best for:** Well-defined features, incremental development

```
Human: "Add snapshot API"
AI: "10-20 line chunks with checkpoints:
     Chunk 1: Schema → CHECKPOINT
     Chunk 2: Handler → CHECKPOINT
     Chunk 3: Service → CHECKPOINT
     Chunk 4: Tests → CHECKPOINT"
Human: Approves each checkpoint (30s each)
```

### PATTERN B: Mob Programming (AI + Human + Agents)

**Best for:** Complex features, learning new patterns

```
Team: Human + AI + 3 specialist agents
Human: Strategy & decisions
AI: Implementation driver
test-automator: Write tests
code-reviewer: Review each chunk
waterfall-specialist: Validate VC logic
```

### PATTERN C: TDD Pairs (Test-First with AI)

**Best for:** Critical logic, new algorithms

```
Human: "We need tiered waterfall calculation"
AI: "TDD cycle:
     RED: Write failing test for tiered hurdles
     GREEN: Minimal implementation
     REFACTOR: Cleanup with code-simplifier
     VALIDATE: waterfall-specialist reviews"
```

---

## Quick Reference Card

### Daily Commands

```bash
/test-smart      # Fast test feedback (~30s)
/fix-auto        # Auto-cleanup (2-3 min)
/log-change      # Document changes
/workflows       # Decision trees
```

### Agent Selection

```
Waterfall calc? → waterfall-specialist (MANDATORY)
Schema change? → db-migration (risk check first)
Tests failing? → /fix-auto → test-repair
Bug? → systematic-debugging skill
Docs needed? → 8× docs-architect (parallel)
PR review? → 6 agents (hybrid pipeline)
```

### Orchestration Decision

```
Independent tasks? → PARALLEL (87-91% savings)
High risk? → SEQUENTIAL WITH GATES (30-50% savings)
Mixed? → HYBRID PIPELINE (50-75% savings)
```

### Validation Checklist

```
Before commit:
 /test-smart passes
 /fix-auto cleanup
 Spot-check code (2 min)
 /log-change documented

Before deploy:
 /deploy-check passes
 Staging smoke test
 Ship it!
```

### Time Savings by Task

| Task          | Manual | With AI | Savings | Mode       |
| ------------- | ------ | ------- | ------- | ---------- |
| Documentation | 5.5 hr | 45 min  | 87%     | Parallel   |
| Test repair   | 2-3 hr | 12 min  | 90%     | Sequential |
| PR review     | 1 hr   | 15 min  | 75%     | Hybrid     |
| Bug fix       | 45 min | 12 min  | 73%     | Sequential |
| Feature       | 4 hr   | 2 hr    | 50%     | Sequential |

---

## Anti-Pattern Quick Reference

### 24 Anti-Patterns (Condensed)

**Cursor Pagination (6)**

- AP-CURSOR-01: Missing indexes → 45s queries
- AP-CURSOR-02: No validation → SQL injection
- AP-CURSOR-03: Sequential IDs → Enumeration
- AP-CURSOR-04: No limit clamp → Resource exhaustion
- AP-CURSOR-05: Single column sort → Page drift
- AP-CURSOR-06: String concat → SQL injection

**Idempotency (7)**

- AP-IDEM-01: In-memory storage → Memory leak
- AP-IDEM-02: No TTL → Database bloat
- AP-IDEM-03: Check-then-act → Race condition
- AP-IDEM-04: No cleanup → Storage growth
- AP-IDEM-05: Inconsistent format → Poor debugging
- AP-IDEM-06: No version tracking → Non-idempotent
- AP-IDEM-07: Response mismatch → Contract violation

**Optimistic Locking (5)**

- AP-LOCK-01: Pessimistic locking → Deadlocks
- AP-LOCK-02: Version overflow → Use bigint!
- AP-LOCK-03: Missing version check → Lost updates
- AP-LOCK-04: No retry guidance → Poor UX
- AP-LOCK-05: Unhandled deadlocks → 500 errors

**BullMQ Queue (6)**

- AP-QUEUE-01: Infinite retries → Congestion
- AP-QUEUE-02: No timeout → Worker stalls (5 min max!)
- AP-QUEUE-03: Orphaned jobs → Stuck state
- AP-QUEUE-04: No dead letter queue → Lost failures
- AP-QUEUE-05: Memory leaks → Redis exhaustion
- AP-QUEUE-06: No progress tracking → Poor UX

---

## Memory Management

### The Three Systems

**1. CLAUDE.md** - Core architecture

- Tech stack, conventions, commands
- Update: Rarely (architecture changes only)

**2. CHANGELOG.md** - All changes

- Timestamped feature/fix entries
- Update: After every feature via `/log-change`

**3. DECISIONS.md** - Architectural decisions

- ADR format (why we chose X)
- Update: Design decisions via `/log-decision`

**4. Native Memory (NEW!)** - Cross-session learning

- Pattern learning, collective intelligence
- Update: Automatic (knowledge-synthesizer)

### Memory Workflow

```
After feature:
1. /log-change "feat: description"
2. IF architectural: /log-decision "why X"
3. IF new pattern: /create-cheatsheet [topic]
```

---

## Troubleshooting Guide

### Common Issues

```
Tests failing?
→ /fix-auto (fixes 60%)
→ test-repair agent (fixes 30% more)
→ Manual debug (remaining 10%)

Build failing?
→ npm run doctor:links (Windows check)
→ /fix-auto
→ npm run build

Agent weird results?
→ Run again (LLM variance)
→ Try different agent
→ Validate manually

Stuck after 15 min?
→ STOP automation
→ Go manual
→ Document failure
→ File issue
```

---

## Decision Trees

### Should I Automate This Task?

```
 Is the task repetitive?

 YES → Is it well-defined?

   YES → Is it low-risk?

     YES → AUTOMATE (parallel if possible)
     NO → AUTOMATE WITH GATES (human checkpoints)

   NO → Is it exploratory?

      YES → Use agent for research, human decides
      NO → MANUAL (too vague for automation)

 NO → Is it high-value one-time task?

    YES → Consider agent assistance
    NO → MANUAL (not worth setup cost)
```

### Which Agent to Use?

```
 What's the task type?

 Waterfall/Carry calculation → waterfall-specialist (MANDATORY)
 Schema change → db-migration (risk check first)
 Test failures → /fix-auto → test-repair
 Bug investigation → systematic-debugging skill
 Documentation → 8× docs-architect (parallel)
 PR review → 6 agents (hybrid)
 Performance issue → perf-guard
 Architecture decision → architect-review
 Understand code → code-explorer
 Complex research → general-purpose
```

---

## Success Metrics

### Proven Performance (This Project)

**Week 46 Documentation Sprint:**

- Task: Generate 5 NotebookLM modules
- Agents: 8× docs-architect (parallel)
- Time: 45 minutes vs 5.5 hours
- Output: 2,400+ lines
- Quality: 95-99% (Promptfoo)
- **ROI: 7.3x speedup**

**Test Repair Automation:**

- Task: Fix 47 failing tests
- Agent: test-repair (systematic debugging)
- Time: 12 minutes vs 2-3 hours
- **ROI: 10-15x speedup**

**PR Review Pipeline:**

- Task: Review 15-file PR
- Agents: 6 agents (hybrid)
- Time: 15 minutes vs 1 hour
- **ROI: 4x speedup**

---

## Getting Started Checklist

### Week 1: Basics

```
 Learn 5 core commands (/test-smart, /fix-auto, etc.)
 Make first automated commit
 Understand orchestration modes
 Try 1 specialist agent (waterfall-specialist recommended)
```

### Week 2-4: Intermediate

```
 Use 3+ specialized agents
 First parallel orchestration
 Complete hybrid pipeline (PR review)
 Document patterns in CHANGELOG
```

### Month 1 Goal

```
 Comfortable with daily workflow
 2-3x faster on suitable tasks
 Understand when NOT to automate
 Can teach others the basics
```

---

## Key Takeaways

1. **Use the right mode:** Parallel for independence, Sequential for risk,
   Hybrid for complexity
2. **Validate smartly:** Spot-check parallel, review gates for sequential
3. **Document everything:** /log-change after every feature
4. **Don't over-automate:** Some tasks are faster manual
5. **Learn incrementally:** 5 commands → 28 agents → Orchestration
6. **Real ROI:** 50-90% savings on automation-suitable tasks
7. **Human oversight:** Always validate, never blindly trust

---

**Next Steps:**

1. Try your first `/test-smart` → `/fix-auto` cycle
2. Use waterfall-specialist for next carry calculation
3. Read full guide:
   [COMPREHENSIVE-WORKFLOW-GUIDE.md](COMPREHENSIVE-WORKFLOW-GUIDE.md)
4. Join #ai-workflow channel for tips

**Questions?** `/workflows` for interactive decision trees

---

**Document Version:** 1.0.0 **Last Updated:** 2025-01-09 **Maintained by:**
AI-Augmented Development Team **Feedback:** Create issue in repo or #ai-workflow
Slack channel
