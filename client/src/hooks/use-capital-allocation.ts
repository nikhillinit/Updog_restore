/**
 * Capital Allocation Engine Hooks
 *
 * React hooks for capital allocation calculations via API.
 */

import { useMutation } from '@tanstack/react-query';
import type {
  CAEngineInput,
  CAEngineOutput,
  InvariantResult,
} from '@shared/core/capitalAllocation';

interface ValidationResult {
  valid: boolean;
  results: InvariantResult[];
}

interface ValidationInput {
  input: CAEngineInput;
  output: CAEngineOutput;
}

/**
 * Hook for calculating capital allocation
 */
export function useCapitalAllocation() {
  return useMutation<CAEngineOutput, Error, CAEngineInput>({
    mutationFn: async (input: CAEngineInput) => {
      const res = await fetch('/api/capital-allocation/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Capital allocation calculation failed');
      }

      return res.json();
    },
  });
}

/**
 * Hook for validating capital allocation output
 */
export function useCapitalAllocationValidation() {
  return useMutation<ValidationResult, Error, ValidationInput>({
    mutationFn: async ({ input, output }: ValidationInput) => {
      const res = await fetch('/api/capital-allocation/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, output }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Capital allocation validation failed');
      }

      return res.json();
    },
  });
}
