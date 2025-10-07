/**
 * Global type definitions for environment variables
 * This eliminates TS4111 errors and allows dot notation access
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // Core environment
    NODE_ENV?: 'development' | 'test' | 'production';
    
    // API & Frontend URLs
    FRONTEND_URL?: string;
    VITE_API_BASE_URL?: string;
    
    // Database
    DATABASE_URL?: string;
    
    // Redis/Cache
    REDIS_URL?: string;
    UPSTASH_REDIS_URL?: string;
    UPSTASH_REDIS_TOKEN?: string;
    
    // Monitoring & Alerts
    SLACK_WEBHOOK_URL?: string;
    SLACK_TOKEN?: string;
    SLACK_CHANNEL?: string;
    
    // Build & Deployment
    GITHUB_SHA?: string;
    GITHUB_TOKEN?: string;
    VERCEL_URL?: string;
    BUILD_WITH_PREACT?: '1' | '0' | 'true' | 'false';
    VITE_SENTRY_DSN?: string;
    
    // Security
    SESSION_SECRET?: string;
    JWT_SECRET?: string;
    
    // Feature Flags
    ENABLE_QUEUES?: string;
    ENABLE_METRICS?: string;
    ENABLE_DEBUG?: string;
    
    // External Services
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    
    // Performance
    MAX_CONCURRENT_CALCULATIONS?: string;
    CACHE_TTL?: string;
    
    // Ports
    PORT?: string;
    METRICS_PORT?: string;
  }
}

// Extend the Vite environment variables
interface ImportMetaEnv {
  // Base Vite environment variables
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SSR: boolean;

  // Custom app environment variables
  readonly VITE_APP_VERSION: string;
  readonly VITE_GIT_SHA: string;
  readonly VITE_BUILD_TIME: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ENV?: string;
  readonly VITE_NEW_SELECTORS?: string;
  readonly VITE_WIZARD_DEBUG?: string;
  readonly VITE_NEW_IA?: string;
  readonly VITE_ENABLE_SELECTOR_KPIS?: string;
  readonly VITE_ENABLE_MODELING_WIZARD?: string;
  readonly VITE_ENABLE_OPERATIONS_HUB?: string;
  readonly VITE_ENABLE_LP_REPORTING?: string;
  readonly DEMO_MODE?: string;

  // Support dynamic feature flags AND general string indexing
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}