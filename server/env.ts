import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).prefault('development'),
  DATABASE_URL: z.string().url().optional().describe('PostgreSQL connection string'),
  NEON_DATABASE_URL: z.string().url().optional().describe('Neon PostgreSQL connection string'),
  ALLOW_MEMORY_STORAGE: z.coerce
    .boolean()
    .prefault(false)
    .describe('Allow explicit in-memory storage mode when no database URL is configured'),
  REDIS_URL: z.string().url().optional().describe('Redis connection string for BullMQ'),
  PORT: z.coerce.number().int().positive().prefault(5000).describe('Server port'),
  SESSION_SECRET: z.string().min(32).optional().describe('Session secret for authentication'),

  // Observability
  ENABLE_METRICS: z.coerce.boolean().prefault(true).describe('Enable Prometheus metrics'),
  METRICS_PORT: z.coerce.number().int().positive().prefault(9090).describe('Metrics server port'),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug'])
    .prefault('info')
    .describe('Winston log level'),

  // Feature flags for managed services (Terraform integration)
  USE_MANAGED_PG: z.coerce.boolean().prefault(false).describe('Use managed PostgreSQL service'),
  USE_CONFLUENT: z.coerce.boolean().prefault(false).describe('Use Confluent Kafka'),
  USE_PINECONE: z.coerce.boolean().prefault(false).describe('Use Pinecone vector database'),

  // Security
  CORS_ORIGIN: z.string().optional().describe('CORS allowed origins'),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .prefault(900000)
    .describe('Rate limit window in ms'),
  RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .prefault(100)
    .describe('Max requests per window'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function validateEnv(): Env {
  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.issues.forEach((err: z.ZodIssue) => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
        if (
          err.code === 'invalid_type' &&
          typeof err.path[0] === 'string' &&
          process.env[err.path[0]] === undefined
        ) {
          const field = envSchema.shape[err.path[0]! as keyof typeof envSchema.shape];
          if (field && 'description' in field && field.description) {
            console.error(`    Description: ${field.description}`);
          }
        }
      });
      process.exit(1);
    }
    throw error;
  }
}

export function getEnv(): Env {
  if (!env) {
    env = validateEnv();
  }
  return env;
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isTest(): boolean {
  return getEnv().NODE_ENV === 'test';
}
