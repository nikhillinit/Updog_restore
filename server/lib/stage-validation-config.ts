/**
 * Stage Validation Configuration System
 *
 * Provides per-endpoint validation mode control, write/read classification,
 * and percentage-based gradual rollout for stage validation enforcement.
 *
 * @author Claude Code
 * @version 3.0 (Enhanced for Phase 2.5+ rollout)
 */

import { createHash } from 'crypto';

export type Mode = 'off' | 'warn' | 'enforce';

/**
 * Stage validation configuration with granular control
 */
export interface StageValidationConfig {
  /** Default mode for endpoints not explicitly configured */
  defaultMode: Mode;

  /** Per-endpoint mode overrides (key: normalized route pattern) */
  endpointMode: Record<string, Mode>;

  /**
   * During Phase 2.5 database migration: enforce validation on writes only,
   * keep reads in warn mode. This prevents new invalid data entering the system
   * while migration is in progress.
   */
  enforceWriteOnly: boolean;

  /**
   * Percentage of traffic to enforce (0-100).
   * Uses consistent hashing per request ID for stable routing.
   * Allows gradual rollout: 10% → 25% → 50% → 100%
   */
  enforcementPercent: number;

  /**
   * Shadow/DRY-RUN mode: validate as if enforcing, but don't reject.
   * Emits "would_reject" metrics and X-Stage-Would-Reject header.
   * Allows measuring blast radius before actual enforcement.
   */
  dryRun: boolean;
}

/**
 * Write vs Read operation classification by endpoint
 *
 * - WRITE: Persists to database, mutations required
 * - READ: Pure computation or queries, no persistence
 *
 * This distinction is critical for Phase 2.5 where writes are enforced
 * during migration but reads remain in warn mode.
 */
export const ENDPOINT_OPERATION_TYPE: Record<string, 'write' | 'read'> = {
  // Portfolio strategies - WRITE (persists to DB)
  'POST /api/portfolio/strategies': 'write',
  'PUT /api/portfolio/strategies/:id': 'write',
  'PATCH /api/portfolio/strategies/:id': 'write',

  // Monte Carlo - READ (pure computation, no persistence)
  'POST /api/monte-carlo/simulate': 'read',

  // Fund companies query - READ (query only)
  'GET /api/funds/:fundId/companies': 'read',

  // Allocations - WRITE
  'POST /api/allocations': 'write',
  'PUT /api/allocations/:id': 'write',
  'PATCH /api/allocations/:id': 'write',
};

/**
 * Production configuration (Phase 2.5+ rollout)
 *
 * Example configuration for gradual rollout strategy:
 * - Phase 2.5: Enforce writes only during migration
 * - Phase 2.7: Shadow mode to measure blast radius
 * - Phase 3: Gradual enforcement 10% → 100%
 * - Phase 4: Full enforcement across all endpoints
 */
export const PRODUCTION_CONFIG: StageValidationConfig = {
  // Default to warn mode (safe)
  defaultMode: 'warn',

  // Per-endpoint overrides (Phase 3+)
  endpointMode: {
    '/api/portfolio/strategies': 'enforce', // Phase 3: Portfolio writes first
    '/api/monte-carlo/simulate': 'warn', // Phase 4: Monte Carlo later
    '/api/funds/:fundId/companies': 'warn', // Keep reads in warn
  },

  // Phase 2.5: Enforce writes only during migration
  enforceWriteOnly: process.env['ENFORCE_WRITE_ONLY'] === 'true',

  // Gradual rollout percentage (0-100)
  enforcementPercent: parseInt(process.env['ENFORCEMENT_PERCENT'] || '10', 10),

  // Shadow mode for measuring blast radius
  dryRun: process.env['STAGE_VALIDATION_DRY_RUN'] === 'true',
};

/**
 * Normalize route path to template form (remove IDs)
 *
 * Examples:
 * - /api/funds/123/companies → /api/funds/:fundId/companies
 * - /api/portfolio/strategies/456 → /api/portfolio/strategies/:id
 *
 * @param path Request path
 * @returns Normalized template path
 */
