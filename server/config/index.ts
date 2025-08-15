/**
 * Environment Configuration with Zod Validation
 * Fail-fast on invalid configuration
 */

import { z } from 'zod';

const envSchema = z.object({
  // Core environment
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  
  // Database
  DATABASE_URL: z.string().min(1).default('postgresql://mock:mock@localhost:5432/mock'),
  
  // Cache & Queue - explicit scheme validation
  REDIS_URL: z.string().url().or(z.literal('memory://')).default('memory://'),
  
  // Security & CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
  BODY_LIMIT: z.string().default('10mb'),
  
  // Monitoring & Observability
  PROMETHEUS_URL: z.string().optional(),
  ERROR_TRACKING_DSN: z.string().optional(),
  
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
  HEALTH_KEY: z.string().optional(),
  SHUTDOWN_RETRY_AFTER_SECONDS: z.coerce.number().default(30),
  NATS_URL: z.string().optional(),
  
  // Release Information
  npm_package_version: z.string().optional(),
  RELEASE: z.string().optional(),
  GIT_SHA: z.string().optional(),
  APP_VERSION: z.string().default('dev'),
});

// Validate and export configuration with fail-fast behavior
export function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid configuration:', parsed.error.format());
    process.exit(1);
  }
  
  const config = parsed.data;
    
    // Additional validation for production
    if (config.NODE_ENV === 'production') {
      const requiredInProduction = [
        'DATABASE_URL',
        'REDIS_URL',
        'CORS_ORIGIN'
      ] as const;
      
      const missing = requiredInProduction.filter(key => 
        !process.env[key] || process.env[key]?.startsWith('mock')
      );
      
      if (missing.length > 0) {
        throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
      }
      
      // Validate Redis URL format in production
      if (config.REDIS_URL === 'memory://') {
        throw new Error('Redis memory cache not allowed in production');
      }
    }
    
    // Log configuration (redact sensitive values)
    const logConfig = {
      ...config,
      DATABASE_URL: config.DATABASE_URL.replace(/\/\/[^@]+@/, '//***:***@'),
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

export const config = loadEnv();

// Helper functions
export function isDevelopment() {
  return config.NODE_ENV === 'development';
}

export function isProduction() {
  return config.NODE_ENV === 'production';
}

export function isTest() {
  return config.NODE_ENV === 'test';
}

// Version information
export function getVersion() {
  return config.npm_package_version || config.RELEASE || config.GIT_SHA || 'dev';
}

// Default labels for metrics
export function getDefaultLabels() {
  return {
    service: 'fund-platform-api',
    version: getVersion(),
    environment: config.NODE_ENV
  };
}