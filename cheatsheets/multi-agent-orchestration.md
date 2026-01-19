---
status: ACTIVE
last_updated: 2026-01-19
---

# Multi-Agent Orchestration Patterns

**Purpose**: Coordinate multiple AI agents for maximum efficiency and quality

**Proven Results**: 87-91% time savings, 3x faster than sequential execution

**When to Use**: Complex tasks with 3+ independent subtasks, large documentation
projects, comprehensive code reviews

---

## Quick Reference

| Pattern                  | Use When                   | Agents      | Time Savings | Complexity |
| ------------------------ | -------------------------- | ----------- | ------------ | ---------- |
| **Parallel Independent** | 3-4 tasks, no dependencies | 3-8 agents  | 69-91%       | Low        |
| **Sequential Gates**     | Dependencies between tasks | 2-5 agents  | 30-50%       | Medium     |
| **Hybrid Pipeline**      | Mixed dependencies         | 4-10 agents | 50-75%       | High       |
| **Review Pairing**       | Real-time quality gates    | 2 agents    | 40-60%       | Low        |

---

## The Three Core Patterns

### 1. Parallel Independent Execution

**When**: Tasks have zero dependencies, can run simultaneously

**Example from Phase 1** (Week 46 Documentation):

```
8 agents in parallel → 2,400+ lines in 45 minutes
Sequential estimate: 6-8 hours (87-91% time savings)
```

**Task Tool Syntax**:

```typescript
// Launch 8 agents in parallel (single message, multiple tool calls)
const results = await Promise.all([
  Task({ agent: 'docs-architect', task: 'waterfall-module' }),
  Task({ agent: 'docs-architect', task: 'xirr-module' }),
  Task({ agent: 'docs-architect', task: 'fees-module' }),
  Task({ agent: 'docs-architect', task: 'capital-allocation-module' }),
  Task({ agent: 'docs-architect', task: 'exit-recycling-module' }),
  Task({ agent: 'docs-architect', task: 'pacing-module' }),
  Task({ agent: 'docs-architect', task: 'reserves-module' }),
  Task({ agent: 'docs-architect', task: 'cohorts-module' }),
]);

// Total time: 45 minutes
// Sequential: 6-8 hours (8 × 45-60 min)
// Speedup: 8-10x
```

**Real Example** (Week 46):

```markdown
## Task: Generate NotebookLM documentation for 5 financial modules

**Sequential Approach** (avoided):

1. Waterfall module: 60 min
2. XIRR module: 60 min
3. Fees module: 60 min
4. Capital Allocation: 90 min
5. Exit Recycling: 60 min Total: 330 minutes (5.5 hours)

**Parallel Approach** (used): Launch 8 docs-architect agents simultaneously:

- Each handles 1 module independently
- No shared state, no coordination needed
- All complete in ~45 minutes (longest agent)

**Result**:

- 2,400+ lines generated
- 95-99% quality (validated with Promptfoo)
- 87% time savings (45 min vs 5.5 hours)
```

---

### 2. Sequential with Quality Gates

**When**: Tasks depend on previous outputs, quality validation required

**Pattern**:

```
Task 1 (Agent A) → Validate → Task 2 (Agent B) → Validate → Task 3 (Agent C)
```

**Example: Multi-Phase Migration**:

```typescript
// Phase 1: Planning (db-migration agent)
const plan = await Task({
  agent: 'db-migration',
  task: 'Plan zero-downtime column addition to funds table (5M rows)',
});

// Quality Gate 1: Review plan
if (plan.risk === 'CRITICAL' || plan.downtime > 0) {
  throw new Error('Plan requires manual review');
}

// Phase 2: Generate Migration SQL (db-migration agent)
const migration = await Task({
  agent: 'db-migration',
  task: `Generate SQL for: ${plan.strategy}`,
});

// Quality Gate 2: Validate SQL
await validateSQL(migration.sql);

// Phase 3: Test on Staging (devops-troubleshooter agent)
const test = await Task({
  agent: 'devops-troubleshooter',
  task: `Execute migration on staging: ${migration.sql}`,
});

// Quality Gate 3: Verify zero downtime
if (test.downtime > 100) {
  // 100ms threshold
  throw new Error('Downtime exceeds limit');
}

// Safe to proceed to production
```

**Time Savings**: 30-50% (gates prevent rework)

---

### 3. Hybrid Pipeline

