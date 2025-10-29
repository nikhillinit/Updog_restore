# Evaluator-Optimizer Workflow

## Overview

The Evaluator-Optimizer is a powerful iterative refinement pattern where one LLM call generates a response and another evaluates it in a loop until requirements are met. This pattern is particularly effective for tasks that benefit from iterative improvement and clear evaluation criteria.

**Location:** `@povc/agent-core` (packages/agent-core/src/EvaluatorOptimizer.ts)

## When to Use This Workflow

### Good Fit ✅
- **Clear evaluation criteria** - You can define what "good" looks like
- **Iterative refinement** - Solutions can be demonstrably improved with feedback
- **LLM can self-evaluate** - The LLM can provide meaningful feedback on its own output
- Code generation with quality requirements
- Document writing with style guidelines
- Test case generation with coverage requirements
- Prompt engineering with performance metrics

### Not a Good Fit ❌
- Simple one-shot tasks
- Tasks without clear success criteria
- Real-time requirements (latency-sensitive)
- Tasks where feedback doesn't lead to improvement

## Core Concepts

### 1. Generator Function
Generates solutions based on task and context (previous attempts + feedback).

```typescript
type GeneratorFunction<T> = (
  task: string,
  context?: string
) => Promise<{
  thoughts: string;  // Reasoning about the solution
  result: T;         // The actual solution
}>;
```

### 2. Evaluator Function
Evaluates solutions against criteria and provides feedback.

```typescript
type EvaluatorFunction<T> = (
  content: T,
  task: string
) => Promise<{
  status: 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL';
  feedback: string;
}>;
```

### 3. Loop Result
Complete history of the iterative process.

```typescript
interface LoopResult<T> {
  success: boolean;
  finalSolution?: T;
  finalThoughts?: string;
  steps: LoopStep<T>[];
  iterations: number;
  duration: number;
  error?: string;
}
```

## Quick Start

### Basic Usage

```typescript
import {
  EvaluatorOptimizer,
  createGenerator,
  createEvaluator
} from '@povc/agent-core';

// 1. Configure the workflow
const workflow = new EvaluatorOptimizer({
  maxIterations: 5,
  verbose: true
});

// 2. Define prompts
const generatorPrompt = `
You are a code generator. Generate TypeScript code.
Output format:
<thoughts>Your reasoning</thoughts>
<response>Your code</response>
`;

const evaluatorPrompt = `
You are a code reviewer. Evaluate for correctness and best practices.
Output format:
<evaluation>PASS, NEEDS_IMPROVEMENT, or FAIL</evaluation>
<feedback>Detailed feedback</feedback>
`;

// 3. Create generator and evaluator
const generator = createGenerator(generatorPrompt, llmCallFunction);
const evaluator = createEvaluator(evaluatorPrompt, llmCallFunction);

// 4. Run the workflow
const result = await workflow.run(
  'Implement a binary search function',
  generator,
  evaluator
);

// 5. Use the result
if (result.success) {
  console.log('Final solution:', result.finalSolution);
  console.log('Iterations:', result.iterations);
}
```

## Advanced Usage

### Custom Generator Function

```typescript
const customGenerator: GeneratorFunction<CodeArtifact> = async (
  task: string,
  context?: string
) => {
  // Build prompt with custom logic
  const prompt = buildPrompt(task, context);

  // Call your LLM
  const response = await yourLlmApi.call(prompt);

  // Parse response
  return {
    thoughts: extractThoughts(response),
    result: parseCodeArtifact(response)
  };
};
```

### Custom Evaluator Function

```typescript
const customEvaluator: EvaluatorFunction<string> = async (
  content: string,
  task: string
) => {
  // Custom validation logic
  const hasTests = content.includes('test(');
  const hasTypes = content.includes(': ');
  const hasError = content.includes('throw');

  if (hasTests && hasTypes && hasError) {
    return {
      status: 'PASS',
      feedback: 'All requirements met'
    };
  }

  return {
    status: 'NEEDS_IMPROVEMENT',
    feedback: `Missing: ${!hasTests ? 'tests ' : ''}${!hasTypes ? 'types ' : ''}${!hasError ? 'error handling' : ''}`
  };
};
```

