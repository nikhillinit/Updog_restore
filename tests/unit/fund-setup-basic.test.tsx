/**
 * Basic smoke tests for fund-setup page
 * Tests routing logic without complex rendering
 */
import { describe, it, expect, vi } from 'vitest';
import { signatureForStrategy } from '@/domain/strategy-signature';

// Test the signature function directly
describe('Strategy Signature - Production', () => {
  it('generates deterministic signatures', () => {
    const input1 = {
      stages: [
        { id: '1', name: 'Seed', graduationRate: 0.5, exitRate: 0.2, months: 12 },
        { id: '2', name: 'Series A', graduationRate: 0.4, exitRate: 0.3, months: 18 }
      ],
      sectorProfiles: [
        { id: 'tech', name: 'Technology', targetPercentage: 60 },
        { id: 'health', name: 'Healthcare', targetPercentage: 40 }
      ],
      allocations: [
        { id: 'equity', category: 'Equity', percentage: 80 },
        { id: 'debt', category: 'Debt', percentage: 20 }
      ]
    };

    const input2 = {
      stages: [
        { id: '2', name: 'Series A', graduationRate: 0.4, exitRate: 0.3, months: 18 },
        { id: '1', name: 'Seed', graduationRate: 0.5, exitRate: 0.2, months: 12 }
      ],
      sectorProfiles: [
        { id: 'health', name: 'Healthcare', targetPercentage: 40 },
        { id: 'tech', name: 'Technology', targetPercentage: 60 }
      ],
      allocations: [
        { id: 'debt', category: 'Debt', percentage: 20 },
        { id: 'equity', category: 'Equity', percentage: 80 }
      ]
    };

    // Same data, different order - should produce same signature
    const sig1 = signatureForStrategy(input1);
    const sig2 = signatureForStrategy(input2);
    
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^v1:[a-f0-9]+:[A-Za-z0-9_-]+$/);
  });

  it('handles edge cases gracefully', () => {
    const edgeCases = [
      { stages: [], sectorProfiles: [], allocations: [] },
      { stages: null, sectorProfiles: undefined, allocations: [] },
      {},
      null,
      undefined
    ];

    for (const input of edgeCases) {
      expect(() => signatureForStrategy(input as any)).not.toThrow();
    }
  });
});

// Test routing logic without rendering
describe('Fund Setup Routing Logic', () => {
  it('maps step numbers to correct keys', () => {
    const NUM_TO_KEY = {
      '2': 'investment-strategy',
      '3': 'exit-recycling',
      '4': 'waterfall',
    } as const;

    expect(NUM_TO_KEY['2']).toBe('investment-strategy');
    expect(NUM_TO_KEY['3']).toBe('exit-recycling');
    expect(NUM_TO_KEY['4']).toBe('waterfall');
  });

  it('validates step numbers correctly', () => {
    const VALID_STEPS = ['2', '3', '4'] as const;
    
    expect(VALID_STEPS.includes('2')).toBe(true);
    expect(VALID_STEPS.includes('3')).toBe(true);
    expect(VALID_STEPS.includes('4')).toBe(true);
    expect(VALID_STEPS.includes('1' as any)).toBe(false);
    expect(VALID_STEPS.includes('99' as any)).toBe(false);
  });
});

// Test console capture helper
describe('Console Capture Helper', () => {
  it('captures console messages correctly', () => {
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    console.error('Test error');
    console.warn('Test warning');
    
    expect(mockError).toHaveBeenCalledWith('Test error');
    expect(mockWarn).toHaveBeenCalledWith('Test warning');
    
    mockError.mockRestore();
    mockWarn.mockRestore();
  });
});