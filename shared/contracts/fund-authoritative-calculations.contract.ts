export const FUND_CALCULATION_ENGINE_CATALOG = [
  {
    engine: 'reserve',
    snapshotType: 'RESERVE',
    queueKey: 'reserve-calc',
    authority: 'authoritative',
    syncCapable: true,
  },
  {
    engine: 'pacing',
    snapshotType: 'PACING',
    queueKey: 'pacing-calc',
    authority: 'authoritative',
    syncCapable: true,
  },
  {
    engine: 'cohort',
    snapshotType: 'COHORT',
    queueKey: 'cohort-calc',
    authority: 'experimental',
    syncCapable: false,
  },
] as const;

export type FundCalculationEngineDescriptor = (typeof FUND_CALCULATION_ENGINE_CATALOG)[number];
export type FundCalculationEngineKey = FundCalculationEngineDescriptor['engine'];
export type FundCalculationSnapshotType = FundCalculationEngineDescriptor['snapshotType'];
export type FundCalculationQueueKey = FundCalculationEngineDescriptor['queueKey'];
export type FundCalculationAuthority = FundCalculationEngineDescriptor['authority'];

export const AUTHORITATIVE_CALCULATION_ENGINES = FUND_CALCULATION_ENGINE_CATALOG.filter(
  (engine) => engine.authority === 'authoritative'
);

export const AUTHORITATIVE_ENGINE_KEYS = ['reserve', 'pacing'] as const;
export const AUTHORITATIVE_SNAPSHOT_TYPES = ['RESERVE', 'PACING'] as const;

export type AuthoritativeEngineKey = (typeof AUTHORITATIVE_ENGINE_KEYS)[number];
export type AuthoritativeSnapshotType = (typeof AUTHORITATIVE_SNAPSHOT_TYPES)[number];

export function isAuthoritativeEngineKey(engineKey: string): engineKey is AuthoritativeEngineKey {
  return AUTHORITATIVE_ENGINE_KEYS.includes(engineKey as AuthoritativeEngineKey);
}

export function getCalculationEngineDescriptor(
  engineKey: FundCalculationEngineKey
): FundCalculationEngineDescriptor {
  const descriptor = FUND_CALCULATION_ENGINE_CATALOG.find((engine) => engine.engine === engineKey);
  if (!descriptor) {
    throw new Error(`Unknown fund calculation engine: ${engineKey}`);
  }
  return descriptor;
}
