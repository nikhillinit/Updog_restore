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
  redis: (process.env.REDIS_URL ?? 'memory://') !== 'memory://',
  queues: flag(process.env.ENABLE_QUEUES, false),
  sessions: flag(process.env.ENABLE_SESSIONS, false),
  metrics: flag(process.env.ENABLE_METRICS, true), // enable locally by default
  statGating: flag(process.env.ENABLE_STAT_GATING, false),
};

export type FeatureBag = typeof FEATURES;