export function normalizeRoutePath(path: string): string {
  return path
    .replace(/\/\d+/g, '/:id') // Replace numeric IDs
    .replace(/:id\/companies/, ':fundId/companies'); // Fix fund-specific pattern
}

/**
 * Check if an endpoint operation is a write (persists data)
 *
 * @param method HTTP method
 * @param path Request path
 * @returns true if operation writes to database
 */
export function isWriteOperation(method: string, path: string): boolean {
  const key = `${method} ${normalizeRoutePath(path)}`;
  return ENDPOINT_OPERATION_TYPE[key] === 'write';
}

/**
 * Get effective validation mode for a request
 *
 * Takes into account:
 * - Per-endpoint overrides
 * - Write-only enforcement during migration
 * - Percentage-based gradual rollout
 * - DRY-RUN shadow mode
 *
 * @param method HTTP method
 * @param path Request path
 * @param requestId Unique request ID for consistent hashing
 * @param config Configuration object
 * @returns Effective mode and whether it's a dry-run
 */
export function getEffectiveMode(
  method: string,
  path: string,
  requestId: string,
  config: StageValidationConfig = PRODUCTION_CONFIG
): { mode: Mode; isDryRun: boolean } {
  const normalizedPath = normalizeRoutePath(path);
  const isWrite = isWriteOperation(method, path);

  // Get base mode (endpoint override or default)
  let mode = config.endpointMode[normalizedPath] || config.defaultMode;

  // Phase 2.5: Enforce writes only, keep reads in warn
  if (config.enforceWriteOnly) {
    if (isWrite && mode === 'warn') {
      mode = 'enforce'; // Upgrade writes to enforce
    } else if (!isWrite && mode === 'enforce') {
      mode = 'warn'; // Downgrade reads to warn
    }
  }

  // Percentage-based rollout (only affects enforcement)
  if (mode === 'enforce' && !shouldEnforceForRequest(requestId, config)) {
    mode = 'warn'; // Downgrade to warn if not in enforcement percentage
  }

  return {
    mode,
    isDryRun: config.dryRun && mode === 'warn',
  };
}

/**
 * Determine if a request should be enforced based on percentage rollout
 *
 * Uses consistent hashing (SHA-256) to ensure:
 * - Same request ID always gets same decision (stable)
 * - Even distribution across traffic
 * - No bias toward specific users/patterns
 *
 * @param requestId Unique request identifier
 * @param config Configuration with enforcementPercent
 * @returns true if request should be enforced
 */
function shouldEnforceForRequest(requestId: string, config: StageValidationConfig): boolean {
  const percent = Math.max(0, Math.min(100, config.enforcementPercent));

  // 0% = none enforced, 100% = all enforced
  if (percent === 0) return false;
  if (percent === 100) return true;

  // Consistent hashing using crypto (avoids collisions)
  const hash = createHash('sha256').update(requestId).digest();
  const bucket = hash.readUInt32BE(0) % 100;

  return bucket < percent;
}

/**
 * Staging configuration (for testing before prod rollout)
 */
export const STAGING_CONFIG: StageValidationConfig = {
  defaultMode: 'warn',
  endpointMode: {},
  enforceWriteOnly: false,
  enforcementPercent: 100, // Test with full enforcement
  dryRun: false,
};

/**
 * Development configuration (local testing)
 */
export const DEV_CONFIG: StageValidationConfig = {
  defaultMode: 'warn',
  endpointMode: {},
  enforceWriteOnly: false,
  enforcementPercent: 0,
  dryRun: true, // Always dry-run in dev
};

/**
 * Get configuration based on environment
 */
export function getConfig(): StageValidationConfig {
  const env = process.env['NODE_ENV'];

  switch (env) {
    case 'production':
      return PRODUCTION_CONFIG;
    case 'staging':
      return STAGING_CONFIG;
    case 'test':
      return { ...DEV_CONFIG, dryRun: false }; // No dry-run in tests
    default:
      return DEV_CONFIG;
  }
}
