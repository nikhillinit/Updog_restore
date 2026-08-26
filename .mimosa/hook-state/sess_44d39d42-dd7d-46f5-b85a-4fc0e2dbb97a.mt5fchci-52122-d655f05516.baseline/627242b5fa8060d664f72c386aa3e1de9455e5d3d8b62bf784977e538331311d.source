import packageJson from '../package.json' with { type: 'json' };

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
export const VERSION = packageJson.version;

export interface ReleaseIdentity {
  version: string;
  commit: string;
  environment: string;
}

function firstNonEmptyEnvironmentValue(keys: readonly string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return 'local';
}

/**
 * Return release metadata shared by API and worker health surfaces.
 *
 * Provider precedence is deliberate: Vercel is the deployed API provider,
 * Railway is the deployed worker provider, and COMMIT_REF is the generic CI
 * fallback. Empty values are not identities and therefore fall through.
 */
export function getReleaseIdentity(): ReleaseIdentity {
  return {
    version: VERSION,
    commit: firstNonEmptyEnvironmentValue([
      'VERCEL_GIT_COMMIT_SHA',
      'RAILWAY_GIT_COMMIT_SHA',
      'COMMIT_REF',
    ]),
    environment: process.env['NODE_ENV']?.trim() || 'development',
  };
}

/**
 * Get full version info for diagnostics
 */
export function getVersionInfo() {
  const release = getReleaseIdentity();

  return {
    engine_version: ENGINE_VERSION,
    app_version: release.version,
    commit_sha: release.commit,
    node_version: process.version,
    environment: release.environment,
  };
}
