import type { Queue, Worker } from 'bullmq';
import type { FundCalculationAuthority } from '@shared/contracts/fund-authoritative-calculations.contract';

export type QueueRegistryKey =
  | 'simulation'
  | 'report'
  | 'backtesting'
  | 'reserve-calc'
  | 'pacing-calc'
  | 'cohort-calc'
  | 'economics-calc';

export type QueueHealthMode = 'worker' | 'producer';
export type QueueOwner = 'providers' | 'route';

export interface QueueCatalogEntry {
  key: QueueRegistryKey;
  queueName: string;
  displayName: string;
  healthMode: QueueHealthMode;
  owner: QueueOwner;
  fundCalculationAuthority?: FundCalculationAuthority;
}

export interface RegisteredQueueRuntime {
  getQueue: () => Queue | null;
  getWorker?: () => Worker | null;
  isInitialized: () => boolean;
}

export const QUEUE_CATALOG: readonly QueueCatalogEntry[] = [
  {
    key: 'simulation',
    queueName: 'monte-carlo-simulations',
    displayName: 'Monte Carlo Simulations',
    healthMode: 'worker',
    owner: 'providers',
  },
  {
    key: 'report',
    queueName: 'lp-report-generation',
    displayName: 'LP Report Generation',
    healthMode: 'worker',
    owner: 'providers',
  },
  {
    key: 'backtesting',
    queueName: 'backtesting-jobs',
    displayName: 'Backtesting Jobs',
    healthMode: 'worker',
    owner: 'providers',
  },
  {
    key: 'reserve-calc',
    queueName: 'reserve-calc',
    displayName: 'Reserve Calculations',
    healthMode: 'producer',
    owner: 'route',
    fundCalculationAuthority: 'authoritative',
  },
  {
    key: 'pacing-calc',
    queueName: 'pacing-calc',
    displayName: 'Pacing Calculations',
    healthMode: 'producer',
    owner: 'route',
    fundCalculationAuthority: 'authoritative',
  },
  {
    key: 'cohort-calc',
    queueName: 'cohort-calc',
    displayName: 'Cohort Calculations',
    healthMode: 'producer',
    owner: 'route',
    fundCalculationAuthority: 'experimental',
  },
  {
    key: 'economics-calc',
    queueName: 'economics-calc',
    displayName: 'GP Economics Calculations',
    healthMode: 'producer',
    owner: 'route',
    fundCalculationAuthority: 'experimental',
  },
] as const;

const queueCatalogByKey = new Map<QueueRegistryKey, QueueCatalogEntry>(
  QUEUE_CATALOG.map((entry) => [entry.key, entry])
);
const registeredRuntimes = new Map<QueueRegistryKey, RegisteredQueueRuntime>();

export function registerQueueRuntime(key: QueueRegistryKey, runtime: RegisteredQueueRuntime): void {
  if (!queueCatalogByKey.has(key)) {
    throw new Error(`Unknown queue registry key: ${key}`);
  }
  registeredRuntimes.set(key, runtime);
}

export function unregisterQueueRuntime(key: QueueRegistryKey): void {
  registeredRuntimes.delete(key);
}

export function getQueueCatalog(): readonly QueueCatalogEntry[] {
  return QUEUE_CATALOG;
}

export function getQueueCatalogEntry(key: QueueRegistryKey): QueueCatalogEntry {
  const entry = queueCatalogByKey.get(key);
  if (!entry) {
    throw new Error(`Unknown queue registry key: ${key}`);
  }
  return entry;
}

export function getRegisteredQueueRuntime(
  key: QueueRegistryKey
): RegisteredQueueRuntime | undefined {
  return registeredRuntimes.get(key);
}

export function getRegisteredQueueRuntimes(): ReadonlyMap<
  QueueRegistryKey,
  RegisteredQueueRuntime
> {
  return registeredRuntimes;
}

export function resetQueueRegistry(): void {
  registeredRuntimes.clear();
}
