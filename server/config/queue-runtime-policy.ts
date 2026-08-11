/**
 * Queue process policy is deliberately isolated from canonical config loading.
 * Callers provide the runtime environment so policy can be evaluated before any
 * Redis or BullMQ side effects and without depending on dotenv load order.
 */
export interface QueueRuntimePolicyEnv {
  NODE_ENV?: 'development' | 'test' | 'staging' | 'production' | undefined;
  VERCEL?: string | undefined;
  VERCEL_ENV?: string | undefined;
  ENABLE_QUEUES?: string | undefined;
  ENABLE_IN_PROCESS_QUEUE_WORKERS?: string | undefined;
  REDIS_URL?: string | undefined;
  QUEUE_REDIS_URL?: string | undefined;
}

export interface QueueProcessPolicy {
  legacyProviderProducersEnabled: boolean;
  inProcessConsumersEnabled: boolean;
}

function isVercelRuntime(cfg: QueueRuntimePolicyEnv): boolean {
  return cfg.VERCEL === '1' || Boolean(cfg.VERCEL_ENV?.trim());
}

function queuesEnabled(cfg: QueueRuntimePolicyEnv): boolean {
  if (cfg.ENABLE_QUEUES !== '1') {
    return false;
  }

  const queueRedisUrl = cfg.QUEUE_REDIS_URL || cfg.REDIS_URL;
  return Boolean(queueRedisUrl && queueRedisUrl !== 'memory://');
}

function isLocalRuntime(cfg: QueueRuntimePolicyEnv): boolean {
  return cfg.NODE_ENV === 'development' || cfg.NODE_ENV === 'test';
}

/**
 * Resolves process-local queue construction permissions. This intentionally
 * excludes route-owned producer authorization, which is governed separately by
 * the queue catalog and route ownership.
 */
export function resolveQueueProcessPolicy(cfg: QueueRuntimePolicyEnv): QueueProcessPolicy {
  const localQueueRuntime = queuesEnabled(cfg) && isLocalRuntime(cfg) && !isVercelRuntime(cfg);

  return {
    legacyProviderProducersEnabled: localQueueRuntime,
    inProcessConsumersEnabled: localQueueRuntime && cfg.ENABLE_IN_PROCESS_QUEUE_WORKERS === '1',
  };
}

/**
 * Rejects legacy in-process BullMQ consumers outside local/test runtimes.
 * Dedicated worker entrypoints do not use this application-process policy.
 */
export function assertQueueRuntimePolicy(cfg: QueueRuntimePolicyEnv): void {
  if (cfg.ENABLE_IN_PROCESS_QUEUE_WORKERS !== '1') {
    return;
  }

  if (isVercelRuntime(cfg)) {
    throw new Error('In-process queue workers are not allowed in a Vercel runtime');
  }

  if (!isLocalRuntime(cfg)) {
    throw new Error(
      'In-process queue workers are only allowed when NODE_ENV is development or test'
    );
  }
}
