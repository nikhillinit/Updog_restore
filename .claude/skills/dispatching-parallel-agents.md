# Dispatching Parallel Agents

## Overview

Use when facing 3+ independent failures that can be investigated without shared
state or dependencies. Dispatch multiple Claude agents to investigate and fix
independent problems concurrently.

## Core Principle

**Dispatch one agent per independent problem domain. Let them work
concurrently.**

## When to Use

✅ **Use when:**

- 3+ test files failing with different root causes
- Multiple subsystems broken independently
- Each problem can be understood without context from others
- No shared state between investigations
- Time-sensitive (need fast parallel investigation)

❌ **Don't use when:**

- Failures are related (fixing one might fix others)
- Need to understand full system state first
- Agents would interfere with each other (file conflicts)
- Single investigation would be faster than coordination overhead

## The Pattern

### Step 1: Identify Independent Domains

Group failures by what's broken:

```markdown
Test Failures:

- agent-tool-abort.test.ts (3 failures) - Abort functionality
- batch-completion-behavior.test.ts (5 failures) - Batch processing
- tool-approval-race-conditions.test.ts (2 failures) - Tool approval flow

Analysis: ✓ Different subsystems (abort vs batch vs approval) ✓ Different files
(no conflicts) ✓ No shared state between domains → Good candidate for parallel
dispatch
```

### Step 2: Create Focused Agent Tasks

Each agent gets:

- **Specific scope**: One test file or subsystem
- **Clear goal**: Make these tests pass
- **Constraints**: Don't change other code
- **Expected output**: Summary of findings and fixes

#### Good Agent Prompt Template

```markdown
## Task: Fix [specific test file] failures

**Scope**: Only work on tests in [file path]

**Goal**: Make all tests in this file pass

**Constraints**:

- Do NOT modify code outside [specific directory]
- Do NOT refactor unrelated code
- Focus on minimal fixes

**Expected Output**:

1. Summary of root cause for each failure
2. List of files changed with line numbers
3. Verification that tests now pass
4. Any concerns or follow-up needed

**Context**: [Paste relevant error messages and test names]
```

### Step 3: Dispatch in Parallel

Use Claude Code's Task tool to launch multiple agents:

```typescript
// In Claude Code - single message with multiple Task calls
Task({
  subagent_type: 'debug-expert',
  prompt: 'Fix agent-tool-abort.test.ts failures...',
  description: 'Fix abort test failures',
});

Task({
  subagent_type: 'debug-expert',
  prompt: 'Fix batch-completion-behavior.test.ts failures...',
  description: 'Fix batch test failures',
});

Task({
  subagent_type: 'debug-expert',
  prompt: 'Fix tool-approval-race-conditions.test.ts failures...',
  description: 'Fix approval test failures',
});
```

**Critical**: All Task calls in **single message** for true parallelism

### Step 4: Review and Integrate

When agents return:

1. **Read each summary** - Understand what each agent found and fixed
2. **Check for conflicts** - Did agents modify same files?
3. **Verify fixes don't conflict** - Do changes work together?
4. **Run full test suite** - Ensure no regressions
5. **Integrate all changes** - Commit if all tests pass

## Agent Prompt Structure

### Good Prompts Are:

**1. Focused**

- ❌ "Fix all the tests"
- ✅ "Fix agent-tool-abort.test.ts"

**2. Self-contained**

- ❌ "Fix the race condition"
- ✅ "Fix the race condition in tool approval flow. Error: [paste full error].
  Test: [paste test code]"

**3. Specific about output**

- ❌ "Fix it"
- ✅ "Return: (1) Root cause summary, (2) Files changed, (3) Test results"

**4. Constrained**

- ❌ No constraints (agent might refactor everything)
- ✅ "Do NOT change production code outside src/tools/ directory"

### Example: Complete Agent Prompt

