import { describe, expect, it } from 'vitest';

import {
  RELEASE_CANARY_RESERVED_RESIDUE,
  RELEASE_CANARY_RESIDUE_GROUP_KEYS,
  parseReleaseCanaryResidueCharacterization,
  type ResidueVector,
} from '@shared/contracts/release-canary-residue-characterization-v1.contract';

type GroupKey = (typeof RELEASE_CANARY_RESIDUE_GROUP_KEYS)[number];

function vector(groups: Partial<Record<GroupKey, number>>, totalOverride?: number): ResidueVector {
  const base = Object.fromEntries(
    RELEASE_CANARY_RESIDUE_GROUP_KEYS.map((key) => [key, groups[key] ?? 0])
  ) as Record<GroupKey, number>;
  const total =
    totalOverride ?? RELEASE_CANARY_RESIDUE_GROUP_KEYS.reduce((acc, key) => acc + base[key], 0);
  return { ...base, total };
}

const partialVector = vector({
  portfolioCompany: 1,
  fund: 1,
  fundConfig: 1,
  fundEvent: 2,
  calculation: 2,
  mutationReceipt: 1,
  scenario: 3,
  reporting: 5,
});

const reservedVector: ResidueVector = { ...RELEASE_CANARY_RESERVED_RESIDUE };

function validRecord() {
  return {
    schemaVersion: 'release-canary-residue-characterization-v1',
    sourceSha: 'a'.repeat(40),
    contractVersion: 'canary-residue-2026-08',
    reservedResidue: { ...reservedVector },
    phases: [
      { name: 'seed-and-run', residue: { ...partialVector } },
      { name: 'promote-and-report', residue: { ...reservedVector } },
    ],
    finalResidue: { ...reservedVector },
    failureBoundaries: [{ name: 'inject-fee-failure', residue: { ...partialVector } }],
    provenance: {
      dataOrigin: 'production',
      timeZone: 'UTC',
      expectedRunVersion: 1,
      flagState: { enableGpEconomicsEngine: false, cohortCalculationInvoked: false },
      snapshotTypes: { RESERVE: 1, PACING: 1, scenario: 1, ECONOMICS: 0, COHORT: 0 },
      directFundForeignKeys: ['public.fundconfigs', 'public.portfoliocompanies'],
    },
    result: 'passed',
  };
}

