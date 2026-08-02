import { describe, expect, it } from 'vitest';

import {
  INTERNAL_LP_ECONOMICS_RUN_RECEIPT_VERSION_V1,
  InternalLpEconomicsRunReceiptV1Schema,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-receipt-v1.contract';

const hash = 'a'.repeat(64);
const unavailableResult = {
  waterfallTemplate: 'deal_by_deal',
  resultStatus: 'unavailable',
  clock: '2026-06-30T23:59:59.000Z',
  currency: 'USD',
  perspective: 'lp_net',
  precisionMode: 'decimal_native_with_float64_xirr',
  reasons: [{ code: 'MAIN_FUND_VEHICLE_ABSENT' }],
} as const;

const completedReceipt = {
  receiptVersion: 'internal-lp-economics-run-receipt/1.0.0',
  runId: 1,
  fundId: 2,
  createdAt: '2026-06-30T23:59:59.000Z',
  basis: {
    policyVersionId: 3,
    capitalEnvelopeVersionId: 4,
    factsSnapshotId: 5,
    knowledgeCutoff: '2026-06-30T00:00:00.000Z',
    planVersionId: 6,
    forecastSnapshotId: 7,
    evaluationClock: '2026-06-30T23:59:59.000Z',
    terminalMode: 'hold_unrealized',
    terminalPeriodEnd: '2026-09-30',
    terminalResolutionMethodologyVersion: 'terminal-resolution/1.0.0',
  },
  versions: {
    calculationContractVersion: 'lp-economics/1.1.0',
    engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
    methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
    resultCalculationVersion: 'lp-economics/1.1.0',
  },
  hashes: {
    capitalEnvelopeHash: hash,
    policyAssumptionsHash: hash,
    factsSnapshotInputHash: hash,
    planAssumptionsHash: hash,
    forecastInputHash: hash,
    inputHash: hash,
    resultHash: hash,
  },
  outcome: { runState: 'completed', result: unavailableResult },
} as const;

describe('InternalLpEconomicsRunReceiptV1Schema', () => {
  it('pins the independent receipt version and accepts an exact completed V1.1 receipt', () => {
    expect(INTERNAL_LP_ECONOMICS_RUN_RECEIPT_VERSION_V1).toBe(
      'internal-lp-economics-run-receipt/1.0.0'
    );
    expect(InternalLpEconomicsRunReceiptV1Schema.parse(completedReceipt)).toEqual(completedReceipt);
  });

  it('accepts an exact failed receipt with allowlisted bounded JSON-safe context', () => {
    const failed = {
      ...completedReceipt,
      versions: { ...completedReceipt.versions, resultCalculationVersion: null },
      hashes: { ...completedReceipt.hashes, resultHash: null },
      outcome: {
        runState: 'failed',
        failure: { code: 'CARRY_PCT_INVALID', context: { field: 'carryPct', nested: [true, 1] } },
      },
    };
    expect(InternalLpEconomicsRunReceiptV1Schema.parse(failed)).toEqual(failed);
  });

  it('accepts exact legacy V1.0 completed and failed receipts without changing receipt version', () => {
    const legacyVersions = {
      calculationContractVersion: 'lp-economics/1.0.0',
      engineVersion: 'cash-assembly-period-loop-v1/1.0.0',
      methodologyVersion: 'cash-assembly-period-loop-methodology/1.0.0',
      resultCalculationVersion: 'lp-economics/1.0.0',
    } as const;
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        ...completedReceipt,
        versions: legacyVersions,
      }).success
    ).toBe(true);
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        ...completedReceipt,
        versions: { ...legacyVersions, resultCalculationVersion: null },
        hashes: { ...completedReceipt.hashes, resultHash: null },
        outcome: {
          runState: 'failed',
          failure: { code: 'CARRY_PCT_INVALID', context: {} },
        },
      }).success
    ).toBe(true);
  });

  it.each([
    ['top level', { unexpected: true }],
    ['basis', { basis: { ...completedReceipt.basis, unexpected: true } }],
    ['versions', { versions: { ...completedReceipt.versions, unexpected: true } }],
    ['hashes', { hashes: { ...completedReceipt.hashes, unexpected: true } }],
    ['outcome', { outcome: { ...completedReceipt.outcome, unexpected: true } }],
  ])('rejects unknown keys at the %s boundary', (_label, override) => {
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({ ...completedReceipt, ...override }).success
    ).toBe(false);
  });

  it('enforces completed/failed nullability and exact calculation/result-version coupling', () => {
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        ...completedReceipt,
        versions: { ...completedReceipt.versions, resultCalculationVersion: null },
      }).success
    ).toBe(false);
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        ...completedReceipt,
        versions: { ...completedReceipt.versions, resultCalculationVersion: 'lp-economics/1.0.0' },
      }).success
    ).toBe(false);
  });

  it('rejects unknown keys inside the failed outcome boundary', () => {
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        ...completedReceipt,
        versions: { ...completedReceipt.versions, resultCalculationVersion: null },
        hashes: { ...completedReceipt.hashes, resultHash: null },
        outcome: {
          runState: 'failed',
          failure: { code: 'CARRY_PCT_INVALID', context: {}, unexpected: true },
        },
      }).success
    ).toBe(false);
  });

  it('rejects noncanonical timestamps and hashes', () => {
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({ ...completedReceipt, createdAt: '2026-06-30T23:59:59Z' }).success
    ).toBe(false);
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        ...completedReceipt,
        hashes: { ...completedReceipt.hashes, inputHash: 'A'.repeat(64) },
      }).success
    ).toBe(false);
  });

  it.each([
    ['unknown code', { code: 'NOT_PUBLIC', context: {} }],
    ['17 object keys', { code: 'CARRY_PCT_INVALID', context: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i])) }],
    ['17 array items', { code: 'CARRY_PCT_INVALID', context: { values: Array(17).fill(null) } }],
    ['65-character key', { code: 'CARRY_PCT_INVALID', context: { ['k'.repeat(65)]: true } }],
    ['513-byte string', { code: 'CARRY_PCT_INVALID', context: { detail: 'x'.repeat(513) } }],
    ['non-finite number', { code: 'CARRY_PCT_INVALID', context: { value: Number.POSITIVE_INFINITY } }],
    ['depth 4 container', { code: 'CARRY_PCT_INVALID', context: { a: { b: { c: { d: { e: true } } } } } }],
    ['forbidden nested metadata', { code: 'CARRY_PCT_INVALID', context: { safe: { correlationId: 'secret' } } }],
  ])('rejects failed context with %s', (_label, failure) => {
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        ...completedReceipt,
        versions: { ...completedReceipt.versions, resultCalculationVersion: null },
        hashes: { ...completedReceipt.hashes, resultHash: null },
        outcome: { runState: 'failed', failure },
      }).success
    ).toBe(false);
  });

  it('rejects failure context above 4096 canonical UTF-8 bytes', () => {
    const context = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`key${i}`, 'x'.repeat(500)]));
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        ...completedReceipt,
        versions: { ...completedReceipt.versions, resultCalculationVersion: null },
        hashes: { ...completedReceipt.hashes, resultHash: null },
        outcome: { runState: 'failed', failure: { code: 'CARRY_PCT_INVALID', context } },
      }).success
    ).toBe(false);
  });
});
