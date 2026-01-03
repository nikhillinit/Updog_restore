/**
 * Evaluator-Optimizer Workflow Example
 *
 * This example demonstrates how to use the EvaluatorOptimizer pattern
 * to iteratively improve code generation with LLM-based evaluation.
 */

import {
  EvaluatorOptimizer,
  createGenerator,
  createEvaluator,
  type GeneratorFunction,
  type EvaluatorFunction,
} from '../src/EvaluatorOptimizer';

/**
 * Mock LLM call function
 * In production, replace this with actual LLM API calls (OpenAI, Anthropic, etc.)
 */
async function mockLlmCall(prompt: string): Promise<string> {
  // This would be replaced with actual LLM API call
  console.log('LLM Prompt:', `${prompt.substring(0, 200)  }...\n`);

  // Simulate different responses based on iteration
  if (prompt.includes('Previous attempts')) {
    // Improved response
    return `
<thoughts>
Based on the feedback, I'll add proper error handling and input validation.
The function should handle edge cases like empty arrays and null values.
</thoughts>
<response>
\`\`\`typescript
function findMax(arr: number[]): number {
  if (!arr || arr.length === 0) {
    throw new Error('Array cannot be empty');
  }

  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
    }
  }

  return max;
}
\`\`\`
</response>
    `;
  } else if (prompt.includes('evaluate')) {
    // Evaluation response
    if (prompt.includes('throw new Error')) {
      return `
<evaluation>PASS</evaluation>
<feedback>
Excellent! The implementation now includes:
1. Proper input validation for null/undefined and empty arrays
2. Clear error messages
3. Efficient O(n) iteration
4. Handles all edge cases correctly
</feedback>
      `;
    } else {
      return `
<evaluation>NEEDS_IMPROVEMENT</evaluation>
<feedback>
The basic logic is correct, but the implementation is missing:
1. Input validation - what if the array is empty or null?
2. Error handling - the function should throw meaningful errors
3. Edge case handling - consider boundary conditions
</feedback>
      `;
    }
  } else {
    // Initial response
    return `
<thoughts>
I'll implement a simple function to find the maximum value in an array.
Using a basic loop to iterate through all elements.
</thoughts>
<response>
\`\`\`typescript
function findMax(arr: number[]): number {
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
    }
  }
  return max;
}
\`\`\`
</response>
    `;
  }
}

/**
 * Example 1: Basic usage with helper functions
 */
async function basicExample(): Promise<void> {
  console.log('\n=== EXAMPLE 1: Basic Usage ===\n');

  const workflow: EvaluatorOptimizer<string> = new EvaluatorOptimizer<string>({
    maxIterations: 5,
    verbose: true,
  });

  // Create generator and evaluator using helpers
  const generatorPrompt = `
You are a code generator. Generate TypeScript code based on the task.
Output your response in the following format:

<thoughts>
Your reasoning about how to solve the task
</thoughts>
<response>
Your code implementation
</response>
  `;

  const evaluatorPrompt = `
You are a code reviewer. Evaluate the code for:
1. Correctness
2. Error handling
3. Edge cases
4. Best practices

Output your evaluation in the following format:

<evaluation>PASS, NEEDS_IMPROVEMENT, or FAIL</evaluation>
<feedback>
Detailed feedback on what needs improvement
</feedback>
  `;

  const generator: GeneratorFunction<string> = createGenerator<string>(generatorPrompt, mockLlmCall);
  const evaluator: EvaluatorFunction<string> = createEvaluator<string>(evaluatorPrompt, mockLlmCall);

  const task = 'Implement a function that finds the maximum value in an array of numbers';

  const result = await workflow.run(task, generator, evaluator);

  console.log('\n=== RESULT ===');
  console.log('Success:', result.success);
  console.log('Iterations:', result.iterations);
  console.log('Duration:', result.duration, 'ms');
  console.log('\nFinal Solution:\n', result.finalSolution);
  console.log('\nFinal Thoughts:\n', result.finalThoughts);
}

/**
 * Example 2: Custom generator and evaluator functions
 */
