/**
 * MOIC Oracle Truth Cases
 *
 * Data-driven tests backed by hand-arithmetic derivations.
 * Each case in docs/moic.truth-cases.json has an explicit derivation field.
 *
 * @see docs/moic.truth-cases.json
 */

import { describe, it, expect } from 'vitest';
import { MOICCalculator, type Investment } from '@shared/core/moic/MOICCalculator';
import truthCases from '../../../docs/moic.truth-cases.json';

interface MOICTruthCase {
  id: string;
  variant: string;
  description: string;
  input: {
    initialInvestment?: number;
    followOnInvestment?: number;
    currentValuation?: number;
    projectedExitValue?: number;
    exitProbability?: number;
    plannedReserves?: number;
    reserveExitMultiple?: number;
    portfolio?: Array<{
      initialInvestment: number;
      followOnInvestment: number;
      currentValuation: number;
    }>;
  };
  expected: Record<string, number | null>;
  derivation: string;
  alternativeReturnRate?: number;
}

function makeInvestment(input: MOICTruthCase['input'], id: string): Investment {
  return {
    id,
    name: `Test ${id}`,
    initialInvestment: input.initialInvestment ?? 0,
    followOnInvestment: input.followOnInvestment ?? 0,
    currentValuation: input.currentValuation ?? 0,
    projectedExitValue: input.projectedExitValue ?? 0,
    exitProbability: input.exitProbability ?? 1.0,
    plannedReserves: input.plannedReserves ?? 0,
    reserveExitMultiple: input.reserveExitMultiple ?? 0,
    investmentDate: new Date('2024-01-01'),
  };
}

describe('MOIC Oracle Truth Cases', () => {
  const cases = truthCases as MOICTruthCase[];

  for (const tc of cases) {
    describe(`${tc.id}: ${tc.description}`, () => {
      if (tc.variant === 'current' && tc.expected.currentMOIC !== undefined) {
        it(`currentMOIC = ${tc.expected.currentMOIC}`, () => {
          const inv = makeInvestment(tc.input, tc.id);
          const result = MOICCalculator.calculateCurrentMOIC(inv);
          if (tc.expected.currentMOIC === null) {
            expect(result.value).toBeNull();
          } else {
            expect(result.value).toBeCloseTo(tc.expected.currentMOIC, 4);
          }
        });
      }

      if (tc.variant === 'exit') {
        if (tc.expected.exitMOIC !== undefined) {
          it(`exitMOIC (unweighted) = ${tc.expected.exitMOIC}`, () => {
            const inv = makeInvestment(tc.input, tc.id);
            const result = MOICCalculator.calculateExitMOIC(inv, false);
            expect(result.value).toBeCloseTo(tc.expected.exitMOIC as number, 4);
          });
        }
        if (tc.expected.exitMOICWeighted !== undefined) {
          it(`exitMOIC (weighted) = ${tc.expected.exitMOICWeighted}`, () => {
            const inv = makeInvestment(tc.input, tc.id);
            const result = MOICCalculator.calculateExitMOIC(inv, true);
            expect(result.value).toBeCloseTo(tc.expected.exitMOICWeighted as number, 4);
          });
        }
      }

      if (tc.variant === 'initial' && tc.expected.initialMOIC !== undefined) {
        it(`initialMOIC = ${tc.expected.initialMOIC}`, () => {
          const inv = makeInvestment(tc.input, tc.id);
          const result = MOICCalculator.calculateInitialMOIC(inv);
          expect(result.value).toBeCloseTo(tc.expected.initialMOIC as number, 4);
        });
      }

      if (tc.variant === 'followOn' && tc.expected.followOnMOIC !== undefined) {
        it(`followOnMOIC = ${tc.expected.followOnMOIC}`, () => {
          const inv = makeInvestment(tc.input, tc.id);
          const result = MOICCalculator.calculateFollowOnMOIC(inv);
          if (tc.expected.followOnMOIC === null) {
            expect(result.value).toBeNull();
          } else {
            expect(result.value).toBeCloseTo(tc.expected.followOnMOIC, 4);
          }
        });
      }

      if (tc.variant === 'reserves') {
        if (tc.expected.reservesMOIC !== undefined) {
          it(`reservesMOIC (weighted) = ${tc.expected.reservesMOIC}`, () => {
            const inv = makeInvestment(tc.input, tc.id);
            const result = MOICCalculator.calculateReservesMOIC(inv, true);
            expect(result.value).toBeCloseTo(tc.expected.reservesMOIC as number, 4);
          });
        }
        if (tc.expected.reservesMOICUnweighted !== undefined) {
          it(`reservesMOIC (unweighted) = ${tc.expected.reservesMOICUnweighted}`, () => {
            const inv = makeInvestment(tc.input, tc.id);
            const result = MOICCalculator.calculateReservesMOIC(inv, false);
            expect(result.value).toBeCloseTo(tc.expected.reservesMOICUnweighted as number, 4);
          });
        }
      }

      if (tc.variant === 'opportunityCost' && tc.expected.opportunityCostMOIC !== undefined) {
        it(`opportunityCostMOIC = ${tc.expected.opportunityCostMOIC}`, () => {
          const inv = makeInvestment(tc.input, tc.id);
          const result = MOICCalculator.calculateOpportunityCostMOIC(inv, tc.alternativeReturnRate);
          expect(result.value).toBeCloseTo(tc.expected.opportunityCostMOIC as number, 4);
        });
      }

      if (tc.variant === 'blended' && tc.expected.blendedMOIC !== undefined && tc.input.portfolio) {
        it(`blendedMOIC = ${tc.expected.blendedMOIC}`, () => {
          const investments = tc.input.portfolio!.map((p, i) =>
            makeInvestment(
              {
                initialInvestment: p.initialInvestment,
                followOnInvestment: p.followOnInvestment,
                currentValuation: p.currentValuation,
                projectedExitValue: 0,
                exitProbability: 1.0,
                plannedReserves: 0,
                reserveExitMultiple: 0,
              },
              `${tc.id}-${i}`
            )
          );
          const result = MOICCalculator.calculateBlendedMOIC(investments);
          expect(result.value).toBeCloseTo(tc.expected.blendedMOIC as number, 4);
        });
      }
    });
  }
});
