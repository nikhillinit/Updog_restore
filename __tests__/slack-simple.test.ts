import { vi, describe, it, expect } from 'vitest';

// Simple test to verify test environment works
describe('Simple Slack Test', () => {
  it('should run basic test', () => {
    expect(true).toBe(true);
    console.log('✅ Test environment working');
  });

  it('should mock functions', () => {
    const mockFn = vi.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
    console.log('✅ Vitest mocking working');
  });
});
