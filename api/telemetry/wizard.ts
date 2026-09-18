import type { VercelRequest, VercelResponse } from '../_types';

// Simple rate limiting for MVP
const PAYLOAD_LIMIT = 10_000; // 10KB
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const MAX_REQUESTS = 60; // 1 per second average
const MAX_RATE_LIMIT_KEYS = 1_000;
const rateLimiter = new Map<string, { timestamps: number[]; lastSeen: number }>();

const TELEMETRY_TYPES = new Set(['step_guard_redirect', 'step_loaded', 'wizard_error']);

function stringField(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length <= maxLength ? value : undefined;
}

export function sanitizeWizardTelemetry(body: unknown): Record<string, string | number> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const type = stringField(input['type'], 64);
  if (!type || !TELEMETRY_TYPES.has(type)) return null;

  const output: Record<string, string | number> = { type };
  const strings = [['step', 64]] as const;
  for (const [key, maxLength] of strings) {
    const value = stringField(input[key], maxLength);
    if (value !== undefined) output[key] = value;
  }
  for (const key of ['attemptedStep', 'ttfmp', 'timestamp'] as const) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) output[key] = value;
  }
  return output;
}

export function resetWizardTelemetryRateLimiter(): void {
  rateLimiter.clear();
}

export function getWizardTelemetryRateLimiterSize(): number {
  return rateLimiter.size;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Basic rate limiting
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket?.remoteAddress ||
    'unknown';

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  for (const [key, entry] of rateLimiter) {
    if (entry.lastSeen <= windowStart) rateLimiter.delete(key);
  }
  if (!rateLimiter.has(ip) && rateLimiter.size >= MAX_RATE_LIMIT_KEYS) {
    const oldestKey = rateLimiter.keys().next().value as string | undefined;
    if (oldestKey) rateLimiter.delete(oldestKey);
  }
  const recentRequests = (rateLimiter.get(ip)?.timestamps || []).filter((t) => t > windowStart);

  if (recentRequests.length >= MAX_REQUESTS) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  recentRequests.push(now);
  rateLimiter.set(ip, { timestamps: recentRequests, lastSeen: now });

  try {
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (bodyStr.length > PAYLOAD_LIMIT) {
      return res.status(413).json({ error: 'payload_too_large' });
    }
    const body: unknown =
      typeof req.body === 'string' ? (JSON.parse(req.body) as unknown) : (req.body ?? {});
    const telemetry = sanitizeWizardTelemetry(body);
    if (!telemetry) return res.status(400).json({ error: 'bad_request' });
    console.warn('[wizard-telemetry]', {
      ...telemetry,
      buildId: process.env['VERCEL_GIT_COMMIT_SHA'],
      ts: new Date().toISOString(),
    });
    res.status(204).end();
  } catch {
    // Keep error response minimal
    res.status(400).json({ error: 'bad_request' });
  }
}