### Typed Content (Non-String Results)

```typescript
interface CodeArtifact {
  code: string;
  tests: string;
  documentation: string;
}

const workflow = new EvaluatorOptimizer<CodeArtifact>({
  maxIterations: 5
});

const generator = async (task: string, context?: string) => ({
  thoughts: 'Creating complete artifact...',
  result: {
    code: generatedCode,
    tests: generatedTests,
    documentation: generatedDocs
  }
});

const evaluator = async (artifact: CodeArtifact, task: string) => {
  // Evaluate each component
  const allPresent = artifact.code && artifact.tests && artifact.documentation;

  return {
    status: allPresent ? 'PASS' : 'NEEDS_IMPROVEMENT',
    feedback: allPresent ? 'Complete' : 'Missing components'
  };
};
```

## Helper Functions

### extractXml
Extract content from XML-like tags (useful for parsing LLM responses).

```typescript
import { extractXml } from '@povc/agent-core';

const response = `
<thoughts>My reasoning here</thoughts>
<response>Generated code here</response>
`;

const thoughts = extractXml(response, 'thoughts');
const code = extractXml(response, 'response');
```

### createGenerator
Create a generator function from a system prompt and LLM call.

```typescript
const generator = createGenerator(
  'You are a code generator...',
  llmCall,
  customParser  // Optional custom parser
);
```

### createEvaluator
Create an evaluator function from a system prompt and LLM call.

```typescript
const evaluator = createEvaluator(
  'You are a code reviewer...',
  llmCall,
  customParser  // Optional custom parser
);
```

## Configuration Options

```typescript
interface EvaluatorOptimizerConfig {
  maxIterations?: number;  // Default: 10
  verbose?: boolean;       // Default: true
  logger?: Logger;         // Default: new Logger(...)
}
```

## Response Format Guidelines

### Generator Response Format

```xml
<thoughts>
- Understanding of the task
- Approach and reasoning
- Any assumptions or considerations
</thoughts>

<response>
<!-- Your generated content here -->
</response>
```

### Evaluator Response Format

```xml
<evaluation>PASS | NEEDS_IMPROVEMENT | FAIL</evaluation>

<feedback>
Detailed, actionable feedback:
1. What's working well
2. What needs improvement
3. Specific suggestions
</feedback>
```

## Common Patterns

### Pattern 1: Code Generation with Quality Checks

```typescript
const codeGenWorkflow = new EvaluatorOptimizer({ maxIterations: 5 });

const codeGenerator = createGenerator(`
Generate TypeScript code that:
- Has proper types
- Includes error handling
- Has clear variable names
Format: <thoughts>...</thoughts><response>code</response>
`, llmCall);

const codeEvaluator = createEvaluator(`
Evaluate code for:
1. Type safety
2. Error handling
3. Code quality
4. Edge cases
Format: <evaluation>STATUS</evaluation><feedback>...</feedback>
`, llmCall);

const result = await codeGenWorkflow.run(
  'Create a function to parse JSON safely',
  codeGenerator,
  codeEvaluator
);
```

### Pattern 2: Document Refinement

```typescript
const docWorkflow = new EvaluatorOptimizer({ maxIterations: 3 });

const docGenerator = createGenerator(`
Write clear, concise documentation.
Include: overview, parameters, return value, examples
Format: <thoughts>...</thoughts><response>markdown</response>
`, llmCall);

const docEvaluator = createEvaluator(`
Evaluate documentation for:
1. Clarity
2. Completeness
3. Examples
4. Formatting
Format: <evaluation>STATUS</evaluation><feedback>...</feedback>
`, llmCall);
```

### Pattern 3: Test Generation

```typescript
const testWorkflow = new EvaluatorOptimizer({ maxIterations: 4 });

const testGenerator = createGenerator(`
Generate comprehensive tests covering:
- Happy path
- Edge cases
- Error conditions
Format: <thoughts>...</thoughts><response>tests</response>
`, llmCall);

const testEvaluator = createEvaluator(`
Evaluate test coverage:
1. All paths tested?
2. Edge cases covered?
3. Clear assertions?
4. Good test names?
Format: <evaluation>STATUS</evaluation><feedback>...</feedback>
`, llmCall);
```

