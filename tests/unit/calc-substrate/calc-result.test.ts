import { describe, expect, it } from 'vitest';
import {
  CALC_SUBSTRATE_CONTRACT_VERSION,
  CalcBasisSchema,
  type CalcBasis,
} from '../../../shared/core/calc-substrate/calc-basis';
import {
  GenericCalcResultSchema,
  toDatasetTrustState,
} from '../../../shared/core/calc-substrate/calc-result';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

const validBasis: CalcBasis = {
  contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
  calculationKey: 'demo_reserve',
  configuredMode: 'shadow',
  effectiveMode: 'shadow',
  killSwitchActive: false,
  engineVersion: 'demo-engine-1.0.0',
  methodologyVersion: 'demo-methodology-1.0.0',
  inputHash: SHA_A,
  assumptionsHash: SHA_B,
};

describe('CalcBasisSchema', () => {
  it('accepts a valid basis', () => {
    expect(CalcBasisSchema.parse(validBasis)).toEqual(validBasis);
  });

  it('rejects unknown contract versions, modes, and calculation keys', () => {
    expect(
      CalcBasisSchema.safeParse({ ...validBasis, contractVersion: 'calc-substrate/9.9.9' }).success
    ).toBe(false);
    expect(CalcBasisSchema.safeParse({ ...validBasis, configuredMode: 'dry-run' }).success).toBe(
      false
    );
    for (const key of ['', 'Demo', '9reserve', 'demo reserve']) {
      expect(CalcBasisSchema.safeParse({ ...validBasis, calculationKey: key }).success).toBe(false);
    }
  });

  it('rejects malformed hashes and undeclared fields', () => {
    expect(CalcBasisSchema.safeParse({ ...validBasis, inputHash: 'abc' }).success).toBe(false);
    expect(
      CalcBasisSchema.safeParse({ ...validBasis, inputHash: SHA_A.toUpperCase() }).success
    ).toBe(false);
    expect(CalcBasisSchema.safeParse({ ...validBasis, resultHash: SHA_C }).success).toBe(false);
    expect(CalcBasisSchema.safeParse({ ...validBasis, extra: true }).success).toBe(false);
  });

  it('rejects basis cross-field disagreements', () => {
    expect(
      CalcBasisSchema.safeParse({ ...validBasis, killSwitchActive: true, effectiveMode: 'shadow' })
        .success
    ).toBe(false);
    expect(
      CalcBasisSchema.safeParse({ ...validBasis, configuredMode: 'shadow', effectiveMode: 'on' })
        .success
    ).toBe(false);
    expect(
      CalcBasisSchema.safeParse({ ...validBasis, killSwitchActive: true, effectiveMode: 'off' })
        .success
    ).toBe(true);
  });
});

describe('GenericCalcResultSchema', () => {
  it('accepts a valid available result', () => {
    const parsed = GenericCalcResultSchema.safeParse({
      state: 'available',
      basis: validBasis,
      value: { totalReserve: '100' },
      resultHash: SHA_C,
      reasonCodes: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a valid indicative result that discloses why', () => {
    const parsed = GenericCalcResultSchema.safeParse({
      state: 'indicative',
      basis: validBasis,
      value: { totalReserve: '100' },
      resultHash: SHA_C,
      reasonCodes: ['SHADOW_ONLY'],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts valid unavailable and failed results', () => {
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'unavailable',
        basis: validBasis,
        reasonCodes: ['INPUT_MISSING'],
      }).success
    ).toBe(true);
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'failed',
        basis: validBasis,
        reasonCodes: ['ENGINE_ERROR'],
        diagnostic: 'divide by zero in tier 3',
      }).success
    ).toBe(true);
  });

  it('rejects an available result carrying reason codes or missing its hash', () => {
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'available',
        basis: validBasis,
        value: 1,
        resultHash: SHA_C,
        reasonCodes: ['STALE_SOURCE'],
      }).success
    ).toBe(false);
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'available',
        basis: validBasis,
        value: 1,
        reasonCodes: [],
      }).success
    ).toBe(false);
  });

  it('rejects non-available results that hide their reasons', () => {
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'unavailable',
        basis: validBasis,
        reasonCodes: [],
      }).success
    ).toBe(false);
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'indicative',
        basis: validBasis,
        value: 1,
        resultHash: SHA_C,
        reasonCodes: [],
      }).success
    ).toBe(false);
  });

  it('rejects unregistered reason codes', () => {
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'unavailable',
        basis: validBasis,
        reasonCodes: ['NOT_A_CODE'],
      }).success
    ).toBe(false);
  });

  it('rejects value smuggling on unavailable/failed results', () => {
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'unavailable',
        basis: validBasis,
        reasonCodes: ['INPUT_MISSING'],
        value: { totalReserve: '100' },
      }).success
    ).toBe(false);
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'failed',
        basis: validBasis,
        reasonCodes: ['ENGINE_ERROR'],
        resultHash: SHA_C,
      }).success
    ).toBe(false);
  });

  it('rejects basis/result cross-field disagreements', () => {
    const offBasis: CalcBasis = { ...validBasis, configuredMode: 'off', effectiveMode: 'off' };
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'available',
        basis: offBasis,
        value: 1,
        resultHash: SHA_C,
        reasonCodes: [],
      }).success
    ).toBe(false);

    const killBasis: CalcBasis = { ...validBasis, killSwitchActive: true, effectiveMode: 'off' };
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'unavailable',
        basis: killBasis,
        reasonCodes: ['UPSTREAM_UNAVAILABLE'],
      }).success
    ).toBe(false);
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'unavailable',
        basis: killBasis,
        reasonCodes: ['KILL_SWITCH_ACTIVE'],
      }).success
    ).toBe(true);

    expect(
      GenericCalcResultSchema.safeParse({
        state: 'unavailable',
        basis: offBasis,
        reasonCodes: ['INPUT_MISSING'],
      }).success
    ).toBe(false);
    expect(
      GenericCalcResultSchema.safeParse({
        state: 'unavailable',
        basis: offBasis,
        reasonCodes: ['MODE_OFF'],
      }).success
    ).toBe(true);
  });
});

describe('toDatasetTrustState', () => {
  it('maps every substrate state onto the existing envelope vocabulary', () => {
    expect(toDatasetTrustState('available')).toBe('LIVE');
    expect(toDatasetTrustState('indicative')).toBe('PARTIAL');
    expect(toDatasetTrustState('unavailable')).toBe('UNAVAILABLE');
    expect(toDatasetTrustState('failed')).toBe('FAILED');
  });
});