**When**: Mix of parallel and sequential tasks

**Example: Feature Development**:

```typescript
// Stage 1: Parallel Research (3 agents)
const [architecture, patterns, risks] = await Promise.all([
  Task({ agent: 'architect-review', task: 'Review current architecture' }),
  Task({ agent: 'code-explorer', task: 'Find similar implementations' }),
  Task({ agent: 'database-expert', task: 'Assess schema impact' }),
]);

// Quality Gate: Synthesize findings
const plan = synthesize([architecture, patterns, risks]);

// Stage 2: Sequential Implementation (with gates)
const implementation = await Task({
  agent: 'general-purpose',
  task: `Implement feature using: ${plan}`,
});

// Stage 3: Parallel Validation (6 agents)
const [comments, tests, errors, types, review, simplify] = await Promise.all([
  Task({ agent: 'comment-analyzer', files: implementation.files }),
  Task({ agent: 'pr-test-analyzer', files: implementation.files }),
  Task({ agent: 'silent-failure-hunter', files: implementation.files }),
  Task({ agent: 'type-design-analyzer', files: implementation.files }),
  Task({ agent: 'code-reviewer', files: implementation.files }),
  Task({ agent: 'code-simplifier', files: implementation.files }),
]);

// Quality Gate: Block if critical issues
const critical = [errors, types].filter((r) => r.severity === 'CRITICAL');
if (critical.length > 0) {
  throw new Error('Critical issues found');
}
```

**Time Savings**: 50-75% (combines benefits of both patterns)

---

## Orchestration Decision Matrix

| Task Characteristics        | Recommended Pattern  | Example Agents                                    |
| --------------------------- | -------------------- | ------------------------------------------------- |
| **3-8 independent modules** | Parallel Independent | docs-architect × 8                                |
| **Sequential dependencies** | Sequential Gates     | db-migration → devops-troubleshooter              |
| **Mixed dependencies**      | Hybrid Pipeline      | Research (parallel) → Build → Validate (parallel) |
| **Real-time review**        | Review Pairing       | Builder + code-reviewer                           |
| **Multi-AI consensus**      | Parallel Comparison  | gemini + openai + deepseek                        |

---

## Performance Benchmarks

### Real Data from This Project

**Phase 1 Documentation** (Week 46):

- **Task**: Generate 5 NotebookLM modules
- **Agents**: 8 docs-architect agents
- **Mode**: Parallel Independent
- **Time**: 45 minutes
- **Sequential Estimate**: 5.5 hours
- **Speedup**: 8-10x
- **Quality**: 95-99% (validated)

**Memory Integration** (Week 1):

- **Task**: Enhance 5 agents with memory
- **Agents**: docs-architect (sequential, 1 per agent)
- **Mode**: Sequential (documentation dependencies)
- **Time**: 3 hours
- **Parallel Estimate**: N/A (sequential required)
- **Quality**: Comprehensive (1,200-1,500 lines each)

**Code Review** (typical PR):

- **Task**: Review 15 changed files
- **Agents**: 6 review agents
- **Mode**: Parallel Independent
- **Time**: 3-5 minutes
- **Sequential Estimate**: 15-20 minutes
- **Speedup**: 4-5x

---

## Cost Considerations

### Token Usage Patterns

**Parallel Execution**:

- ✅ **Efficient**: Each agent has focused context (lower token usage per agent)
- ✅ **No duplication**: Independent tasks, no shared context overhead
- ⚠️ **Burst cost**: All agents run simultaneously (upfront cost)

**Example** (8 docs-architect agents):

```
Agent 1: 15,000 tokens (waterfall module)
Agent 2: 18,000 tokens (XIRR module)
Agent 3: 20,000 tokens (fees module)
...
Total: ~140,000 tokens

Cost: ~$0.70 (Sonnet 4.5: $3/MTok input, $15/MTok output)
Time: 45 minutes
Value: 5.5 hours saved = $165 (at $30/hour)
ROI: 235x
```

**Sequential Execution**:

- ✅ **Predictable**: One agent at a time, easier to budget
- ⚠️ **Context accumulation**: Later agents may carry context from earlier
  (higher tokens)
- ⚠️ **Slower**: No parallelism benefits

---

## Agent Communication Patterns

### Pattern 1: No Communication (Parallel Independent)