```markdown
## Task: Fix Waterfall Type Conversion Tests

**Scope**: Only tests/unit/waterfall-type-conversion.test.ts

**Goal**: Make all 4 failing tests pass:

1. test_american_to_european_conversion
2. test_european_to_american_conversion
3. test_type_guards_after_conversion
4. test_schema_validation_after_conversion

**Context**: Error messages:
```

FAIL test_american_to_european_conversion Expected: { type: 'EUROPEAN', ... }
Received: { type: 'AMERICAN', ... }

```

Code under test: client/src/lib/waterfall.ts (changeWaterfallType function)

**Constraints**:
- Only modify client/src/lib/waterfall.ts and the test file
- Do NOT refactor other waterfall functions
- Maintain backward compatibility

**Expected Output**:
1. Root cause of type conversion failure
2. Exact line numbers changed in waterfall.ts
3. Confirmation that all 4 tests now pass
4. Any edge cases discovered
```

## Common Mistakes

### Mistake 1: Too Broad Scope

❌ **Bad**: "Fix all failing tests in the repo" ✅ **Good**: "Fix failing tests
in server/routes/funds.test.ts"

**Why**: Narrow scope = faster completion, less conflict risk

### Mistake 2: Missing Context

❌ **Bad**: "Fix the race condition" ✅ **Good**: [Paste error message, stack
trace, relevant code]

**Why**: Agents work independently, can't ask clarifying questions

### Mistake 3: No Constraints

❌ **Bad**: "Make tests pass" (agent might rewrite everything) ✅ **Good**:
"Only modify validation logic in schema.ts"

**Why**: Prevents agents from creating massive refactoring conflicts

### Mistake 4: Vague Output Requirements

❌ **Bad**: "Let me know what you find" ✅ **Good**: "Return: root cause, files
changed with line numbers, test results"

**Why**: Structured output makes integration easier

### Mistake 5: Sequential Dispatch

❌ **Bad**: Launch agent 1, wait for completion, launch agent 2 ✅ **Good**:
Launch all agents in single message

**Why**: Lose parallelism benefit if sequential

## Integration with VC Fund Modeling Context

### Example: Multiple Engine Test Failures

**Scenario**: After refactoring, 3 engine test suites are failing

```markdown
Failures:

- tests/unit/engines/reserve-engine.test.ts (4 failures)
- tests/unit/engines/pacing-engine.test.ts (6 failures)
- tests/unit/engines/cohort-engine.test.ts (3 failures)

Analysis: ✓ Independent engines (reserves, pacing, cohorts) ✓ Different
calculation logic ✓ No shared state → Dispatch 3 parallel agents
```

**Agent 1: Reserve Engine**

```markdown
Task: Fix reserve-engine.test.ts failures

Scope: Only ReserveEngine tests and implementation

Context:

- 4 tests failing after graduation rate refactor
- Error: "Expected totalReserves 1000000, got 950000"
- Likely issue: Graduation rate calculation changed

Constraints:

- Only modify client/src/core/reserves/ReserveEngine.ts
- Maintain existing API (no breaking changes)
```

**Agent 2: Pacing Engine**

```markdown
Task: Fix pacing-engine.test.ts failures

Scope: Only PacingEngine tests and implementation

Context:

- 6 tests failing after timeline refactor
- Error: "Expected deployment in Q2, got Q3"
- Likely issue: Quarter calculation logic changed

Constraints:

- Only modify client/src/core/pacing/PacingEngine.ts
- Maintain existing API
```

**Agent 3: Cohort Engine**

```markdown
Task: Fix cohort-engine.test.ts failures

Scope: Only CohortEngine tests and implementation

Context:

- 3 tests failing after vintage year changes
- Error: "Expected 2020 cohort, undefined"
- Likely issue: Vintage year grouping logic

Constraints:

- Only modify client/src/core/cohorts/CohortEngine.ts
- Maintain existing API
```

**Integration**: After all agents complete, verify engines work together in
integration tests

## Coordination Strategies

### Strategy 1: File-Based Partitioning

Assign non-overlapping files to each agent:

