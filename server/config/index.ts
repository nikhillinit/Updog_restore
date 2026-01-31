/**
 * Environment Configuration with Zod Validation
 * Fail-fast on invalid configuration
 */

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { assertSecureURL, validateCORSOrigins } from '../lib/url-security.js';

const bool = z
  .string()
  .transform((value) => value === '1' || value.toLowerCase() === 'true')
  .or(z.boolean());

// Preserve explicitly-set PORT before loading .env (integration tests use ephemeral ports)
const explicitPort = process.env.PORT;
const explicitPortMarker = process.env._EXPLICIT_PORT;
const explicitNodeEnv = process.env.NODE_ENV;
const explicitNodeEnvMarker = process.env._EXPLICIT_NODE_ENV;

// TEMP FIX: Windows system has NODE_ENV=production set globally, override it
const shouldOverrideEnv = true;
// Load .env file; allow opt-in overriding via DOTENV_OVERRIDE
loadDotenv({ override: shouldOverrideEnv });

// Restore explicitly-set PORT if .env tried to override it
// This prevents integration tests from being forced to use .env's PORT
if (explicitPortMarker && explicitPort !== process.env.PORT) {
  process.env.PORT = explicitPort;
}
// Restore explicitly-set NODE_ENV if .env tried to override it
// This prevents integration tests from being forced into dev mode
if (explicitNodeEnvMarker && explicitNodeEnv !== process.env.NODE_ENV) {
  process.env.NODE_ENV = explicitNodeEnv;
}

const envSchema = z.object({
  // Core environment
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  // Allow port 0 (ephemeral) in test mode for CI isolation
  PORT: z.preprocess((val) => Number(val), z.number().int().min(0).default(5000)),

  // Database (optional in memory mode)
  DATABASE_URL: z.string().min(1).default('postgresql://mock:mock@localhost:5432/mock').optional(),

  // Cache & Queue - explicit scheme validation
  REDIS_URL: z.string().url().or(z.literal('memory://')).default('memory://'),
  RATE_LIMIT_REDIS_URL: z.string().url().or(z.literal('memory://')).optional(),
  QUEUE_REDIS_URL: z.string().url().or(z.literal('memory://')).optional(),
  SESSION_REDIS_URL: z.string().url().or(z.literal('memory://')).optional(),
  ENABLE_QUEUES: z.enum(['0', '1']).default('0'),

  // Security & CORS
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
  BODY_LIMIT: z.string().default('10mb'),
  CSP_REPORT_ONLY: bool.default(false),
  SESSION_SECRET: z.string().min(32).optional(),
  JWT_SECRET: z.string().min(32).optional(),

  // Monitoring & Observability
  PROMETHEUS_URL: z.string().optional(),
  ERROR_TRACKING_DSN: z.string().optional(),
  METRICS_KEY: z.string().min(16).optional(),

  // Deployment & Circuit Breaker
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().default(3),
  CIRCUIT_BREAKER_RESET_TIMEOUT: z.coerce.number().default(3600000), // 1 hour

  // SLO Configuration
  SLO_ERROR_BUDGET: z.coerce.number().default(0.001), // 99.9% SLO
  SLO_SHORT_WINDOW: z.coerce.number().default(3600000), // 1 hour
  SLO_MEDIUM_WINDOW: z.coerce.number().default(21600000), // 6 hours
  SLO_LONG_WINDOW: z.coerce.number().default(86400000), // 24 hours

  // Deployment Thresholds
  DEPLOY_ERROR_THRESHOLD: z.coerce.number().default(0.01),
  DEPLOY_P99_THRESHOLD: z.coerce.number().default(1000),
  DEPLOY_MEMORY_THRESHOLD: z.coerce.number().default(0.8),
  DEPLOY_CPU_THRESHOLD: z.coerce.number().default(0.7),

  // Optional Services
  HEALTH_KEY: z.string().min(16).optional(),
  SHUTDOWN_RETRY_AFTER_SECONDS: z.coerce.number().default(30),
  NATS_URL: z.string().optional(),

  // Worker Configuration
  WORKER_TYPE: z.enum(['reserve', 'pacing', 'cohort', 'report']).optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  // Release Information
  npm_package_version: z.string().optional(),
  RELEASE: z.string().optional(),
  GIT_SHA: z.string().optional(),
  APP_VERSION: z.string().default('dev'),

  // Application Defaults (previously hardcoded)
  DEFAULT_FUND_ID: z.coerce.number().int().positive().default(1),
  DEFAULT_USER_ID: z.coerce.number().int().positive().default(1),
  DEFAULT_FUND_SIZE: z.coerce.number().positive().default(50000000), // $50M
  TARGET_PORTFOLIO_SIZE: z.coerce.number().int().positive().default(30), // 30 companies

  // Monte Carlo Settings
  MONTE_CARLO_DEFAULT_RUNS: z.coerce.number().int().min(100).max(100000).default(10000),
  MONTE_CARLO_BATCH_SIZE: z.coerce.number().int().min(100).max(10000).default(1000),
  MONTE_CARLO_TIME_HORIZON_YEARS: z.coerce.number().min(1).max(20).default(8),

  // API/Processing Timeouts
  API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  STREAM_BUFFER_SIZE_BYTES: z.coerce.number().int().positive().default(10485760), // 10MB

  // Time Period Settings (for calculations)
  PERIOD_DAYS_MONTH: z.coerce.number().int().positive().default(30),
  PERIOD_DAYS_YEAR: z.coerce.number().positive().default(365.25),
});