```typescript
// Agents don't share outputs, fully independent
const [a, b, c] = await Promise.all([
  Task({ agent: 'docs-architect', task: 'Module A' }),
  Task({ agent: 'docs-architect', task: 'Module B' }),
  Task({ agent: 'docs-architect', task: 'Module C' }),
]);

// No agent sees other agents' outputs
// Maximum parallelism, zero coordination overhead
```

**Use When**: Tasks are truly independent (documentation modules, test files,
validation checks)

---

### Pattern 2: Sequential Handoff (Gates)

```typescript
// Agent B receives Agent A's output
const resultA = await Task({ agent: 'agent-a', task: 'Step 1' });

// Validate before next step
if (!validate(resultA)) throw new Error('Validation failed');

const resultB = await Task({
  agent: 'agent-b',
  task: `Step 2 using: ${resultA.output}`,
});
```

**Use When**: Later tasks depend on earlier outputs (migration planning →
execution, architecture → implementation)

---

### Pattern 3: Convergent Synthesis

```typescript
// Multiple agents, synthesize results
const [gemini, openai, claude] = await Promise.all([
  Task({ agent: 'gemini', task: 'Analyze approach' }),
  Task({ agent: 'openai', task: 'Analyze approach' }),
  Task({ agent: 'deepseek', task: 'Analyze approach' }),
]);

// Synthesize consensus
const consensus = synthesizeConsensus([gemini, openai, claude]);

// Next agent uses consensus
const implementation = await Task({
  agent: 'general-purpose',
  task: `Implement using consensus: ${consensus}`,
});
```

**Use When**: Need multiple perspectives, consensus building, validation
(architecture decisions, security reviews)

---

## Quality Gates

### Gate 1: Output Validation

```typescript
const result = await Task({ agent: 'docs-architect', task: 'Generate docs' });

// Validate structure
if (!result.includes('## Summary') || !result.includes('## Examples')) {
  throw new Error('Documentation missing required sections');
}

// Validate quality (optional: use validation agent)
const score = await validateQuality(result); // Promptfoo
if (score < 92) {
  throw new Error(`Quality too low: ${score}%`);
}
```

---

### Gate 2: Dependency Check

```typescript
// Before launching dependent agents, verify prerequisites
if (!planReviewComplete) {
  throw new Error('Cannot start implementation, plan not reviewed');
}

if (riskLevel === 'CRITICAL') {
  throw new Error('Manual review required for CRITICAL changes');
}

// Safe to proceed
const implementation = await Task({ agent: 'builder', task: 'Implement' });
```

---

### Gate 3: Resource Limits

```typescript
// Track concurrent agents
const MAX_CONCURRENT = 10;
const activeAgents = getActiveAgentCount();

if (activeAgents >= MAX_CONCURRENT) {
  await waitForSlot(); // Queue or throttle
}

// Launch agent
const result = await Task({ agent: 'agent-x', task: 'Work' });
```

---

## Memory Sharing Between Agents

### Pattern: Shared Project Memory

**Scenario**: Multiple agents need same learned patterns

```typescript
// Agent 1 stores pattern
await memory.add({
  userId: 'project',
  agentId: 'perf-guard',
  role: 'system',
  content: JSON.stringify({
    type: 'learned-pattern',
    pattern: 'recharts upgrades often double bundle size',
    mitigation: 'Pin recharts version',
  }),
});

// Agent 2 (hours later) queries pattern
const patterns = await memory.search('recharts bundle size', 5);
// Finds Agent 1's pattern, benefits from learning
```

**Memory Scopes**:

- `session`: Temporary, one agent session
- `project`: Persistent, shared across all agents in project
- `longterm`: Global patterns, cross-project

---

## Error Handling in Orchestration

### Strategy 1: Fail Fast

```typescript
// Any agent failure stops entire workflow
try {
  const [a, b, c] = await Promise.all([
    Task({ agent: 'agent-a', task: 'Work A' }),
    Task({ agent: 'agent-b', task: 'Work B' }),
    Task({ agent: 'agent-c', task: 'Work C' }),
  ]);
} catch (error) {
  console.error('Agent failed, entire workflow stopped:', error);
  // Rollback any partial work
  await rollback();
  throw error;
}
```

**Use When**: All tasks are critical, partial success unacceptable

---

### Strategy 2: Graceful Degradation

