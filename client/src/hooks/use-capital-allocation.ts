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

function getErrorMessage(response: unknown, fallback: string): string {
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: unknown }).message;

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return fallback;
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
        const errorBody: unknown = await res.json().catch(() => ({}));
        throw new Error(
          getErrorMessage(errorBody, 'Capital allocation calculation failed')
        );
      }

      return (await res.json()) as CAEngineOutput;
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
        const errorBody: unknown = await res.json().catch(() => ({}));
        throw new Error(
          getErrorMessage(errorBody, 'Capital allocation validation failed')
        );
      }

      return (await res.json()) as ValidationResult;
    },
  });
}
