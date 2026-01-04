/**
 * Graduation Rate Engine Hooks
 *
 * React hooks for graduation projections via API.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  GraduationSummary,
  GraduationConfig,
} from '@shared/core/graduation';

interface ProjectionInput {
  initialCompanies?: number;
  horizonQuarters?: number;
  config?: GraduationConfig;
  expectationMode?: boolean;
  seed?: number;
}

/**
 * Hook for projecting cohort through graduation stages
 */
export function useGraduationProjection() {
  return useMutation<GraduationSummary, Error, ProjectionInput>({
    mutationFn: async (input: ProjectionInput) => {
      const res = await fetch('/api/graduation/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Graduation projection failed');
      }

      return res.json();
    },
  });
}

/**
 * Hook for fetching default graduation configuration
 */
export function useGraduationDefaults() {
  return useQuery<GraduationConfig, Error>({
    queryKey: ['graduation', 'defaults'],
    queryFn: async () => {
      const res = await fetch('/api/graduation/defaults');

      if (!res.ok) {
        throw new Error('Failed to fetch graduation defaults');
      }

      return res.json();
    },
  });
}