```typescript
// Some agents allowed to fail
const results = await Promise.allSettled([
  Task({ agent: 'agent-a', task: 'Work A' }),
  Task({ agent: 'agent-b', task: 'Work B' }),
  Task({ agent: 'agent-c', task: 'Work C' }),
]);

const successes = results.filter((r) => r.status === 'fulfilled');
const failures = results.filter((r) => r.status === 'rejected');

console.log(`${successes.length}/3 agents succeeded`);

// Continue with partial results
if (successes.length >= 2) {
  processResults(successes.map((s) => s.value));
} else {
  throw new Error('Too many agent failures');
}
```

**Use When**: Tasks are independent, partial success valuable (e.g., validation
agents)

---

### Strategy 3: Retry with Backoff

```typescript
async function orchestrateWithRetry(agents, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const results = await Promise.all(
        agents.map((agent) => Task({ agent: agent.name, task: agent.task }))
      );
      return results; // Success
    } catch (error) {
      if (i === maxRetries - 1) throw error; // Final failure

      console.warn(`Attempt ${i + 1} failed, retrying...`);
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

**Use When**: Transient failures expected (API rate limits, network issues)

---

## Real-World Workflows

### Workflow 1: Documentation Generation (Parallel)

```typescript
/**
 * Generate comprehensive documentation for 5 modules
 * Pattern: Parallel Independent
 * Agents: docs-architect × 8
 * Time: 45 minutes (vs 5.5 hours sequential)
 */

const modules = [
  'waterfall',
  'xirr',
  'fees',
  'capital-allocation',
  'exit-recycling',
  'pacing',
  'reserves',
  'cohorts',
];

// Launch all agents in parallel
const docs = await Promise.all(
  modules.map((module) =>
    Task({
      agent: 'docs-architect',
      task: `Generate NotebookLM documentation for ${module} module.
             Include: summary, examples, truth cases, code references.
             Target: 94-97% quality (Promptfoo validated).`,
    })
  )
);

// Validate quality (parallel)
const scores = await Promise.all(docs.map((doc) => validateWithPromptfoo(doc)));

// Filter low-quality docs
const lowQuality = scores.filter((s) => s.score < 92);
if (lowQuality.length > 0) {
  console.warn(`${lowQuality.length} docs below 92% threshold`);
  // Regenerate low-quality docs
}

// Success: 2,400+ lines, 95-99% quality, 87% time savings
```

---

### Workflow 2: Feature Implementation (Hybrid)

```typescript
/**
 * Implement new feature with quality gates
 * Pattern: Hybrid (parallel research → sequential build → parallel validation)
 * Time: 60-90 min (vs 3-4 hours)
 */

// Stage 1: Parallel Research (15 min)
const [arch, similar, schema] = await Promise.all([
  Task({ agent: 'architect-review', task: 'Review architecture for feature' }),
  Task({ agent: 'code-explorer', task: 'Find similar features in codebase' }),
  Task({ agent: 'database-expert', task: 'Assess schema changes needed' }),
]);

// Gate: Synthesize plan
const plan = synthesizePlan([arch, similar, schema]);
if (plan.risk === 'HIGH') {
  await manualReview(plan);
}

// Stage 2: Sequential Implementation (30-45 min)
const code = await Task({
  agent: 'general-purpose',
  task: `Implement feature:
         Architecture: ${arch.summary}
         Examples: ${similar.files}
         Schema: ${schema.changes}

         Follow TDD, use coding pairs workflow.`,
});

// Stage 3: Parallel Validation (3-5 min)
const [comments, tests, errors, types, review, simplify] = await Promise.all([
  Task({ agent: 'comment-analyzer', files: code.files }),
  Task({ agent: 'pr-test-analyzer', files: code.files }),
  Task({ agent: 'silent-failure-hunter', files: code.files }),
  Task({ agent: 'type-design-analyzer', files: code.files }),
  Task({ agent: 'code-reviewer', files: code.files }),
  Task({ agent: 'code-simplifier', files: code.files }),
]);

// Gate: Block if critical issues
const critical = [errors, types]
  .flat()
  .filter((r) => r.severity === 'CRITICAL');
if (critical.length > 0) {
  throw new Error(`${critical.length} critical issues found`);
}

// Success: Feature implemented, validated, ready for commit
```

---

### Workflow 3: Code Review (Parallel)

```typescript
/**
 * Comprehensive PR review
 * Pattern: Parallel Independent
 * Agents: 6 review agents
 * Time: 3-5 min (vs 15-20 min sequential)
 */