describe('release-canary-residue-characterization-v1 contract', { retry: 0 }, () => {
  it('accepts a valid success characterization and returns the typed record', () => {
    const record = validRecord();
    expect(parseReleaseCanaryResidueCharacterization(record)).toEqual(record);
  });

  it('freezes the reserved vector at the exact 33-row contract', () => {
    expect(Object.isFrozen(RELEASE_CANARY_RESERVED_RESIDUE)).toBe(true);
    expect(RELEASE_CANARY_RESERVED_RESIDUE.total).toBe(40);
    expect(
      RELEASE_CANARY_RESIDUE_GROUP_KEYS.reduce(
        (acc, key) => acc + RELEASE_CANARY_RESERVED_RESIDUE[key],
        0
      )
    ).toBe(40);
  });

  const rejections: Array<[string, (record: ReturnType<typeof validRecord>) => unknown]> = [
    ['unknown top-level field', (r) => ({ ...r, artifactId: '123' })],
    [
      'unknown nested field in a residue vector',
      (r) => ({ ...r, finalResidue: { ...r.finalResidue, rowIds: [1] } }),
    ],
    ['uppercase sourceSha', (r) => ({ ...r, sourceSha: 'A'.repeat(40) })],
    ['short sourceSha', (r) => ({ ...r, sourceSha: 'a'.repeat(39) })],
    [
      'negative count',
      (r) => ({ ...r, failureBoundaries: [{ name: 'x', residue: vector({ fund: -1 }, -1) }] }),
    ],
    [
      'fractional count',
      (r) => ({ ...r, failureBoundaries: [{ name: 'x', residue: vector({ fund: 0.5 }, 0.5) }] }),
    ],
    [
      'count above bound',
      (r) => ({ ...r, failureBoundaries: [{ name: 'x', residue: vector({ fund: 10_001 }, 10_001) }] }),
    ],
    [
      'total-sum mismatch in reservedResidue',
      (r) => ({ ...r, reservedResidue: { ...r.reservedResidue, total: 34 } }),
    ],
    [
      'total-sum mismatch in a phase vector',
      (r) => ({
        ...r,
        phases: [{ name: 'seed', residue: { ...partialVector, total: partialVector.total + 1 } }, r.phases[1]!],
      }),
    ],
    [
      'total-sum mismatch in finalResidue',
    (r) => ({ ...r, finalResidue: { ...r.finalResidue, total: 39 } }),
    ],
    [
      'total-sum mismatch in a failure boundary vector',
      (r) => ({
        ...r,
        failureBoundaries: [{ name: 'x', residue: { ...partialVector, total: partialVector.total - 1 } }],
      }),
    ],
    [
      'non-monotonic phases',
      // Last phase equals finalResidue and reserved, so ONLY monotonicity fires.
      (r) => ({
        ...r,
        phases: [
          { name: 'seed', residue: { ...reservedVector } },
          { name: 'mid', residue: { ...partialVector } },
          { name: 'final', residue: { ...reservedVector } },
        ],
      }),
    ],
    [
      'sum-valid reservedResidue drifted from the frozen vector',
      (r) => ({ ...r, reservedResidue: vector({ ...reservedVector, reporting: 10 }) }),
    ],
    [
      'last phase not equal to finalResidue',
      (r) => ({ ...r, phases: [{ name: 'seed', residue: { ...partialVector } }] }),
    ],
    [
      'finalResidue not equal to reserved vector',
      (r) => {
        const drifted = vector({ ...reservedVector, reporting: 10 });
        return {
          ...r,
          phases: [{ name: 'seed', residue: drifted }],
          finalResidue: drifted,
        };
      },
    ],
    [
      'failure boundary exceeding reserved in one component',
      (r) => ({
        ...r,
        failureBoundaries: [{ name: 'x', residue: vector({ notification: 1 }) }],
      }),
    ],
    ['result other than passed', (r) => ({ ...r, result: 'failed' })],
    ['empty phases', (r) => ({ ...r, phases: [] })],
    ['empty failureBoundaries', (r) => ({ ...r, failureBoundaries: [] })],
    ['empty contractVersion', (r) => ({ ...r, contractVersion: '' })],
    ['phase name with unsafe characters', (r) => ({
      ...r,
      phases: [{ name: 'seed run!', residue: { ...partialVector } }, r.phases[1]!],
    })],
  ];

  it.each(rejections)('rejects %s', (_label, mutate) => {
    expect(() => parseReleaseCanaryResidueCharacterization(mutate(validRecord()))).toThrow();
  });

  const secretRejections: Array<[string, (record: ReturnType<typeof validRecord>) => unknown]> = [
    ['secret-shaped key', (r) => ({ ...r, dbPassword: 'x' })],
    ['nested secret-shaped key', (r) => ({ ...r, finalResidue: { ...r.finalResidue, apiToken: 1 } })],
    [
      'postgres connection string value',
      (r) => ({ ...r, contractVersion: 'postgres://user:pw@host/db' }),
    ],
    ['redis connection string value', (r) => ({ ...r, contractVersion: 'redis://host:6379' })],
    ['bearer token value', (r) => ({ ...r, contractVersion: 'Bearer abc.def.ghi' })],
    [
      'long base64-ish blob value',
      (r) => ({ ...r, contractVersion: 'A1b2C3d4E5f6G7h8I9j0A1b2C3d4E5f6G7h8I9j0X=' }),
    ],
  ];

  it.each(secretRejections)('rejects %s before schema parse', (_label, mutate) => {
    expect(() => parseReleaseCanaryResidueCharacterization(mutate(validRecord()))).toThrow(
      /Secret-shaped/
    );
  });

  it('does not treat the 40-char git SHA as a secret blob', () => {
    expect(() => parseReleaseCanaryResidueCharacterization(validRecord())).not.toThrow();
  });
});
