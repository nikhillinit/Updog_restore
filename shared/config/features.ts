/**
 * Feature Flags Configuration
 * Centralized feature toggles for gradual rollouts and A/B testing
 */
import { z } from 'zod';

// Define feature flag schema with descriptions
export const featureFlagsSchema = z.object({
  // Core Features
  HORIZON_QUARTERS: z.coerce.boolean().default(false).describe('Enable quarterly horizon calculations'),
  RESERVES_V1_1: z.coerce.boolean().default(false).describe('Use improved reserves algorithm v1.1'),
  CIRCUIT_BREAKER: z.coerce.boolean().default(true).describe('Enable circuit breaker for external services'),
  CHART_VREG: z.coerce.boolean().default(false).describe('Enable regression charts visualization'),
  
  // Performance Features
  QUERY_CACHE: z.coerce.boolean().default(true).describe('Enable query result caching'),
  PARALLEL_SIMULATIONS: z.coerce.boolean().default(false).describe('Run Monte Carlo simulations in parallel'),
  SMART_POOLING: z.coerce.boolean().default(true).describe('Use intelligent connection pooling'),
  
  // API Features
  API_VERSIONING: z.coerce.boolean().default(true).describe('Enable API versioning headers'),
  DEPRECATION_WARNINGS: z.coerce.boolean().default(true).describe('Show deprecation warnings for v1 API'),
  OPENAPI_DOCS: z.coerce.boolean().default(true).describe('Serve OpenAPI documentation'),
  RATE_LIMITING: z.coerce.boolean().default(true).describe('Enable rate limiting'),
  
  // Security Features
  IDEMPOTENCY: z.coerce.boolean().default(true).describe('Enable idempotency key support'),
  REQUEST_DEDUP: z.coerce.boolean().default(true).describe('Enable request deduplication'),
  SECURITY_HEADERS: z.coerce.boolean().default(true).describe('Apply security headers'),
  
  // Monitoring Features
  SLOW_QUERY_LOGGING: z.coerce.boolean().default(true).describe('Log slow database queries'),
  METRICS_COLLECTION: z.coerce.boolean().default(true).describe('Collect Prometheus metrics'),
  HEALTH_CHECKS: z.coerce.boolean().default(true).describe('Enable health check endpoints'),
  
  // Development Features
  DEBUG_MODE: z.coerce.boolean().default(false).describe('Enable debug logging'),
  MOCK_EXTERNAL_APIS: z.coerce.boolean().default(false).describe('Use mock external API responses'),
  PROPERTY_TESTS: z.coerce.boolean().default(false).describe('Run property-based tests'),
});

// Parse environment variables into feature flags
export const features = featureFlagsSchema.parse(process.env);

// Type for feature flags
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return features[flag] === true;
}

/**
 * Get feature flag value with fallback
 */
export function getFeatureFlag<K extends keyof FeatureFlags>(
  flag: K,
  fallback?: FeatureFlags[K]
): FeatureFlags[K] {
  return features[flag] ?? fallback;
}

/**
 * Override feature flags for testing
 */
export function overrideFeatures(overrides: Partial<FeatureFlags>): void {
  Object.assign(features, overrides);
}

/**
 * Reset feature flags to defaults
 */
export function resetFeatures(): void {
  Object.assign(features, featureFlagsSchema.parse({}));
}

/**
 * Get all feature flags as object
 */
export function getAllFeatures(): FeatureFlags {
  return { ...features };
}

/**
 * Feature flag groups for bulk operations
 */
export const featureGroups = {
  performance: [
    'QUERY_CACHE',
    'PARALLEL_SIMULATIONS',
    'SMART_POOLING',
  ] as const,
  
  security: [
    'IDEMPOTENCY',
    'REQUEST_DEDUP',
    'SECURITY_HEADERS',
  ] as const,
  
  monitoring: [
    'SLOW_QUERY_LOGGING',
    'METRICS_COLLECTION',
    'HEALTH_CHECKS',
  ] as const,
  
  api: [
    'API_VERSIONING',
    'DEPRECATION_WARNINGS',
    'OPENAPI_DOCS',
    'RATE_LIMITING',
  ] as const,
};

/**
 * Enable/disable feature group
 */
export function setFeatureGroup(
  group: keyof typeof featureGroups,
  enabled: boolean
): void {
  const flags = featureGroups[group];
  flags.forEach(flag => {
    (features as any)[flag] = enabled;
  });
}

// Export for use in other modules
export default features;