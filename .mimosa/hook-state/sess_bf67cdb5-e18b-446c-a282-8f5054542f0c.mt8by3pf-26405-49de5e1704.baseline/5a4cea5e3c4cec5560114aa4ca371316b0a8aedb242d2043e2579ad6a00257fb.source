import { describe, it, expect } from 'vitest';
import { signatureForStrategy } from '@/domain/strategy-signature';

describe('signatureForStrategy', () => {
  it('generates stable signatures for identical data', () => {
    const payload = {
      stages: [{ id: 'test-1', name: 'Test Stage', graduate: 50, exit: 30 }],
      sectorProfiles: [],
      allocations: []
    };

    const sig1 = signatureForStrategy(payload);
    const sig2 = signatureForStrategy(payload);
    
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^v1:[a-f0-9]+:[A-Za-z0-9_-]+$/);
  });

  it('generates different signatures for different data', () => {
    const payload1 = {
      stages: [{ id: 'test-1', name: 'Test Stage', graduate: 50, exit: 30 }],
      sectorProfiles: [],
      allocations: []
    };

    const payload2 = {
      stages: [{ id: 'test-1', name: 'Test Stage', graduate: 60, exit: 30 }],
      sectorProfiles: [],
      allocations: []
    };

    const sig1 = signatureForStrategy(payload1);
    const sig2 = signatureForStrategy(payload2);
    
    expect(sig1).not.toBe(sig2);
  });

  it('handles NaN values consistently', () => {
    const payload = {
      stages: [{ id: 'test-1', name: 'Test Stage', graduate: NaN, exit: 30 }],
      sectorProfiles: [],
      allocations: []
    };

    const sig1 = signatureForStrategy(payload);
    const sig2 = signatureForStrategy(payload);
    
    expect(sig1).toBe(sig2);
  });
});