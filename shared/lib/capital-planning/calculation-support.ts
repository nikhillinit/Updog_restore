import type { z } from 'zod';
import {
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  type CapitalIssueV1,
} from '../../contracts/capital-planning-v1.contract';
import { Decimal } from '../decimal-config';
import { toFixedDecimalString } from '../decimal-string';

/** Pure calculation failures retain the same issues as source admission. */
export class CapitalPlanningCalculationError extends Error {
  constructor(public readonly issues: CapitalIssueV1[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'CapitalPlanningCalculationError';
  }
}

export function refuseCalculation(
  code: CapitalIssueV1['code'],
  path: string,
  message: string,
  support: CapitalIssueV1['support'] = 'invalid'
): never {
  throw new CapitalPlanningCalculationError([{ code, path, message, support }]);
}

export function assertCalculationSize(value: unknown, limit: number, path: string): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    refuseCalculation('INVALID_INPUT', path, 'Expected serializable calculation data');
  }
  if (serialized === undefined)
    refuseCalculation('INVALID_INPUT', path, 'Expected calculation data');
  const observed = new TextEncoder().encode(serialized).byteLength;
  if (observed > limit)
    throw new CapitalPlanningCalculationError([
      {
        code: 'INPUT_TOO_LARGE',
        path,
        message: 'Calculation exceeds provisional bounds',
        support: 'invalid',
        limit,
        observed,
      },
    ]);
}

export function parseCalculation<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new CapitalPlanningCalculationError(
    parsed.error.issues.slice(0, limits.maxSourceFacts).map((issue) => {
      const field = issue.path.reduce<string>(
        (result, part) => (typeof part === 'number' ? `${result}[${part}]` : `${result}.${part}`),
        path
      );
      const policy =
        issue.path.includes('checkPolicy') &&
        (issue.code === 'invalid_union_discriminator' || issue.code === 'unrecognized_keys');
      const code = policy
        ? 'POLICY_UNSUPPORTED'
        : issue.message === 'CHECK_EXCEEDS_ROUND_SIZE'
          ? 'CHECK_EXCEEDS_ROUND_SIZE'
          : issue.message === 'POOL_DILUTION_UNRESOLVED'
            ? 'POOL_DILUTION_UNRESOLVED'
            : issue.message.startsWith('Pro-rata')
              ? 'OWNERSHIP_INPUT_UNRESOLVED'
              : 'INVALID_INPUT';
      return {
        code,
        path: field,
        message: issue.message.slice(0, 2000),
        support: policy
          ? 'unsupported'
          : code === 'OWNERSHIP_INPUT_UNRESOLVED' || code === 'POOL_DILUTION_UNRESOLVED'
            ? 'incomplete'
            : 'invalid',
      };
    })
  );
}

export function fixed(value: Decimal, places: number): string {
  const result = toFixedDecimalString(value, places);
  if (result.length > limits.maxDecimalCharacters)
    throw new CapitalPlanningCalculationError([
      {
        code: 'INPUT_TOO_LARGE',
        path: 'result',
        message: 'Calculated decimal exceeds the provisional output bound',
        support: 'invalid',
        limit: limits.maxDecimalCharacters,
        observed: result.length,
      },
    ]);
  return new Decimal(result).isZero() ? new Decimal(0).toFixed(places) : result;
}

export const money = (value: Decimal): string => fixed(value, 6);
export const ratio = (value: Decimal): string => fixed(value, 12);
