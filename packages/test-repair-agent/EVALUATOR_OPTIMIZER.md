# Evaluator-Optimizer Pattern Implementation

This implementation follows the **Evaluator-Optimizer pattern** from the [Claude Cookbooks](https://github.com/anthropics/claude-cookbooks/tree/main/patterns/agents).

## Pattern Overview

The Evaluator-Optimizer pattern creates a feedback loop where:

1. **Generator** creates an initial solution
2. **Evaluator** critiques the solution against clear criteria
3. **Optimizer** improves the solution based on feedback
4. Loop continues until **PASS** or max iterations reached

## Architecture

```
Test Failure
     ↓
┌────────────────────────────────────┐
│  Evaluator-Optimizer Loop          │
│  (MAX 3 iterations)                │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ 1. Generate/Optimize Repair  │ │
│  └──────────────────────────────┘ │
│             ↓                      │
│  ┌──────────────────────────────┐ │
│  │ 2. Evaluate Against Criteria │ │
│  │    • Test Passes             │ │
│  │    • No Regressions          │ │
│  │    • Follows Conventions     │ │
│  └──────────────────────────────┘ │
│             ↓                      │
│        PASS? ──Yes──→ ✅ Done     │
│             ↓ No                   │
│  ┌──────────────────────────────┐ │
│  │ 3. Build Feedback Context    │ │
│  │    • Previous attempts       │ │
│  │    • Failed criteria         │ │
│  │    • Specific feedback       │ │
│  └──────────────────────────────┘ │
│             ↓                      │
│      (Loop back to step 1)         │
│                                    │
└────────────────────────────────────┘
```

## Implementation Details

### 1. Evaluation Criteria

Each repair is evaluated against three criteria:

```typescript
interface EvaluationResult {
  status: 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL';
  feedback: string;
  criteria: {
    testPasses: boolean;        // Addresses the actual error
    noRegressions: boolean;     // No unsafe patterns
    followsConventions: boolean; // Matches project standards
  };
}
```

**Evaluation Logic:**
- ✅ **PASS**: All 3 criteria met
- 🟡 **NEEDS_IMPROVEMENT**: Test passes but has issues
- ❌ **FAIL**: Doesn't address the error

### 2. Regression Detection

The evaluator checks for unsafe patterns:

```typescript
// Detected Anti-Patterns
- any type                    // TypeScript escape hatch
- @ts-ignore                  // Suppressing errors
- console.log                 // Debug statements left in
- TODO comments               // Incomplete work
- Extremely long timeouts     // Masking real issues
```

### 3. Convention Checks

The evaluator enforces coding standards:

```typescript
// Required Conventions
✓ Type annotations on variables/functions
✓ Proper error handling (try-catch)
✓ No magic numbers
✓ Meaningful variable names
```

### 4. Optimization Strategies

When `NEEDS_IMPROVEMENT` or `FAIL`, the optimizer:

**Failed Conventions** → Add type safety, error handling
**Has Regressions** → Remove unsafe patterns
**Doesn't Pass Test** → Try alternative strategy based on failure type

```typescript
// Example: Runtime Error Optimization
Attempt 1: "Add null/undefined checks"
Evaluation: NEEDS_IMPROVEMENT (missing conventions)
Attempt 2: "Add null checks with proper TypeScript types and null checks"
Evaluation: PASS ✅
```

### 5. Iteration Control

```typescript
MAX_OPTIMIZATION_ITERATIONS = 3

// Stop Conditions
1. Evaluation = PASS        → Success, return result
2. Evaluation = FAIL        → Unrecoverable, stop early
3. Iteration = 3            → Max attempts, return best attempt
```

## Usage Example

```typescript
import { TestRepairAgent } from '@povc/test-repair-agent';

const agent = new TestRepairAgent();

const result = await agent.execute({
  projectRoot: '/path/to/project',
  testPattern: '**/*.test.ts',
  maxRepairs: 10
});

// Result includes evaluation details
result.data.repairs.forEach(repair => {
  console.log(`File: ${repair.file}`);
  console.log(`Status: ${repair.evaluation.status}`);
  console.log(`Iterations: ${repair.iterations}`);
  console.log(`Feedback: ${repair.evaluation.feedback}`);
});
```

## Running the Demo

```bash
cd packages/test-repair-agent
npm run build
npx tsx demo-evaluator-optimizer.ts
```

## Benefits Over Single-Shot Repairs

| Aspect | Single-Shot | Evaluator-Optimizer |
|--------|-------------|---------------------|
| **Quality** | Variable, no validation | Validated against criteria |
| **Regressions** | May introduce unsafe code | Actively detects and prevents |
| **Conventions** | Inconsistent | Enforced through evaluation |
| **Learning** | No improvement loop | Iteratively refines |
| **Success Rate** | ~40-60% | ~70-85% (estimated) |

## Cookbook Reference

This implementation is based on:
- **Source**: [Claude Cookbooks - Evaluator-Optimizer](https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/evaluator_optimizer.ipynb)
- **Pattern Type**: Advanced agent workflow
- **Key Insight**: "Particularly effective when we have clear evaluation criteria and value from iterative refinement"

## Next Steps: Multi-AI Integration

The pattern can be enhanced with the Multi-AI MCP server:

```typescript
// Use different AIs for different roles
const repair = await mcp.ask_deepseek(generatePrompt);      // Generator
const evaluation = await mcp.gemini_code_review(repair);    // Evaluator
const optimized = await mcp.openai_think_deep(feedback);    // Optimizer
```

This creates a **debate-style** improvement loop with diverse perspectives.

## Related Patterns

- **Orchestrator-Workers**: Delegate subtasks to specialized agents
- **Routing**: Select the right AI model for each task type
- **Prompt Caching**: Cache evaluation criteria for faster iterations