const changedFiles = getChangedFiles(); // From git diff

// Launch 6 review agents in parallel
const [comments, tests, errors, types, review, simplify] = await Promise.all([
  Task({
    agent: 'comment-analyzer',
    task: `Review comments in: ${changedFiles.join(', ')}`,
  }),
  Task({
    agent: 'pr-test-analyzer',
    task: `Analyze test coverage for: ${changedFiles.join(', ')}`,
  }),
  Task({
    agent: 'silent-failure-hunter',
    task: `Check error handling in: ${changedFiles.join(', ')}`,
  }),
  Task({
    agent: 'type-design-analyzer',
    task: `Score type design (1-10) for: ${changedFiles.join(', ')}`,
  }),
  Task({
    agent: 'code-reviewer',
    task: `Verify CLAUDE.md compliance in: ${changedFiles.join(', ')}`,
  }),
  Task({
    agent: 'code-simplifier',
    task: `Suggest simplifications for: ${changedFiles.join(', ')}`,
  }),
]);

// Aggregate results
const allIssues = [
  ...comments.issues,
  ...tests.gaps,
  ...errors.patterns,
  ...types.lowScores,
  ...review.violations,
  ...simplify.suggestions,
];

// Prioritize
const critical = allIssues.filter((i) => i.severity === 'CRITICAL');
const high = allIssues.filter((i) => i.severity === 'HIGH');

// Report
console.log(`Review Complete:
  Files: ${changedFiles.length}
  Critical: ${critical.length}
  High: ${high.length}
  Time: 3-5 minutes
`);

// Block merge if critical issues
if (critical.length > 0) {
  throw new Error('Cannot merge: critical issues found');
}
```

---

## Monitoring and Observability

### Metrics to Track

```typescript
interface OrchestrationMetrics {
  totalAgents: number;
  successfulAgents: number;
  failedAgents: number;
  avgDurationMs: number;
  totalTokens: number;
  totalCost: number;
  patternUsed: 'parallel' | 'sequential' | 'hybrid';
  timeSavings: number; // vs sequential baseline
}

// Example metrics from Week 46:
const week46Metrics: OrchestrationMetrics = {
  totalAgents: 8,
  successfulAgents: 8,
  failedAgents: 0,
  avgDurationMs: 45 * 60 * 1000, // 45 min
  totalTokens: 140000,
  totalCost: 0.7,
  patternUsed: 'parallel',
  timeSavings: 0.87, // 87%
};
```

---

## Troubleshooting

**Q: Parallel agents slower than expected** A: Check for hidden dependencies
(shared state, memory, file locks). Use truly independent tasks.

**Q: High token costs with parallelism** A: Ensure agents have focused context.
Avoid passing large shared context to all agents.

**Q: Agents produce inconsistent outputs** A: Use quality gates with validation.
Consider sequential for tasks requiring consistency.

**Q: Too many concurrent agents** A: Implement resource limits (max 10
concurrent). Queue or throttle additional agents.

**Q: Sequential gates too slow** A: Minimize validation overhead. Batch
validations where possible.

---

## Quick Start Checklist

### For Your First Parallel Orchestration

- [ ] Identify 3+ independent tasks
- [ ] Verify zero dependencies between tasks
- [ ] Choose appropriate agents (same agent type often works)
- [ ] Launch all in single Task tool call (Promise.all pattern)
- [ ] Validate outputs in parallel
- [ ] Measure time savings vs sequential baseline
- [ ] Document metrics for future reference

### For Your First Sequential Pipeline

- [ ] Map task dependencies (A → B → C)
- [ ] Define quality gates between stages
- [ ] Choose appropriate agent for each stage
- [ ] Implement validation logic
- [ ] Add error handling (fail fast or graceful)
- [ ] Track handoff overhead
- [ ] Optimize gate validation time

---

## References

- **Coding Pairs Playbook**: `cheatsheets/coding-pairs-playbook.md`
- **Multi-AI Workflows**: `cheatsheets/multi-ai-workflows.md`
- **Agent Memory Integration**: `cheatsheets/agent-memory-integration.md`
- **Phase 1 Results**: `CHANGELOG.md` (Week 46 metrics)

---

**Created**: 2025-11-06 **Last Updated**: 2025-11-06 **Owner**: Development Team
**Next Review**: 2025-12-06
