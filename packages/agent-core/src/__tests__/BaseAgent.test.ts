import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent } from '../BaseAgent';

class TestAgent extends BaseAgent<string, string> {
  public shouldFail = false;
  public callCount = 0;

  protected async performOperation(input: string): Promise<string> {
    this.callCount++;
    
    if (this.shouldFail) {
      throw new Error('Test operation failed');
    }
    
    return `processed-${input}`;
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;

  beforeEach(() => {
    vi.useFakeTimers();
    agent = new TestAgent({
      name: 'test-agent',
      maxRetries: 2,
      retryDelay: 10, // Fast retries for testing
    });
    agent.callCount = 0;
    agent.shouldFail = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute successfully on first attempt', async () => {
    const result = await agent.execute('test-input');

    expect(result.success).toBe(true);
    expect(result.data).toBe('processed-test-input');
    expect(result.retries).toBe(0);
    expect(result.error).toBeUndefined();
    expect(agent.callCount).toBe(1);
  });

  it('should retry on failure and succeed', async () => {
    agent.shouldFail = true;
    const executePromise = agent.execute('test-input');

    // First attempt fails, advance timer for first retry
    await vi.advanceTimersByTimeAsync(10);

    // Second attempt will now succeed
    // eslint-disable-next-line require-atomic-updates
    agent.shouldFail = false;
    await vi.runAllTimersAsync();

    const result = await executePromise;

    expect(result.success).toBe(true);
    expect(result.data).toBe('processed-test-input');
    expect(result.retries).toBe(2);
    expect(agent.callCount).toBe(3); // Initial call + 2 retries
  });

  it('should fail after max retries', async () => {
    agent.shouldFail = true;

    const executePromise = agent.execute('test-input');
    await vi.runAllTimersAsync(); // Let all retries happen
    const result = await executePromise;

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toBe('Test operation failed');
    expect(result.retries).toBe(2); // maxRetries
    expect(agent.callCount).toBe(3); // initial + 2 retries
  });

  it('should include execution context', async () => {
    const result = await agent.execute('test-input', 'custom-operation');

    expect(result.context).toBeDefined();
    expect(result.context.agent).toBe('test-agent');
    expect(result.context.operation).toBe('custom-operation');
    expect(result.context.runId).toMatch(/^test-agent-\d+-\w+$/);
    expect(result.context.timestamp).toBeDefined();
  });

  it('should track execution duration', async () => {
    const result = await agent.execute('test-input');

    expect(result.duration).toBeGreaterThan(0);
    expect(typeof result.duration).toBe('number');
  });

  it('should return agent status', () => {
    const status = agent.getStatus();

    expect(status.name).toBe('test-agent');
    expect(status.config.name).toBe('test-agent');
    expect(status.config.maxRetries).toBe(2);
    expect(status.uptime).toBeGreaterThan(0);
  });

  it('should use default configuration values', () => {
    const defaultAgent = new TestAgent({ name: 'default-test' });
    const status = defaultAgent.getStatus();

    expect(status.config.maxRetries).toBe(3);
    expect(status.config.retryDelay).toBe(1000);
    expect(status.config.timeout).toBe(30000);
    expect(status.config.logLevel).toBe('info');
  });
});