## Analyzing Results

```typescript
const result = await workflow.run(task, generator, evaluator);

// Check success
if (result.success) {
  console.log('✅ Success!');
  console.log('Final solution:', result.finalSolution);
  console.log('Iterations:', result.iterations);
  console.log('Duration:', result.duration, 'ms');
} else {
  console.log('❌ Failed:', result.error);
}

// Analyze steps
result.steps.forEach((step, i) => {
  console.log(`\nIteration ${i + 1}:`);
  console.log('Thoughts:', step.generation.thoughts);
  console.log('Status:', step.evaluation?.status);
  console.log('Feedback:', step.evaluation?.feedback);
});

// Track improvement over iterations
const improvements = result.steps.map(step => ({
  iteration: step.iteration + 1,
  status: step.evaluation?.status,
  resultLength: step.generation.result.length
}));
```

## Integration with BaseAgent

```typescript
import { BaseAgent, EvaluatorOptimizer, createGenerator, createEvaluator } from '@povc/agent-core';

class CodeGenerationAgent extends BaseAgent<string, string> {
  private workflow: EvaluatorOptimizer;

  constructor(config: AgentConfig) {
    super(config);
    this.workflow = new EvaluatorOptimizer({
      maxIterations: 5,
      verbose: false,
      logger: this.logger
    });
  }

  protected async performOperation(
    input: string,
    context: AgentExecutionContext
  ): Promise<string> {
    const generator = createGenerator('...', this.callLlm.bind(this));
    const evaluator = createEvaluator('...', this.callLlm.bind(this));

    const result = await this.workflow.run(input, generator, evaluator);

    if (!result.success) {
      throw new Error(`Code generation failed: ${result.error}`);
    }

    return result.finalSolution!;
  }

  private async callLlm(prompt: string): Promise<string> {
    // Your LLM integration here
    return '';
  }
}
```

## Best Practices

1. **Clear Evaluation Criteria**: Define specific, measurable success criteria
2. **Actionable Feedback**: Evaluator should provide specific improvement suggestions
3. **Max Iterations**: Set reasonable limits to prevent infinite loops
4. **Context Management**: The workflow automatically builds context from previous attempts
5. **Error Handling**: Check `result.success` before using `result.finalSolution`
6. **Performance**: Consider maxIterations based on latency requirements
7. **Cost**: Each iteration = 2 LLM calls (generation + evaluation)

## Troubleshooting

### Loop Never Passes
- Check evaluation criteria (too strict?)
- Review feedback quality (actionable?)
- Increase maxIterations if improvements are happening
- Check if generator is actually using feedback

### Loop Passes Too Easily
- Make evaluation criteria more strict
- Add more specific requirements
- Use FAIL status for fundamental issues

### Slow Performance
- Reduce maxIterations
- Optimize LLM call latency
- Consider caching for common patterns
- Use smaller/faster models for evaluation

### Poor Quality Results
- Improve generator prompt clarity
- Make evaluation criteria more specific
- Provide examples in prompts
- Check if feedback is being incorporated

## Examples

See `packages/agent-core/examples/evaluator-optimizer-example.ts` for complete working examples:
- Basic usage
- Custom functions
- Typed content
- Step analysis

## Testing

```typescript
import { describe, it, expect, vi } from 'vitest';
import { EvaluatorOptimizer } from '@povc/agent-core';

describe('MyAgent with EvaluatorOptimizer', () => {
  it('should generate valid code', async () => {
    const workflow = new EvaluatorOptimizer({ maxIterations: 3 });

    const generator = vi.fn().mockResolvedValue({
      thoughts: 'Test',
      result: 'code'
    });

    const evaluator = vi.fn().mockResolvedValue({
      status: 'PASS',
      feedback: 'Good'
    });

    const result = await workflow.run('task', generator, evaluator);

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
  });
});
```

## Related

- [Agent Core Documentation](../packages/agent-core/README.md)
- [BaseAgent Pattern](./claude-code-best-practices.md)
- [Testing Patterns](./testing.md)
- [API Cheatsheet](./api.md)