async function customFunctionsExample(): Promise<void> {
  console.log('\n\n=== EXAMPLE 2: Custom Functions ===\n');

  const workflow: EvaluatorOptimizer<string> = new EvaluatorOptimizer<string>({
    maxIterations: 3,
    verbose: false,
  });

  // Custom generator with specific logic
  const customGenerator: GeneratorFunction<string> = async (task, context?) => {
    const prompt = context ? `${task}\n\n${context}` : task;
    const response = await mockLlmCall(prompt);

    // Custom parsing logic
    const thoughtsMatch = response.match(/<thoughts>([\s\S]*?)<\/thoughts>/i);
    const resultMatch = response.match(/<response>([\s\S]*?)<\/response>/i);

    return {
      thoughts: thoughtsMatch ? thoughtsMatch[1].trim() : 'No thoughts provided',
      result: resultMatch ? resultMatch[1].trim() : response,
    };
  };

  // Custom evaluator with specific criteria
  const customEvaluator: EvaluatorFunction<string> = async (content, _task) => {
    const prompt = `Evaluate this code:\n${content}\n\nFor task: ${_task}`;
    const response = await mockLlmCall(prompt);

    const statusMatch = response.match(/<evaluation>(.*?)<\/evaluation>/i);
    const feedbackMatch = response.match(/<feedback>([\s\S]*?)<\/feedback>/i);

    const status = statusMatch ? statusMatch[1].trim().toUpperCase() : 'NEEDS_IMPROVEMENT';
    const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'No feedback provided';

    // Validate status
    const validStatus = ['PASS', 'NEEDS_IMPROVEMENT', 'FAIL'].includes(status)
      ? (status as 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL')
      : 'NEEDS_IMPROVEMENT';

    return { status: validStatus, feedback };
  };

  const task = 'Create a function to calculate factorial';
  const result = await workflow.run(task, customGenerator, customEvaluator);

  console.log('\nResult:', {
    success: result.success,
    iterations: result.iterations,
    stepsCount: result.steps.length,
  });
}

/**
 * Example 3: Typed content (not just strings)
 */
interface CodeArtifact {
  code: string;
  tests: string;
  documentation: string;
}

async function typedContentExample(): Promise<void> {
  console.log('\n\n=== EXAMPLE 3: Typed Content ===\n');

  const workflow: EvaluatorOptimizer<CodeArtifact> = new EvaluatorOptimizer<CodeArtifact>({
    maxIterations: 3,
    verbose: false,
  });

  const generator: GeneratorFunction<CodeArtifact> = async (
    _task,
    _context?
  ) => {
    return {
      thoughts: 'Creating code with tests and docs',
      result: {
        code: 'function add(a, b) { return a + b; }',
        tests: 'test("add", () => { expect(add(1, 2)).toBe(3); });',
        documentation: '# Add Function\nAdds two numbers.',
      },
    };
  };

  const evaluator: EvaluatorFunction<CodeArtifact> = async (
    content,
    _task
  ) => {
    // Check if all required parts are present
    const hasCode = content.code.length > 0;
    const hasTests = content.tests.length > 0;
    const hasDocs = content.documentation.length > 0;

    if (hasCode && hasTests && hasDocs) {
      return {
        status: 'PASS',
        feedback: 'All components present',
      };
    }

    return {
      status: 'NEEDS_IMPROVEMENT',
      feedback: 'Missing required components',
    };
  };

  const result = await workflow.run('Create a complete code artifact', generator, evaluator);

  console.log('Success:', result.success);
  console.log('Final artifact:', result.finalSolution);
}

/**
 * Example 4: Analyzing the workflow steps
 */
async function analyzeStepsExample(): Promise<void> {
  console.log('\n\n=== EXAMPLE 4: Step Analysis ===\n');

  const workflow: EvaluatorOptimizer<string> = new EvaluatorOptimizer<string>({
    maxIterations: 5,
    verbose: false,
  });

  const generator: GeneratorFunction<string> = createGenerator<string>('Generate code', mockLlmCall);
  const evaluator: EvaluatorFunction<string> = createEvaluator<string>('Evaluate code', mockLlmCall);

  const task = 'Implement a binary search function';
  const result = await workflow.run(task, generator, evaluator);

  // Analyze each step
  console.log(`\nWorkflow completed in ${result.iterations} iterations\n`);

  result.steps.forEach((step, index) => {
    console.log(`\nStep ${index + 1}:`);
    const thoughts = String(step.generation.thoughts);
    const resultStr = String(step.generation.result);
    console.log(`  Thoughts: ${thoughts.substring(0, 50)}...`);
    console.log(`  Result length: ${resultStr.length} chars`);
    if (step.evaluation) {
      const feedback = String(step.evaluation.feedback);
      console.log(`  Evaluation: ${step.evaluation.status}`);
      console.log(`  Feedback: ${feedback.substring(0, 50)}...`);
    }
  });

  console.log(`\nTotal duration: ${result.duration}ms`);
}

/**
 * Run all examples
 */
async function main() {
  try {
    await basicExample();
    await customFunctionsExample();
    await typedContentExample();
    await analyzeStepsExample();
  } catch (error: unknown) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
