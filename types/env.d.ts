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
  readonly VITE_APP_VERSION: string;
  readonly VITE_GIT_SHA: string;
  readonly VITE_BUILD_TIME: string;
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}