/**
 * Graduation Rate Engine Hooks
 *
 * React hooks for graduation projections via API.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  GraduationSummary,
  GraduationConfig,
  CohortProjection,
  Stage,
  TransitionProbabilities,
} from '@shared/core/graduation';

interface ProjectionInput {
  initialCompanies?: number;
  horizonQuarters?: number;
  config?: GraduationConfig;
  expectationMode?: boolean;
  seed?: number;
}

const VALID_STAGES: ReadonlySet<Stage> = new Set([
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'exit',
  'failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseJsonPayload(text: string): unknown {
  return text === '' ? null : (JSON.parse(text) as unknown);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload['message'] === 'string') {
    return payload['message'];
  }

  return fallback;
}

function parseTransitionProbabilities(value: unknown): TransitionProbabilities | null {
  if (!isRecord(value)) {
    return null;
  }

  const graduate = asNumber(value['graduate']);
  const fail = asNumber(value['fail']);
  const remain = asNumber(value['remain']);

  if (graduate === undefined || fail === undefined || remain === undefined) {
    return null;
  }

  return { graduate, fail, remain };
}

function parseStageDistribution(value: unknown): Record<Stage, number> | null {
  if (!isRecord(value)) {
    return null;
  }

  const distribution = {} as Record<Stage, number>;

  for (const stage of VALID_STAGES) {
    const count = asNumber(value[stage]);
    if (count === undefined) {
      return null;
    }
    distribution[stage] = count;
  }

  return distribution;
}

function parseQuarterlyProjection(payload: unknown): CohortProjection | null {
  if (!isRecord(payload)) {
    return null;
  }

  const quarter = asNumber(payload['quarter']);
  const expectedGraduates = asNumber(payload['expectedGraduates']);
  const expectedFailures = asNumber(payload['expectedFailures']);
  const stageDistribution = parseStageDistribution(payload['stageDistribution']);

  if (
    quarter === undefined ||
    expectedGraduates === undefined ||
    expectedFailures === undefined ||
    stageDistribution === null
  ) {
    return null;
  }

  return {
    quarter,
    expectedGraduates,
    expectedFailures,
    stageDistribution,
  };
}

function parseGraduationSummary(payload: unknown): GraduationSummary {
  if (!isRecord(payload) || !Array.isArray(payload['quarterlyProjections'])) {
    throw new Error('Invalid graduation projection response');
  }

  const mode = payload['mode'];
  const totalCompanies = asNumber(payload['totalCompanies']);
  const expectedGraduationRate = asNumber(payload['expectedGraduationRate']);
  const expectedFailureRate = asNumber(payload['expectedFailureRate']);
  const stageDistribution = parseStageDistribution(payload['stageDistribution']);

  if (
    (mode !== 'expectation' && mode !== 'stochastic') ||
    totalCompanies === undefined ||
    expectedGraduationRate === undefined ||
    expectedFailureRate === undefined ||
    stageDistribution === null
  ) {
    throw new Error('Invalid graduation projection response');
  }

  const quarterlyProjections = payload['quarterlyProjections'].map((projection) => {
    const parsed = parseQuarterlyProjection(projection);
    if (parsed === null) {
      throw new Error('Invalid graduation projection response');
    }
    return parsed;
  });

  return {
    mode,
    seed: asNumber(payload['seed']),
    totalCompanies,
    expectedGraduationRate,
    expectedFailureRate,
    stageDistribution,
    quarterlyProjections,
  };
}

function parseGraduationConfig(payload: unknown): GraduationConfig {
  if (!isRecord(payload) || !isRecord(payload['transitions'])) {
    throw new Error('Invalid graduation defaults response');
  }

  const transitions = payload['transitions'];
  const seedToA = parseTransitionProbabilities(transitions['seedToA']);
  const aToB = parseTransitionProbabilities(transitions['aToB']);
  const bToC = parseTransitionProbabilities(transitions['bToC']);
  const cToExit = parseTransitionProbabilities(transitions['cToExit']);

  if (
    typeof payload['expectationMode'] !== 'boolean' ||
    seedToA === null ||
    aToB === null ||
    bToC === null ||
    cToExit === null
  ) {
    throw new Error('Invalid graduation defaults response');
  }

  return {
    expectationMode: payload['expectationMode'],
    seed: asNumber(payload['seed']),
    transitions: {
      seedToA,
      aToB,
      bToC,
      cToExit,
    },
  };
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
        const errorPayload = parseJsonPayload(await res.text());
        throw new Error(readErrorMessage(errorPayload, 'Graduation projection failed'));
      }

      return parseGraduationSummary(parseJsonPayload(await res.text()));
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

      return parseGraduationConfig(parseJsonPayload(await res.text()));
    },
  });
}
