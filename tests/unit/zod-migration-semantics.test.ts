import { describe, expect, it } from 'vitest';
import { ConstraintsSchema } from '@shared/schemas';
import { CustomCapPolicySchema as SharedCapPolicy } from '@shared/schemas/reserves-schemas';
import { CustomCapPolicySchema as ClientCapPolicy } from '@/schemas/reserves-schema';
import { storableWizardSchema } from '@/schemas/modeling-wizard.schemas';
import { UpdateDealSchema } from '../../server/services/deal-pipeline/schemas';
import { UntypedMetricChangeSchema } from '@shared/variance-validation';

describe('validation semantics preserved across the Zod upgrade', () => {
  it('leaves omitted update fields absent', () => {
    expect(UpdateDealSchema.parse({ companyName: 'Renamed' })).toEqual({ companyName: 'Renamed' });
    expect(ConstraintsSchema.parse({})).toEqual({});
  });

  it('keeps unlimited per-company reserves and sparse stage constraints', () => {
    expect(ConstraintsSchema.parse({ maxPerCompany: Infinity, maxPerStage: { seed: 1 } })).toEqual({
      maxPerCompany: Infinity,
      maxPerStage: { seed: 1 },
    });
    expect(ConstraintsSchema.parse({ maxPerCompany: '1e400' }).maxPerCompany).toBe(Infinity);
    expect(ConstraintsSchema.safeParse({ maxPerCompany: Symbol('invalid') }).success).toBe(false);
    expect(ConstraintsSchema.safeParse({ maxPerCompany: -1 }).success).toBe(false);
  });

  it('keeps opaque metric fields optional', () => {
    expect(UntypedMetricChangeSchema.parse({})).toEqual({});
  });

  it('allows omitted wizard steps while validating any supplied step', () => {
    expect(storableWizardSchema.parse({ currentStep: 'generalInfo' })).toEqual({
      currentStep: 'generalInfo',
    });
    expect(storableWizardSchema.safeParse({ generalInfo: {} }).success).toBe(false);
  });

  it.each([
    ['shared', SharedCapPolicy],
    ['client', ClientCapPolicy],
  ] as const)('%s cap policy validates function arguments and results', (_name, schema) => {
    const company = { id: 'company-1', name: 'Company', invested_cents: 100, exit_moic_bps: 10000 };
    const valid = schema.parse({ kind: 'custom', custom_fn: () => 1 }).custom_fn!;
    expect(valid(company)).toBe(1);
    expect(Reflect.apply(valid, undefined, [company, 'unused'])).toBe(1);
    expect(() => Reflect.apply(valid, undefined, [{}])).toThrow();
    const invalid = schema.parse({ kind: 'custom', custom_fn: () => 'invalid' }).custom_fn!;
    expect(() => invalid(company)).toThrow();
  });
});
