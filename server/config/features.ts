/**
 * Feature flags (side-effect free).
 * Normalizes boolean env flags and exposes a clean FEATURES bag.
 */
export function flag(v: unknown, def = false): boolean {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s);
}

export const FEATURES = {
  // Redis enabled whenever not explicitly in memory mode
  redis: (process.env['REDIS_URL'] ?? 'memory://') !== 'memory://',
  queues: flag(process.env['ENABLE_QUEUES'], false),
  queueDashboard: flag(process.env['ENABLE_QUEUE_DASHBOARD'], false),
  sessions: flag(process.env['ENABLE_SESSIONS'], false),
  metrics: flag(process.env['ENABLE_METRICS'], true), // enable locally by default
  statGating: flag(process.env['ENABLE_STAT_GATING'], false),
  // Portfolio Intelligence API - graduated from WIP (default: false for safe rollout)
  portfolioIntelligence: flag(process.env['ENABLE_PORTFOLIO_INTELLIGENCE'], false),
};

export type FeatureBag = typeof FEATURES;

// ---------------------------------------------------------------------------
// Queue system config -- single source of truth for "are queues enabled?"
// ---------------------------------------------------------------------------

export interface QueueSystemConfig {
  enabled: boolean;
  /** Resolved URL (QUEUE_REDIS_URL ?? REDIS_URL), null when disabled */
  queueRedisUrl: string | null;
  /** Human-readable reason when disabled */
  reason: string;
}

export interface QueueConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  tls?: Record<string, never>;
}

interface QueueConfigEnv {
  ENABLE_QUEUES?: string | undefined;
  REDIS_URL?: string | undefined;
  QUEUE_REDIS_URL?: string | undefined;
}

/**
 * Determine queue system availability from environment.
 * Encapsulates: ENABLE_QUEUES === '1' && REDIS_URL !== 'memory://' && REDIS_URL is present.
 * Resolves QUEUE_REDIS_URL ?? REDIS_URL in one place.
 */
export function getQueueConfig(cfg?: QueueConfigEnv): QueueSystemConfig {
  const env = cfg ?? {
    ENABLE_QUEUES: process.env['ENABLE_QUEUES'],
    REDIS_URL: process.env['REDIS_URL'],
    QUEUE_REDIS_URL: process.env['QUEUE_REDIS_URL'],
  };

  if (env.ENABLE_QUEUES !== '1') {
    return { enabled: false, queueRedisUrl: null, reason: 'ENABLE_QUEUES not set to 1' };
  }

  const resolvedUrl = env.QUEUE_REDIS_URL || env.REDIS_URL;
  if (!resolvedUrl || resolvedUrl === 'memory://') {
    return {
      enabled: false,
      queueRedisUrl: null,
      reason: 'QUEUE_REDIS_URL/REDIS_URL is memory:// or missing',
    };
  }

  return { enabled: true, queueRedisUrl: resolvedUrl, reason: 'ok' };
}

export function getQueueConnectionOptions(cfg?: QueueConfigEnv): QueueConnectionOptions | null {
  const queueConfig = getQueueConfig(cfg);
  if (!queueConfig.enabled || !queueConfig.queueRedisUrl) {
    return null;
  }

  const parsedUrl = new URL(queueConfig.queueRedisUrl);
  if (parsedUrl.protocol !== 'redis:' && parsedUrl.protocol !== 'rediss:') {
    throw new Error(`Unsupported queue Redis protocol: ${parsedUrl.protocol}`);
  }

  const dbSegment = parsedUrl.pathname.replace(/^\/+/, '');
  let db: number | undefined;
  if (dbSegment) {
    const parsedDb = Number(dbSegment);
    if (!Number.isInteger(parsedDb) || parsedDb < 0) {
      throw new Error(`Invalid queue Redis database index: ${parsedUrl.pathname}`);
    }
    db = parsedDb;
  }

  return {
    host: parsedUrl.hostname || 'localhost',
    port: parsedUrl.port ? Number(parsedUrl.port) : 6379,
    ...(parsedUrl.password ? { password: parsedUrl.password } : {}),
    ...(parsedUrl.username ? { username: parsedUrl.username } : {}),
    ...(db !== undefined ? { db } : {}),
    ...(parsedUrl.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
