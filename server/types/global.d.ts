/**
 * Server-side TypeScript global type declarations
 *
 * This file extends Node.js ProcessEnv with all server environment variables
 * discovered during TypeScript error analysis.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // Environment
    NODE_ENV: 'development' | 'test' | 'production'

    // Application
    PORT?: string
    HOST?: string
    HOSTNAME?: string
    npm_package_version?: string

    // Database
    DATABASE_URL?: string
    POSTGRES_URL?: string

    // Redis & Caching
    REDIS_URL?: string
    REDIS_CLUSTER?: string
    ENABLE_QUEUES?: string

    // Security & Auth
    HEALTH_KEY?: string
    SESSION_SECRET?: string
    JWT_SECRET?: string

    // External Services
    SENTRY_DSN?: string
    ANTHROPIC_API_KEY?: string
    OPENAI_API_KEY?: string
    GOOGLE_API_KEY?: string
    DEEPSEEK_API_KEY?: string
    CODACY_API_TOKEN?: string
    CODACY_PROJECT_TOKEN?: string

    // Feature Flags (server-side)
    ENABLE_OBSERVABILITY?: string
    ENABLE_METRICS?: string
    ENABLE_TRACING?: string

    // Development
    DEBUG?: string
    LOG_LEVEL?: string

    // CI/CD
    CI?: string
    VERCEL?: string
    VERCEL_ENV?: string

    // Build configuration
    BUILD_WITH_PREACT?: string
    SKIP_PREFLIGHT_CHECK?: string

    // Add additional server-only env vars as discovered
  }
}

export {}
