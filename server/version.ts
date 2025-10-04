/**
 * Engine Version
 *
 * Single source of truth for the fund calculation engine version.
 * Increment this when calculation logic changes in a breaking way.
 *
 * Format: MAJOR.MINOR.PATCH
 * - MAJOR: Breaking changes to calculation logic or output format
 * - MINOR: New features, backward-compatible
 * - PATCH: Bug fixes, no logic changes
 *
 * Used in:
 * - /healthz endpoint
 * - CSV lineage (engine_version field)
 * - API responses
 */
export const ENGINE_VERSION = '1.0.0';

/**
 * Get full version info for diagnostics
 */
export function getVersionInfo() {
  return {
    engine_version: ENGINE_VERSION,
    app_version: process.env.npm_package_version || ENGINE_VERSION,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || 'local',
    node_version: process.version,
    environment: process.env.NODE_ENV || 'development',
  };
}