// Validate and export configuration with fail-fast behavior
export function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[config] Invalid configuration:', parsed.error.format());
    throw new Error(`Invalid configuration: ${parsed.error.message}`);
  }

  const config = parsed.data;

  console.log(
    `[config] NODE_ENV detected: ${config.NODE_ENV} (from process.env: ${process.env['NODE_ENV']})`
  );

  // Additional validation for production
  if (config.NODE_ENV === 'production') {
    console.log('[config] Running production environment validation...');

    // Required configuration
    const requiredInProduction = [
      'DATABASE_URL',
      'REDIS_URL',
      'CORS_ORIGIN',
      'SESSION_SECRET',
      'HEALTH_KEY',
      'METRICS_KEY',
    ] as const;

    const missing = requiredInProduction.filter(
      (key) => !process.env[key] || process.env[key]?.startsWith('mock')
    );

    if (missing.length > 0) {
      console.error(`❌ Missing required production configuration: ${missing.join(', ')}`);
      throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
    }

    // Validate Redis URL format in production
    if (config.REDIS_URL === 'memory://') {
      console.error('❌ Redis memory cache not allowed in production');
      throw new Error('Redis memory cache not allowed in production');
    }

    // Validate secret strength
    const secrets = {
      SESSION_SECRET: config.SESSION_SECRET,
      JWT_SECRET: config.JWT_SECRET,
      HEALTH_KEY: config.HEALTH_KEY,
      METRICS_KEY: config.METRICS_KEY,
    };

    for (const [key, value] of Object.entries(secrets)) {
      if (value && value.length < 32) {
        console.error(
          `❌ ${key} must be at least 32 characters in production (current: ${value.length})`
        );
        throw new Error(`${key} must be at least 32 characters in production`);
      }

      // Check for weak patterns
      if (
        value &&
        (value === 'password' ||
          value === 'secret' ||
          value === '12345' ||
          value.toLowerCase().includes('test') ||
          value.toLowerCase().includes('dev'))
      ) {
        console.error(`❌ ${key} contains weak pattern - use strong random value`);
        throw new Error(`${key} contains weak pattern - use strong random value`);
      }
    }

    // Validate database URL doesn't use default credentials
    if (
      config.DATABASE_URL &&
      (config.DATABASE_URL.includes('postgres:postgres') ||
        config.DATABASE_URL.includes('user:password'))
    ) {
      console.error('❌ Database URL contains default credentials');
      throw new Error('Database URL contains default credentials - use secure credentials');
    }

    // Validate CORS origin is specific in production
    if (config.CORS_ORIGIN.includes('localhost') || config.CORS_ORIGIN === '*') {
      console.error(
        '❌ CORS_ORIGIN must be specific production domains, not localhost or wildcard'
      );
      throw new Error('CORS_ORIGIN must be specific production domains');
    }

    // Validate CORS origins use HTTPS
    try {
      validateCORSOrigins(config.CORS_ORIGIN, config.NODE_ENV);
    } catch (error) {
      console.error('❌ CORS origin security validation failed:', error);
      throw error;
    }

    // Validate external service URLs use HTTPS
    const urlsToValidate = [
      { url: config.PROMETHEUS_URL, context: 'PROMETHEUS_URL' },
      { url: config.ERROR_TRACKING_DSN, context: 'ERROR_TRACKING_DSN' },
    ].filter(({ url }) => url); // Only validate if defined

    for (const { url, context } of urlsToValidate) {
      try {
        assertSecureURL(url!, context, config.NODE_ENV);
      } catch (error) {
        console.error(`❌ ${context} security validation failed:`, error);
        throw error;
      }
    }

    console.log('✅ Production environment validation passed');
  }

  // Staging validation
  if (config.NODE_ENV === 'staging') {
    console.log('[config] Running staging environment validation...');

    const requiredInStaging = ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET'] as const;

    const missing = requiredInStaging.filter(
      (key) => !process.env[key] || process.env[key]?.startsWith('mock')
    );

    if (missing.length > 0) {
      console.warn(`⚠️  Missing recommended staging configuration: ${missing.join(', ')}`);
    }

    console.log('✅ Staging environment validation passed');
  }

  // Log configuration (redact sensitive values)
  const logConfig = {
    ...config,
    DATABASE_URL: config.DATABASE_URL?.replace(/\/\/[^@]+@/, '//***:***@') ?? '',
    REDIS_URL: config.REDIS_URL.startsWith('redis://') ? 'redis://***' : config.REDIS_URL,
    ERROR_TRACKING_DSN: config.ERROR_TRACKING_DSN ? '***' : undefined,
    HEALTH_KEY: config.HEALTH_KEY ? '***' : undefined,
  };

  console.log(`[config] Environment: ${config.NODE_ENV}`);
  if (config.NODE_ENV === 'development') {
    console.log('[config] Development configuration loaded:', logConfig);
  }

  return config;
}

