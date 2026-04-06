/**
 * Contract tests for SensitivityRunV1Schema.
 *
 * Asserts strict-mode rejection of unknown keys, enum boundaries, JSONB
 * passthrough for params/results, and nullability of terminal-state fields.
 */

import { describe, it, expect } from 'vitest';
import {
  SensitivityRunV1Schema,
  SensitivityRunKindSchema,
  SensitivityRunStatusSchema,
} from '../../../shared/contracts/sensitivity-run-v1.contract';

const validFullEnvelope = {
  id: 42,
  fundId: 1,
  kind: 'one_way' as const,
  status: 'completed' as const,
  params: {
    variables: ['mgmt_fee', 'carry'],
    range: { min: 0.0, max: 0.05, step: 0.005 },
  },
  results: {
    grid: [
      { mgmt_fee: 0.02, irr: 0.18 },
      { mgmt_fee: 0.025, irr: 0.175 },
    ],
  },
  createdBy: 7,
  createdAt: '2026-04-06T12:00:00.000Z',
  completedAt: '2026-04-06T12:01:30.000Z',
  durationMs: 90_000,
  errorCode: null,
  errorMessage: null,
};

describe('SensitivityRunV1Schema', () => {
  it('round-trips a fully populated valid envelope', () => {
    const parsed = SensitivityRunV1Schema.parse(validFullEnvelope);
    expect(parsed).toEqual(validFullEnvelope);
  });

  it('rejects an invalid kind value', () => {
    const result = SensitivityRunV1Schema.safeParse({
      ...validFullEnvelope,
      kind: 'invalid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'kind')).toBe(true);
    }
  });

  it('rejects an invalid status value', () => {
    const result = SensitivityRunV1Schema.safeParse({
      ...validFullEnvelope,
      status: 'invalid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'status')).toBe(true);
    }
  });

  it('rejects extra unknown fields (.strict())', () => {
    const result = SensitivityRunV1Schema.safeParse({
      ...validFullEnvelope,
      sneaky: 'should-not-pass',
    });
    expect(result.success).toBe(false);
  });

  it('accepts arbitrary JSON shapes for params and results', () => {
    const cases: Array<unknown> = [
      { weird: { nested: { deeply: [1, 2, 3, { x: true }] } } },
      [1, 2, 3],
      'just a string',
      42,
      null,
    ];

    for (const params of cases) {
      const parsed = SensitivityRunV1Schema.parse({
        ...validFullEnvelope,
        params,
        results: params,
      });
      expect(parsed.params).toEqual(params);
      expect(parsed.results).toEqual(params);
    }
  });

  it('accepts null for completedAt, durationMs, errorCode, errorMessage', () => {
    const parsed = SensitivityRunV1Schema.parse({
      ...validFullEnvelope,
      status: 'pending',
      results: null,
      completedAt: null,
      durationMs: null,
      errorCode: null,
      errorMessage: null,
    });
    expect(parsed.completedAt).toBeNull();
    expect(parsed.durationMs).toBeNull();
    expect(parsed.errorCode).toBeNull();
    expect(parsed.errorMessage).toBeNull();
  });

  it('exposes the kind and status sub-schemas with the expected enum members', () => {
    expect(SensitivityRunKindSchema.options).toEqual(['one_way', 'two_way', 'stress']);
    expect(SensitivityRunStatusSchema.options).toEqual([
      'pending',
      'running',
      'completed',
      'failed',
    ]);
  });
});
