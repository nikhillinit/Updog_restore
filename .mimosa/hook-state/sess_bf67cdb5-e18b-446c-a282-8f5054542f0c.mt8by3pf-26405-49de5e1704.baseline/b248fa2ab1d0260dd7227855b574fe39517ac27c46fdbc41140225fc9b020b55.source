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
  {
    engine: 'economics',
    snapshotType: 'ECONOMICS',
    queueKey: 'economics-calc',
    authority: 'experimental',
    syncCapable: true,
    featureFlag: 'enable_gp_economics_engine',
  },
] as const;

export type FundCalculationEngineDescriptor = (typeof FUND_CALCULATION_ENGINE_CATALOG)[number];
export type FundCalculationEngineKey = FundCalculationEngineDescriptor['engine'];
export type FundCalculationSnapshotType = FundCalculationEngineDescriptor['snapshotType'];
export type FundCalculationQueueKey = FundCalculationEngineDescriptor['queueKey'];
export type FundCalculationAuthority = FundCalculationEngineDescriptor['authority'];
export type AuthoritativeCalculationEngineDescriptor = Extract<
  FundCalculationEngineDescriptor,
  { authority: 'authoritative' }
>;
export type ExperimentalCalculationEngineDescriptor = Extract<
  FundCalculationEngineDescriptor,
  { authority: 'experimental' }
>;

export const AUTHORITATIVE_CALCULATION_ENGINES = FUND_CALCULATION_ENGINE_CATALOG.filter(
  (engine): engine is AuthoritativeCalculationEngineDescriptor =>
    engine.authority === 'authoritative'
) as readonly AuthoritativeCalculationEngineDescriptor[];
export const EXPERIMENTAL_CALCULATION_ENGINES = FUND_CALCULATION_ENGINE_CATALOG.filter(
  (engine): engine is ExperimentalCalculationEngineDescriptor => engine.authority === 'experimental'
) as readonly ExperimentalCalculationEngineDescriptor[];

export const AUTHORITATIVE_ENGINE_KEYS = AUTHORITATIVE_CALCULATION_ENGINES.map(
  (engine) => engine.engine
) as readonly AuthoritativeCalculationEngineDescriptor['engine'][];
export const AUTHORITATIVE_SNAPSHOT_TYPES = AUTHORITATIVE_CALCULATION_ENGINES.map(
  (engine) => engine.snapshotType
) as readonly AuthoritativeCalculationEngineDescriptor['snapshotType'][];
export const EXPERIMENTAL_ENGINE_KEYS = EXPERIMENTAL_CALCULATION_ENGINES.map(
  (engine) => engine.engine
) as readonly ExperimentalCalculationEngineDescriptor['engine'][];
export const EXPERIMENTAL_SNAPSHOT_TYPES = EXPERIMENTAL_CALCULATION_ENGINES.map(
  (engine) => engine.snapshotType
) as readonly ExperimentalCalculationEngineDescriptor['snapshotType'][];

export type AuthoritativeEngineKey = (typeof AUTHORITATIVE_ENGINE_KEYS)[number];
export type AuthoritativeSnapshotType = (typeof AUTHORITATIVE_SNAPSHOT_TYPES)[number];
export type ExperimentalEngineKey = (typeof EXPERIMENTAL_ENGINE_KEYS)[number];
export type ExperimentalSnapshotType = (typeof EXPERIMENTAL_SNAPSHOT_TYPES)[number];

export function isAuthoritativeEngineKey(engineKey: string): engineKey is AuthoritativeEngineKey {
  return (AUTHORITATIVE_ENGINE_KEYS as readonly string[]).includes(engineKey);
}

export function isAuthoritativeSnapshotType(
  snapshotType: string
): snapshotType is AuthoritativeSnapshotType {
  return (AUTHORITATIVE_SNAPSHOT_TYPES as readonly string[]).includes(snapshotType);
}

export function isFundCalculationQueueKey(queueKey: string): queueKey is FundCalculationQueueKey {
  return FUND_CALCULATION_ENGINE_CATALOG.some((engine) => engine.queueKey === queueKey);
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

export function getCalculationEngineDescriptorByQueueKey(
  queueKey: FundCalculationQueueKey
): FundCalculationEngineDescriptor {
  const descriptor = FUND_CALCULATION_ENGINE_CATALOG.find((engine) => engine.queueKey === queueKey);
  if (!descriptor) {
    throw new Error(`Unknown fund calculation queue key: ${queueKey}`);
  }
  return descriptor;
}
