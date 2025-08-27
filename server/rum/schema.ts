/**
 * RUM (Real User Monitoring) Schema & Security
 * Day 2: Production-grade RUM security implementation
 * Features: Schema validation, normalization, sanitization
 */

import { z } from 'zod';

/**
 * v1 RUM beacon schema with strict validation
 * Version field enables future schema evolution
 */
export const RumBeaconV1 = z.object({
  v: z.literal(1),  // Schema version for future evolution
  cid: z.string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),  // Client ID - alphanumeric only
  t: z.number()
    .int()
    .nonnegative()
    .max(Date.now() + 60000),  // Timestamp - reject future times >1min
  route: z.string()
    .min(1)
    .max(256),  // Will be normalized server-side
  nav: z.enum(['load', 'route', 'soft']).optional(),  // Navigation type
  
  // Web Vitals metrics (milliseconds)
  lcp: z.number().min(0).max(60000).optional(),  // Largest Contentful Paint
  inp: z.number().min(0).max(60000).optional(),  // Interaction to Next Paint
  cls: z.number().min(0).max(5).optional(),      // Cumulative Layout Shift
  fcp: z.number().min(0).max(60000).optional(),  // First Contentful Paint
  ttfb: z.number().min(0).max(60000).optional(), // Time to First Byte
  
  // Device/context (optional)
  dpr: z.number().min(0.5).max(4).optional(),     // Device Pixel Ratio
  ect: z.enum(['slow-2g', '2g', '3g', '4g']).optional(),  // Connection type
  rtt: z.number().min(0).max(3000).optional(),    // Round Trip Time
}).strict();  // Reject any unknown fields

export type RumBeaconV1 = z.infer<typeof RumBeaconV1>;

/**
 * Sanitize numeric values to prevent cardinality explosion
 * Rounds to reasonable precision for histogram bucketing
 */
export function sanitizeRum(beacon: RumBeaconV1): RumBeaconV1 {
  return {
    ...beacon,
    // Round timing metrics to 10ms precision (reduces cardinality)
    lcp: beacon.lcp != null ? Math.round(beacon.lcp / 10) * 10 : undefined,
    inp: beacon.inp != null ? Math.round(beacon.inp / 10) * 10 : undefined,
    fcp: beacon.fcp != null ? Math.round(beacon.fcp / 10) * 10 : undefined,
    ttfb: beacon.ttfb != null ? Math.round(beacon.ttfb / 10) * 10 : undefined,
    
    // CLS to 3 decimal places (standard precision)
    cls: beacon.cls != null ? Math.round(beacon.cls * 1000) / 1000 : undefined,
    
    // DPR to 0.25 increments (1, 1.25, 1.5, 2, etc)
    dpr: beacon.dpr != null ? Math.round(beacon.dpr * 4) / 4 : undefined,
    
    // RTT to 50ms buckets
    rtt: beacon.rtt != null ? Math.round(beacon.rtt / 50) * 50 : undefined,
  };
}

/**
 * Normalize route paths to prevent infinite cardinality
 * Replaces dynamic segments with placeholders
 */
export function normalizeRoute(path: string): string {
  return path
    // Numeric IDs
    .replace(/\/\d+/g, '/:id')
    
    // UUIDs (standard format)
    .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/:uuid')
    
    // MongoDB ObjectIds (24 hex chars)
    .replace(/\/[a-f0-9]{24}(?=\/|$)/gi, '/:objid')
    
    // Short hashes (6-12 hex chars)
    .replace(/\/[a-f0-9]{6,12}(?=\/|$)/gi, '/:hash')
    
    // Email-like patterns
    .replace(/\/[^\/]*@[^\/]*\.[^\/]+/g, '/:email')
    
    // Query strings (remove entirely for route normalization)
    .replace(/\?.*$/, '')
    
    // Hash fragments
    .replace(/#.*$/, '')
    
    // Multiple slashes
    .replace(/\/+/g, '/')
    
    // Trailing slash
    .replace(/\/$/, '')
    
    // Length cap
    .slice(0, 128)
    
    // Default for empty
    || '/';
}

/**
 * Validate beacon timestamp is within acceptable window
 * Prevents replay attacks and clock skew issues
 */
export function isValidTimestamp(timestamp: number, maxAgeMs = 300000): boolean {
  const now = Date.now();
  const age = now - timestamp;
  
  // Reject if too old (default 5 minutes)
  if (age > maxAgeMs) return false;
  
  // Reject if from the future (allow 60s clock skew)
  if (age < -60000) return false;
  
  return true;
}

/**
 * Enhanced replay protection with strict 5-minute window
 */
export function enforceReplayWindow(timestamp: number): { valid: boolean; reason?: string } {
  const now = Date.now();
  const ageMs = now - timestamp;
  
  // Strict 5-minute window
  if (ageMs > 5 * 60_000) {
    return { valid: false, reason: 'stale_timestamp' };
  }
  
  // Reject future timestamps beyond 1 minute clock skew
  if (ageMs < -60_000) {
    return { valid: false, reason: 'future_timestamp' };
  }
  
  return { valid: true };
}

/**
 * Extract user agent classification for segmentation
 * Returns normalized device category
 */
export function classifyUserAgent(ua: string): 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown' {
  const lower = ua.toLowerCase();
  
  // Bot detection
  if (/bot|crawler|spider|scraper|curl|wget/i.test(lower)) {
    return 'bot';
  }
  
  // Mobile detection (order matters)
  if (/mobile|android|iphone/i.test(lower) && !/ipad|tablet/i.test(lower)) {
    return 'mobile';
  }
  
  // Tablet detection
  if (/ipad|tablet|kindle|silk/i.test(lower)) {
    return 'tablet';
  }
  
  // Desktop by elimination
  if (/windows|mac|linux|cros/i.test(lower)) {
    return 'desktop';
  }
  
  return 'unknown';
}

/**
 * Generate bucket key for rate limiting
 * Combines client ID with time window
 */
export function getRateLimitKey(cid: string, ip: string, windowMs = 60000): string {
  const window = Math.floor(Date.now() / windowMs);
  // Prefer CID for registered users, fallback to IP
  const identifier = cid !== 'unknown' ? `cid:${cid}` : `ip:${ip}`;
  return `rum:rl:${identifier}:${window}`;
}