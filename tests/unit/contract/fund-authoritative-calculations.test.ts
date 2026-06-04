import { describe, expect, it } from 'vitest';
import {
  AUTHORITATIVE_ENGINE_KEYS,
  AUTHORITATIVE_SNAPSHOT_TYPES,
  EXPERIMENTAL_ENGINE_KEYS,
  EXPERIMENTAL_SNAPSHOT_TYPES,
  getCalculationEngineDescriptor,
  getCalculationEngineDescriptorByQueueKey,
  isAuthoritativeEngineKey,
  isAuthoritativeSnapshotType,
} from '@shared/contracts/fund-authoritative-calculations.contract';

describe('fund calculation authority catalog', () => {
  it('keeps readiness limited to authoritative reserve and pacing engines', () => {
    expect([...AUTHORITATIVE_ENGINE_KEYS]).toEqual(['reserve', 'pacing']);
    expect([...AUTHORITATIVE_SNAPSHOT_TYPES]).toEqual(['RESERVE', 'PACING']);

    expect(isAuthoritativeEngineKey('reserve')).toBe(true);
    expect(isAuthoritativeEngineKey('pacing')).toBe(true);
    expect(isAuthoritativeEngineKey('cohort')).toBe(false);
    expect(isAuthoritativeSnapshotType('RESERVE')).toBe(true);
    expect(isAuthoritativeSnapshotType('PACING')).toBe(true);
    expect(isAuthoritativeSnapshotType('COHORT')).toBe(false);
  });

  it('classifies cohort as experimental until it has authoritative snapshots', () => {
    const cohort = getCalculationEngineDescriptor('cohort');

    expect(cohort).toMatchObject({
      engine: 'cohort',
      snapshotType: 'COHORT',
      queueKey: 'cohort-calc',
      authority: 'experimental',
      syncCapable: false,
    });
    expect([...EXPERIMENTAL_ENGINE_KEYS]).toContain('cohort');
    expect([...EXPERIMENTAL_SNAPSHOT_TYPES]).toContain('COHORT');
    expect([...AUTHORITATIVE_ENGINE_KEYS]).not.toContain('cohort');
    expect([...AUTHORITATIVE_SNAPSHOT_TYPES]).not.toContain('COHORT');
  });

  it('resolves queue keys through the same catalog used for readiness', () => {
    expect(getCalculationEngineDescriptorByQueueKey('reserve-calc').authority).toBe(
      'authoritative'
    );
    expect(getCalculationEngineDescriptorByQueueKey('pacing-calc').authority).toBe(
      'authoritative'
    );
    expect(getCalculationEngineDescriptorByQueueKey('cohort-calc').authority).toBe(
      'experimental'
    );
  });
});
