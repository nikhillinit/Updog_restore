#!/usr/bin/env tsx
import { BaseAgent } from '../src';

/**
 * Example agent that demonstrates the BaseAgent framework
 */
class ExampleAgent extends BaseAgent<{ text: string; shouldFail?: boolean }, string> {
  constructor() {
    super({
      name: 'example-agent',
      maxRetries: 3,
      retryDelay: 1000,
      logLevel: 'info',
    });
  }

  protected async performOperation(
    input: { text: string; shouldFail?: boolean }
  ): Promise<string> {
    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, 100));

    if (input.shouldFail) {
      throw new Error('Simulated failure for demonstration');
    }

    return `Processed: ${input.text.toUpperCase()}`;
  }

  protected getExecutionMetadata(input: { text: string; shouldFail?: boolean }) {
    return {
      textLength: input.text.length,
      shouldFail: input.shouldFail || false,
    };
  }
}

async function runExample() {
  const agent = new ExampleAgent();

  console.log('=== Agent Status ===');
  console.log(JSON.stringify(agent.getStatus(), null, 2));

  console.log('\n=== Successful Execution ===');
  const successResult = await agent.execute({
    text: 'hello world',
  });
  console.log('Result:', JSON.stringify(successResult, null, 2));

  console.log('\n=== Failed Execution (with retries) ===');
  const failResult = await agent.execute({
    text: 'this will fail',
    shouldFail: true,
  });
  console.log('Result:', JSON.stringify(failResult, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runExample().catch(console.error);
}

export { ExampleAgent };