import { describe, expect, it } from 'vitest';
import { FinancialProvenanceSchema } from '../../../shared/contracts/financial-provenance.contract';

const computedActionable = {
  sourceKind: 'computed',
  actionability: 'actionable',
  sourceEngine: 'monte-carlo-facade',
  engineVersion: '1.0.0',
  inputHash: 'input_sha256_abc',
  assumptionsHash: 'assumptions_sha256_def',
  generatedAt: '2026-06-23T00:00:00.000Z',
  isFinanciallyActionable: true,
  warnings: [],
};

describe('FinancialProvenanceSchema', () => {
  it('accepts computed actionable provenance with engine and hash evidence', () => {
    expect(FinancialProvenanceSchema.parse(computedActionable)).toEqual(computedActionable);
  });

  it('rejects actionable static template provenance', () => {
    const result = FinancialProvenanceSchema.safeParse({
      ...computedActionable,
      sourceKind: 'static_template',
    });

    expect(result.success).toBe(false);
  });

  it('rejects computed actionable provenance without required evidence', () => {
    const result = FinancialProvenanceSchema.safeParse({
      sourceKind: 'computed',
      actionability: 'actionable',
      generatedAt: '2026-06-23T00:00:00.000Z',
      isFinanciallyActionable: true,
      warnings: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-actionable actionability when financially actionable is true', () => {
    const result = FinancialProvenanceSchema.safeParse({
      ...computedActionable,
      actionability: 'non_actionable',
    });

    expect(result.success).toBe(false);
  });

  it('rejects actionable actionability when financially actionable is false', () => {
    const result = FinancialProvenanceSchema.safeParse({
      ...computedActionable,
      isFinanciallyActionable: false,
    });

    expect(result.success).toBe(false);
  });

  it('accepts blocked prototype provenance as non-actionable', () => {
    const result = FinancialProvenanceSchema.parse({
      sourceKind: 'prototype_blocked',
      actionability: 'non_actionable',
      generatedAt: '2026-06-23T00:00:00.000Z',
      sourceRoute: 'POST /api/portfolio/scenarios/:id/simulate',
      isFinanciallyActionable: false,
      quarantineReason: 'prototype_financial_output_blocked',
      warnings: ['Prototype financial output route is disabled.'],
    });

    expect(result.isFinanciallyActionable).toBe(false);
  });

  it('rejects quarantined provenance without a quarantine reason', () => {
    const result = FinancialProvenanceSchema.safeParse({
      sourceKind: 'computed',
      actionability: 'quarantined',
      generatedAt: '2026-06-23T00:00:00.000Z',
      isFinanciallyActionable: false,
      warnings: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects blocked prototype provenance without a quarantine reason', () => {
    const result = FinancialProvenanceSchema.safeParse({
      sourceKind: 'prototype_blocked',
      actionability: 'non_actionable',
      generatedAt: '2026-06-23T00:00:00.000Z',
      sourceRoute: 'POST /api/portfolio/scenarios/:id/simulate',
      isFinanciallyActionable: false,
      warnings: ['Prototype financial output route is disabled.'],
    });

    expect(result.success).toBe(false);
  });

  it('rejects financially actionable provenance with a quarantine reason', () => {
    const result = FinancialProvenanceSchema.safeParse({
      ...computedActionable,
      quarantineReason: 'should_not_be_quarantined',
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown keys so response contracts stay explicit', () => {
    const result = FinancialProvenanceSchema.safeParse({
      ...computedActionable,
      sampleFallback: true,
    });

    expect(result.success).toBe(false);
  });
});