- Agent A: `client/src/components/allocation/*`
- Agent B: `client/src/components/portfolio/*`
- Agent C: `client/src/components/forecasting/*`

### Strategy 2: Layer-Based Partitioning

Assign different layers:

- Agent A: Frontend component tests
- Agent B: API route tests
- Agent C: Database integration tests

### Strategy 3: Feature-Based Partitioning

Assign independent features:

- Agent A: Waterfall calculations
- Agent B: Monte Carlo simulation
- Agent C: Report generation

## Conflict Resolution

### If Agents Modify Same Files

1. **Review both changes** - Understand what each agent did
2. **Identify conflicts** - Line-level conflicts or logical conflicts?
3. **Merge manually** - Combine fixes if compatible
4. **Re-run tests** - Verify merged version works
5. **Dispatch follow-up agent** if needed - "Merge fixes from agents A and B"

### If Agents Make Contradictory Changes

1. **Analyze root cause** - Why did agents diverge?
2. **Determine correct approach** - Which fix is right?
3. **Test both approaches** - Benchmark or validate
4. **Make decision** - Pick one or synthesize new solution

## Quality Checks

Before dispatching:

- [ ] Failures are truly independent?
- [ ] No shared state between tasks?
- [ ] Each agent has complete context?
- [ ] Output requirements are clear?
- [ ] Constraints prevent conflicts?

After agents return:

- [ ] All agents completed successfully?
- [ ] No file conflicts between changes?
- [ ] Full test suite passes?
- [ ] Changes are compatible?
- [ ] Ready to commit?

## Integration with Other Skills

### With Systematic Debugging

- Use systematic-debugging FIRST to determine if failures are independent
- If independent → Use dispatching-parallel-agents
- If related → Use systematic-debugging on primary failure

### With Root Cause Tracing

- Each agent uses root-cause-tracing within their domain
- Main coordinator synthesizes root causes across domains

### With Continuous Improvement

After parallel dispatch session:

```markdown
What worked well?

- Parallel investigation saved 2 hours
- File-based partitioning prevented conflicts

What was inefficient?

- Agent A needed more context (incomplete prompt)
- Should have checked for shared dependencies first

Next time:

- Add dependency check before dispatching
- Include more error context in prompts
- Use extended-thinking-framework for complex prompts
```

## Example: Complete Parallel Dispatch Session

````markdown
## Session: Fix Monte Carlo Test Suite

**Initial State**: 15 test failures across 3 files after refactoring

**Step 1: Identify Domains**

- monte-carlo-simulation.test.ts (6 failures) - Core simulation logic
- monte-carlo-caching.test.ts (5 failures) - Caching layer
- monte-carlo-workers.test.ts (4 failures) - BullMQ worker integration

Analysis: Independent subsystems ✓

**Step 2: Create Agent Tasks** [See detailed prompts above]

**Step 3: Dispatch (single message)**

```typescript
Task('Fix monte-carlo-simulation.test.ts...');
Task('Fix monte-carlo-caching.test.ts...');
Task('Fix monte-carlo-workers.test.ts...');
```
````

**Step 4: Agent Returns**

Agent A (Simulation):

- Root cause: Waterfall calculation in loop (performance issue)
- Fixed: Hoisted calculation outside loop
- Changed: server/workers/monte-carlo.ts:89-123
- Tests: All 6 now pass ✓

Agent B (Caching):

- Root cause: Cache key generation changed
- Fixed: Updated cache key format
- Changed: server/cache/monte-carlo-cache.ts:45-67
- Tests: All 5 now pass ✓

Agent C (Workers):

- Root cause: Job timeout too short for new calculation
- Fixed: Increased timeout from 30s to 60s
- Changed: server/workers/monte-carlo-worker.ts:12
- Tests: All 4 now pass ✓

**Step 5: Integration**

- No file conflicts ✓
- Changes are compatible ✓
- Run full test suite: All pass ✓
- Commit all changes together

**Result**: 15 failures fixed in parallel, 2 hours → 30 minutes

```

```