// Lazy-loaded config to avoid import-time side effects (critical for Vercel Preview)
let _cachedConfig: ReturnType<typeof loadEnv> | null = null;

export function getConfig() {
  if (!_cachedConfig) {
    _cachedConfig = loadEnv();
  }
  return _cachedConfig;
}

// Legacy export for backwards compatibility - use getConfig() in new code
// This getter ensures config is lazily loaded on first access
export const config = new Proxy({} as ReturnType<typeof loadEnv>, {
  get(_target, prop) {
    return getConfig()[prop as keyof ReturnType<typeof loadEnv>];
  },
});

// Helper functions - use lazy getter to avoid import-time evaluation
export function isDevelopment() {
  return getConfig().NODE_ENV === 'development';
}

export function isProduction() {
  return getConfig().NODE_ENV === 'production';
}

export function isTest() {
  return getConfig().NODE_ENV === 'test';
}

// Version information
export function getVersion() {
  const cfg = getConfig();
  return cfg.npm_package_version || cfg.RELEASE || cfg.GIT_SHA || 'dev';
}

// Default labels for metrics
export function getDefaultLabels() {
  const cfg = getConfig();
  return {
    service: 'fund-platform-api',
    version: getVersion(),
    environment: cfg.NODE_ENV,
  };
}
