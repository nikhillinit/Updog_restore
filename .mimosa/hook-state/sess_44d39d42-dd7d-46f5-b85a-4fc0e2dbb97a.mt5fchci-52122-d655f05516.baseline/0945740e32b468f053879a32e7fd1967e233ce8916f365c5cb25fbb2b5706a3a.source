import { runFundModel } from '@shared/lib/fund-calc';
import type { FundModelInputs } from '@shared/schemas/fund-model';
import type { SensitivityMetricDefinition } from '@shared/contracts/sensitivity-variables-v1';

type SensitivityErrorFactory = (code: string, message: string) => Error;

export function extractNumericMetricByPath(
  obj: Record<string, unknown>,
  path: string,
  createError: SensitivityErrorFactory
): number {
  const segments = path.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }

    throw createError('METRIC_PATH_NOT_FOUND', `Could not extract metric at path ${path}`);
  }

  if (typeof current !== 'number') {
    throw createError(
      'METRIC_NOT_NUMBER',
      `Metric at path ${path} is not a number: ${typeof current}`
    );
  }

  return current;
}

export function computeSensitivityMetric(
  config: FundModelInputs,
  metricDef: SensitivityMetricDefinition,
  createError: SensitivityErrorFactory
): number {
  const outputs = runFundModel(config);
  return extractNumericMetricByPath(
    outputs as unknown as Record<string, unknown>,
    metricDef.fundMetricPath,
    createError
  );
}
