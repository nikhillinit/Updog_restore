import type { Queue, Worker } from 'bullmq';
import {
  getCalculationEngineDescriptorByQueueKey,
  type FundCalculationAuthority,
  type FundCalculationQueueKey,
} from '@shared/contracts/fund-authoritative-calculations.contract';

export type QueueRegistryKey =
  | 'simulation'
  | 'report'
  | 'backtesting'
  | 'reserve-calc'
  | 'fund-scenario-calc'
  | 'pacing-calc'
  | 'cohort-calc'
  | 'economics-calc'
  | 'capital-call-status'
  | 'scenario-generation'
  | 'lp-view-refresh';

export type QueueHealthMode = 'worker' | 'producer';
export type QueueOwner = 'providers' | 'route';
export type ApiProcessRuntimeRequirement = 'legacy-provider' | 'in-process-consumer';
export type QueueProductionDisposition =
  | { mode: 'railway-worker'; deployment: 'railway-worker-fund-scenario-calc' }
  | { mode: 'railway-worker'; deployment: 'railway-worker-capital-call-status' }
  | { mode: 'inline-fallback' }
  | { mode: 'local-only' }
  | { mode: 'quarantined' };

export interface QueueCatalogEntry {
  key: QueueRegistryKey;
  queueName: string;
  displayName: string;
  healthMode: QueueHealthMode;
  owner: QueueOwner;
  apiProcessRuntimeRequirement?: ApiProcessRuntimeRequirement;
  productionDisposition: QueueProductionDisposition;
  quarantined?: boolean;
  fundCalculationAuthority?: FundCalculationAuthority;
}

export interface RegisteredQueueRuntime {
  getQueue: () => Queue | null;
  getWorker?: () => Worker | null;
  isInitialized: () => boolean;
  healthMode?: QueueHealthMode;
  close?: () => Promise<void>;
}

function authorityForCalculationQueue(queueKey: FundCalculationQueueKey): FundCalculationAuthority {
  return getCalculationEngineDescriptorByQueueKey(queueKey).authority;
}

export const QUEUE_CATALOG: readonly QueueCatalogEntry[] = [
  {
    key: 'simulation',
    queueName: 'monte-carlo-simulations',
    displayName: 'Monte Carlo Simulations',
    healthMode: 'worker',
    owner: 'providers',
    apiProcessRuntimeRequirement: 'legacy-provider',
    productionDisposition: { mode: 'local-only' },
  },
  {
    key: 'report',
    queueName: 'lp-report-generation',
    displayName: 'LP Report Generation',
    healthMode: 'worker',
    owner: 'providers',
    apiProcessRuntimeRequirement: 'legacy-provider',
    productionDisposition: { mode: 'local-only' },
  },
  {
    key: 'backtesting',
    queueName: 'backtesting-jobs',
    displayName: 'Backtesting Jobs',
    healthMode: 'worker',
    owner: 'providers',
    apiProcessRuntimeRequirement: 'legacy-provider',
    productionDisposition: { mode: 'local-only' },
  },
  {
    key: 'reserve-calc',
    queueName: 'reserve-calc',
    displayName: 'Reserve Calculations',
    healthMode: 'producer',
    owner: 'route',
    productionDisposition: { mode: 'inline-fallback' },
    fundCalculationAuthority: authorityForCalculationQueue('reserve-calc'),
  },
  {
    key: 'fund-scenario-calc',
    queueName: 'fund-scenario-calc',
    displayName: 'Fund Scenario Calculations',
    healthMode: 'producer',
    owner: 'route',
    apiProcessRuntimeRequirement: 'in-process-consumer',
    productionDisposition: {
      mode: 'railway-worker',
      deployment: 'railway-worker-fund-scenario-calc',
    },
    fundCalculationAuthority: 'experimental',
  },
  {
    key: 'pacing-calc',
    queueName: 'pacing-calc',
    displayName: 'Pacing Calculations',
    healthMode: 'producer',
    owner: 'route',
    productionDisposition: { mode: 'inline-fallback' },
    fundCalculationAuthority: authorityForCalculationQueue('pacing-calc'),
  },
  {
    key: 'cohort-calc',
    queueName: 'cohort-calc',
    displayName: 'Cohort Calculations',
    healthMode: 'producer',
    owner: 'route',
    productionDisposition: { mode: 'local-only' },
    fundCalculationAuthority: authorityForCalculationQueue('cohort-calc'),
  },
  {
    key: 'capital-call-status',
    queueName: 'capital-call-status',
    displayName: 'Capital Call Status Notifications',
    healthMode: 'worker',
    owner: 'providers',
    productionDisposition: {
      mode: 'railway-worker',
      deployment: 'railway-worker-capital-call-status',
    },
  },
  {
    key: 'economics-calc',
    queueName: 'economics-calc',
    displayName: 'GP Economics Calculations',
    healthMode: 'producer',
    owner: 'route',
    productionDisposition: { mode: 'quarantined' },
    quarantined: true,
    fundCalculationAuthority: authorityForCalculationQueue('economics-calc'),
  },
  {
    key: 'scenario-generation',
    queueName: 'scenario-generation',
    displayName: 'Scenario Generation',
    healthMode: 'worker',
    owner: 'providers',
    productionDisposition: { mode: 'local-only' },
  },
  {
    key: 'lp-view-refresh',
    queueName: 'lp-view-refresh',
    displayName: 'LP View Refresh',
    healthMode: 'worker',
    owner: 'providers',
    productionDisposition: { mode: 'quarantined' },
    quarantined: true,
  },
] as const;

