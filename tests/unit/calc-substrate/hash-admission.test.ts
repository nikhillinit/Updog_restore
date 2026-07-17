import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  CALC_SUBSTRATE_CONTRACT_VERSION,
  type CalcBasis,
} from '../../../shared/core/calc-substrate/calc-basis';
import {
  HashAdmissionError,
  admitForHashing,
  buildResultHashPreimage,
  computeResultHash,
  normalizeDecimalString,
} from '../../../shared/core/calc-substrate/hash-admission';

const baseBasis: CalcBasis = {
  contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
  calculationKey: 'demo_reserve',
  configuredMode: 'shadow',
  effectiveMode: 'shadow',
  killSwitchActive: false,
  engineVersion: 'demo-engine-1.0.0',
  methodologyVersion: 'demo-methodology-1.0.0',
  inputHash: 'a'.repeat(64),
  assumptionsHash: 'b'.repeat(64),
};

const baseValue = {
  totalReserve: '1250000.50',
  companies: [
    { id: 'c-1', allocation: '750000' },
    { id: 'c-2', allocation: '500000.50' },
  ],
  asOf: '2026-07-17T00:00:00Z',
};

// Published contract vector: recomputable across processes from the persisted
// canonical preimage below. A change here is a contract-version change.
const PINNED_RESULT_HASH = '34c6a03abde9e341e89acef82202e34a9f65404a190568d841adc1bfc888c1b0';
const PERSISTED_PREIMAGE_JSON =
  '{"domain":"updog.calc-substrate.result-hash","contractVersion":"calc-substrate/1.0.0",' +
  '"basis":{"contractVersion":"calc-substrate/1.0.0","calculationKey":"demo_reserve",' +
  '"configuredMode":"shadow","effectiveMode":"shadow","killSwitchActive":false,' +
  '"engineVersion":"demo-engine-1.0.0","methodologyVersion":"demo-methodology-1.0.0",' +
  '"inputHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",' +
  '"assumptionsHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},' +
  '"value":{"totalReserve":"1250000.5","companies":[{"id":"c-1","allocation":"750000"},' +
  '{"id":"c-2","allocation":"500000.5"}],"asOf":"2026-07-17T00:00:00.000Z"}}';

describe('computeResultHash', () => {
  it('reproduces the published vector', () => {
    expect(computeResultHash(baseBasis, baseValue)).toBe(PINNED_RESULT_HASH);
  });

  it('recomputes the published vector from the persisted canonical preimage', () => {
    expect(canonicalSha256(JSON.parse(PERSISTED_PREIMAGE_JSON))).toBe(PINNED_RESULT_HASH);
  });

  it('is invariant to object key insertion order', () => {
    const reorderedValue = {
      asOf: '2026-07-17T00:00:00Z',
      companies: [
        { allocation: '750000', id: 'c-1' },
        { allocation: '500000.50', id: 'c-2' },
      ],
      totalReserve: '1250000.50',
    };
    const reorderedBasis = Object.fromEntries(Object.entries(baseBasis).reverse()) as CalcBasis;
    expect(computeResultHash(reorderedBasis, reorderedValue)).toBe(PINNED_RESULT_HASH);
  });

  it('changes when any declared basis field changes', () => {
    const mutations: Partial<CalcBasis>[] = [
      { calculationKey: 'demo_pacing' },
      { configuredMode: 'on' },
      { configuredMode: 'on', effectiveMode: 'on' },
      { killSwitchActive: true, effectiveMode: 'off' },
      { engineVersion: 'demo-engine-1.0.1' },
      { methodologyVersion: 'demo-methodology-2.0.0' },
      { inputHash: 'c'.repeat(64) },
      { assumptionsHash: 'd'.repeat(64) },
    ];
    for (const mutation of mutations) {
      const mutated = { ...baseBasis, ...mutation };
      expect(computeResultHash(mutated, baseValue), JSON.stringify(mutation)).not.toBe(
        PINNED_RESULT_HASH
      );
    }
  });

  it('changes when the value changes', () => {
    expect(computeResultHash(baseBasis, { ...baseValue, totalReserve: '1250000.51' })).not.toBe(
      PINNED_RESULT_HASH
    );
  });

  it('is domain-separated: the preimage carries the domain tag and contract version', () => {
    const preimage = buildResultHashPreimage(baseBasis, baseValue);
    expect(preimage.domain).toBe('updog.calc-substrate.result-hash');
    expect(preimage.contractVersion).toBe(CALC_SUBSTRATE_CONTRACT_VERSION);
    expect(canonicalSha256(preimage)).not.toBe(
      canonicalSha256({ basis: baseBasis, value: baseValue })
    );
  });

  it('rejects an undeclared basis field before hashing', () => {
    const smuggled = { ...baseBasis, resultHash: 'e'.repeat(64) } as CalcBasis;
    expect(() => computeResultHash(smuggled, baseValue)).toThrow();
  });
});

describe('normalizeDecimalString', () => {
  it('normalizes equivalent decimal representations to one canonical form', () => {
    expect(normalizeDecimalString('1.10')).toBe('1.1');
    expect(normalizeDecimalString('007')).toBe('7');
    expect(normalizeDecimalString('+42')).toBe('42');
    expect(normalizeDecimalString('-0')).toBe('0');
    expect(normalizeDecimalString('-0.000')).toBe('0');
    expect(normalizeDecimalString('-12.3400')).toBe('-12.34');
  });

  it('makes equivalent decimal and timestamp spellings hash-equal', () => {
    const spelled = {
      ...baseValue,
      totalReserve: '1250000.500',
      asOf: '2026-07-17T00:00:00.000Z',
    };
    expect(computeResultHash(baseBasis, spelled)).toBe(PINNED_RESULT_HASH);
  });
});

describe('admitForHashing', () => {
  it('rejects every forbidden value class before hashing', () => {
    class FakeDecimal {
      constructor(readonly v: string) {}
    }
    const sparseArray = new Array<number>(3);
    sparseArray[0] = 1;
    sparseArray[2] = 3;
    const forbidden: [string, unknown][] = [
      ['undefined', undefined],
      ['object with undefined property', { a: undefined }],
      ['sparse array', sparseArray],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['-Infinity', Number.NEGATIVE_INFINITY],
      ['bigint', 10n],
      ['Map', new Map([['a', 1]])],
      ['Set', new Set([1])],
      ['Date instance', new Date(0)],
      ['class instance', new FakeDecimal('1.5')],
      ['function', () => 1],
      ['symbol-keyed property', { [Symbol('k')]: 1, a: 1 }],
      ['non-real timestamp string', '2026-02-30T00:00:00Z'],
    ];
    for (const [label, value] of forbidden) {
      expect(() => admitForHashing(value), label).toThrow(HashAdmissionError);
      expect(() => computeResultHash(baseBasis, { wrapped: value }), label).toThrow(
        HashAdmissionError
      );
    }
  });

  it('normalizes -0 to 0 and accepts plain JSON values', () => {
    expect(admitForHashing(-0)).toBe(0);
    expect(admitForHashing({ a: [1, 'x', true, null] })).toEqual({ a: [1, 'x', true, null] });
  });
});
