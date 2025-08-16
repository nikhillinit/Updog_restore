/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { describe, test, expect } from 'vitest';
import { toFundCreationPayload } from '../toEngineGraduationRates';

describe('finalizePayload', () => {
  test('clamps & rounds values', () => {
    const input = {
      basics: { name: 'Test Fund', size: 1000000, modelVersion: 'reserves-ev1' },
      strategy: { 
        stages: [
          { name: 'Seed', graduate: 101.3, exit: -3, months: 0.2 },
          { name: 'Series A', graduate: 50, exit: 25, months: 18 }
        ] 
      }
    } as any;

    const result = toFundCreationPayload(input);
    
    // Test clamping
    const s0 = result.strategy.stages[0];
    expect(s0.graduate).toBe(100); // clamped from 101.3
    expect(s0.exit).toBe(0);       // clamped from -3
    expect(s0.months).toBe(1);     // rounded from 0.2
    
    // Test normal values pass through
    const s1 = result.strategy.stages[1];
    expect(s1.graduate).toBe(50);
    expect(s1.exit).toBe(25);
    expect(s1.months).toBe(18);
  });

  test('preserves fund basics', () => {
    const input = {
      basics: { name: 'Growth Fund', size: 25000000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [] }
    } as any;

    const result = toFundCreationPayload(input);
    
    expect(result.basics.name).toBe('Growth Fund');
    expect(result.basics.size).toBe(25000000);
    expect(result.basics.modelVersion).toBe('reserves-ev1');
  });
});