const queueCatalogByKey = new Map<QueueRegistryKey, QueueCatalogEntry>(
  QUEUE_CATALOG.map((entry) => [entry.key, entry])
);
type RuntimeComponents = Partial<Record<QueueHealthMode, RegisteredQueueRuntime>>;
const runtimeComponents = new Map<QueueRegistryKey, RuntimeComponents>();

export function registerQueueRuntime(key: QueueRegistryKey, runtime: RegisteredQueueRuntime): void {
  if (!queueCatalogByKey.has(key)) {
    throw new Error(`Unknown queue registry key: ${key}`);
  }

  const healthMode = runtime.healthMode ?? getQueueCatalogEntry(key).healthMode;
  const components = runtimeComponents.get(key) ?? {};
  components[healthMode] = runtime;
  runtimeComponents.set(key, components);
}

export function unregisterQueueRuntime(
  key: QueueRegistryKey,
  healthMode?: QueueHealthMode,
  expectedRuntime?: RegisteredQueueRuntime
): boolean {
  if (!healthMode) {
    if (!expectedRuntime) {
      return runtimeComponents.delete(key);
    }

    const components = runtimeComponents.get(key);
    if (!components) return false;
    let removed = false;
    for (const mode of ['worker', 'producer'] as const) {
      if (components[mode] === expectedRuntime) {
        delete components[mode];
        removed = true;
      }
    }
    if (!components.worker && !components.producer) runtimeComponents.delete(key);
    return removed;
  }

  const components = runtimeComponents.get(key);
  if (!components) return false;
  if (expectedRuntime && components[healthMode] !== expectedRuntime) return false;
  delete components[healthMode];
  if (!components.worker && !components.producer) {
    runtimeComponents.delete(key);
  }
  return true;
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
  const components = runtimeComponents.get(key);
  if (!components) return undefined;
  const workerRuntime = components.worker;
  const producerRuntime = components.producer;
  const primary = workerRuntime ?? producerRuntime;
  if (!primary) return undefined;

  if (!workerRuntime || !producerRuntime) return primary;

  return {
    getQueue: producerRuntime.getQueue,
    ...(workerRuntime.getWorker ? { getWorker: workerRuntime.getWorker } : {}),
    isInitialized: () => workerRuntime.isInitialized() && producerRuntime.isInitialized(),
    healthMode: 'worker',
    close: async () => {
      await Promise.allSettled([workerRuntime.close?.(), producerRuntime.close?.()]);
      unregisterQueueRuntime(key, 'worker', workerRuntime);
      unregisterQueueRuntime(key, 'producer', producerRuntime);
    },
  };
}

export function getRegisteredQueueRuntimes(): ReadonlyMap<
  QueueRegistryKey,
  RegisteredQueueRuntime
> {
  return new Map(
    [...runtimeComponents.keys()].flatMap((key) => {
      const runtime = getRegisteredQueueRuntime(key);
      return runtime ? [[key, runtime] as const] : [];
    })
  );
}

export async function closeRegisteredQueueRuntimes(): Promise<void> {
  const captured = [...runtimeComponents.entries()].flatMap(([key, components]) =>
    (['worker', 'producer'] as const).flatMap((healthMode) => {
      const runtime = components[healthMode];
      return runtime ? [{ key, healthMode, runtime }] : [];
    })
  );

  await Promise.allSettled(captured.map(({ runtime }) => runtime.close?.()));
  for (const { key, healthMode, runtime } of captured) {
    unregisterQueueRuntime(key, healthMode, runtime);
  }
}

export function resetQueueRegistry(): void {
  runtimeComponents.clear();
}
