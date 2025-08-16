/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),
  REDIS_URL: z.string().url().optional().describe('Redis connection string for BullMQ'),
  PORT: z.coerce.number().int().positive().default(5000).describe('Server port'),
  SESSION_SECRET: z.string().min(32).optional().describe('Session secret for authentication'),
  
  // Observability
  ENABLE_METRICS: z.coerce.boolean().default(true).describe('Enable Prometheus metrics'),
  METRICS_PORT: z.coerce.number().int().positive().default(9090).describe('Metrics server port'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info').describe('Winston log level'),
  
  // Feature flags for managed services (Terraform integration)
  USE_MANAGED_PG: z.coerce.boolean().default(false).describe('Use managed PostgreSQL service'),
  USE_CONFLUENT: z.coerce.boolean().default(false).describe('Use Confluent Kafka'),
  USE_PINECONE: z.coerce.boolean().default(false).describe('Use Pinecone vector database'),
  
  // Security
  CORS_ORIGIN: z.string().optional().describe('CORS allowed origins'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000).describe('Rate limit window in ms'),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100).describe('Max requests per window'),
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
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
        if (err.code === 'invalid_type' && err.received === 'undefined') {
          const field = envSchema.shape[err.path[0] as keyof typeof envSchema.shape];
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
