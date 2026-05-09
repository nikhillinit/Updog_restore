/**
 * Cross-cutting contract tests: previewHash echo on the dry-run paths
 * (Phase 1c.1).
 *
 * The Phase 1c commit handshake requires the dry-run response to carry
 * a previewHash that the client echoes back on commit. This file
 * asserts:
 *   1. ImportDryRunResponseSchema requires previewHash.
 *   2. LpMetricRunDryRunResponseSchema requires previewHash AND keeps
 *      its existing fields { results, diagnostics, inputsHash, runType }.
 *   3. PreviewHashSchema regex coverage (de-duplicated locally so this
 *      file is self-sufficient).
 *   4. Backward shape compatibility -- the existing Phase 1b dry-run
 *      response keys still parse alongside previewHash.
 *
 * All imports come from the lp-reporting barrel per Phase 1.1 convention.
 */
import { describe, expect, it } from 'vitest';

import {
  ImportDryRunResponseSchema,
  LpMetricRunDiagnosticsSchema,
  LpMetricRunDryRunResponseSchema,
  LpMetricRunResultsSchema,
  PreviewHashSchema,
  type LpMetricRunDiagnostics,
  type LpMetricRunResults,
} from '@shared/contracts/lp-reporting';

const validHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// ----- ImportDryRunResponseSchema fixtures (Phase 1b shape + previewHash) ----

const importDryRunHappy = {
  importId: '11111111-2222-3333-4444-555555555555',
  sourceType: 'csv' as const,
  parsedRows: 5,
  validRows: 4,
  invalidRows: 1,
  duplicateRows: 0,
  warnings: [],
  errors: [],
  reconciliation: {
    calledCapitalImported: '1000000.000000',
    distributionsImported: '250000.000000',
    latestNavImported: '0.000000',
    explanations: [],
  },
  preview: [],
  previewHash: validHash,
};

describe('ImportDryRunResponseSchema requires previewHash', () => {
  it('parses an object with previewHash', () => {
    const parsed = ImportDryRunResponseSchema.parse(importDryRunHappy);
    expect(parsed.previewHash).toBe(validHash);
  });

  it('rejects an object missing previewHash', () => {
    const { previewHash: _drop, ...rest } = importDryRunHappy;
    expect(() => ImportDryRunResponseSchema.parse(rest)).toThrow();
  });

  it('rejects a malformed previewHash', () => {
    expect(() =>
      ImportDryRunResponseSchema.parse({ ...importDryRunHappy, previewHash: 'TOO_SHORT' })
    ).toThrow();
  });

  it('preserves Phase 1b shape (matched/partial/unmatched -> warnings/errors/reconciliation)', () => {
    const parsed = ImportDryRunResponseSchema.parse(importDryRunHappy);
    expect(parsed.parsedRows).toBe(5);
    expect(parsed.validRows).toBe(4);
    expect(parsed.invalidRows).toBe(1);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.reconciliation.calledCapitalImported).toBe('1000000.000000');
  });
});

// ----- LpMetricRunDryRunResponseSchema fixtures -------------------------------

const happyResults: LpMetricRunResults = {
  asOfDate: '2026-03-31',
  currency: 'USD',
  dpi: '0.500000',
  rvpi: '1.250000',
  tvpi: '1.750000',
  moic: '1.750000',
  netIrr: '0.148700',
  grossIrr: '0.182300',
  xirrDiagnostic: {
    net: {
      convergence: 'converged',
      iterations: 8,
      method: 'newton',
      boundHit: null,
      failureReason: null,
    },
    gross: {
      convergence: 'converged',
      iterations: 8,
      method: 'newton',
      boundHit: null,
      failureReason: null,
    },
  },
  contributionsTotal: '10000000.000000',
  distributionsTotal: '5000000.000000',
  currentNav: '12500000.000000',
  markConfidenceMix: { high: 5, medium: 2, low: 1 },
};

const happyDiagnostics: LpMetricRunDiagnostics = {
  engineVersion: 'lp-reporting-engine@1.1.0',
  decimalPrecision: 6,
  excludedFutureMarks: [],
  warnings: [],
};

const metricDryRunHappy = {
  results: happyResults,
  diagnostics: happyDiagnostics,
  inputsHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  runType: 'quarterly_report' as const,
  previewHash: validHash,
};

describe('LpMetricRunDryRunResponseSchema requires previewHash', () => {
  it('parses an object with previewHash', () => {
    const parsed = LpMetricRunDryRunResponseSchema.parse(metricDryRunHappy);
    expect(parsed.previewHash).toBe(validHash);
  });

  it('rejects an object missing previewHash', () => {
    const { previewHash: _drop, ...rest } = metricDryRunHappy;
    expect(() => LpMetricRunDryRunResponseSchema.parse(rest)).toThrow();
  });

  it('keeps the existing { results, diagnostics, inputsHash, runType } shape', () => {
    const parsed = LpMetricRunDryRunResponseSchema.parse(metricDryRunHappy);
    expect(parsed.results.dpi).toBe('0.500000');
    expect(parsed.diagnostics.engineVersion).toBe('lp-reporting-engine@1.1.0');
    expect(parsed.inputsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.runType).toBe('quarterly_report');
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(() =>
      LpMetricRunDryRunResponseSchema.parse({ ...metricDryRunHappy, bogus: 'x' })
    ).toThrow();
  });

  it('rejects when results does not conform to LpMetricRunResultsSchema', () => {
    const { contributionsTotal: _drop, ...badResults } = happyResults;
    expect(() =>
      LpMetricRunDryRunResponseSchema.parse({ ...metricDryRunHappy, results: badResults })
    ).toThrow();
  });

  it('rejects when diagnostics does not conform to LpMetricRunDiagnosticsSchema', () => {
    expect(() =>
      LpMetricRunDryRunResponseSchema.parse({
        ...metricDryRunHappy,
        diagnostics: { engineVersion: '', decimalPrecision: 6 },
      })
    ).toThrow();
  });

  it('runType is constrained by the LpMetricRunTypeSchema enum', () => {
    expect(() =>
      LpMetricRunDryRunResponseSchema.parse({ ...metricDryRunHappy, runType: 'drive_by_estimate' })
    ).toThrow();
  });
});

// ----- PreviewHashSchema (de-duplicated coverage so this file stands alone) --

describe('PreviewHashSchema regex (cross-cutting de-dup)', () => {
  it('accepts 64 lowercase hex', () => {
    expect(() => PreviewHashSchema.parse(validHash)).not.toThrow();
  });

  it.each(['TOO_SHORT', 'ABCdef0123', '', '0'.repeat(63), '0'.repeat(65)])('rejects %j', (bad) => {
    expect(() => PreviewHashSchema.parse(bad)).toThrow();
  });
});

// Sanity: the locked Phase 1.1 results + diagnostics schemas remain importable
// from the barrel. (Regression guard for the index.ts re-export change.)
describe('Barrel re-exports the locked Phase 1.1 schemas', () => {
  it('LpMetricRunResultsSchema is exported and parses', () => {
    expect(() => LpMetricRunResultsSchema.parse(happyResults)).not.toThrow();
  });

  it('LpMetricRunDiagnosticsSchema is exported and parses', () => {
    expect(() => LpMetricRunDiagnosticsSchema.parse(happyDiagnostics)).not.toThrow();
  });
});
