import { z } from 'zod';

const Env = z.object({
  CB_CACHE_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  CB_HTTP_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  CB_DB_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),

  CB_CACHE_FAILURE_THRESHOLD: z.coerce.number().default(5),
  CB_CACHE_RESET_TIMEOUT_MS: z.coerce.number().default(10_000),
  CB_CACHE_OP_TIMEOUT_MS: z.coerce.number().default(350),
  CB_CACHE_SUCCESS_TO_CLOSE: z.coerce.number().default(2),
  CB_CACHE_HALF_OPEN_MAX_CONC: z.coerce.number().default(3),

  CB_HTTP_FAILURE_THRESHOLD: z.coerce.number().default(3),
  CB_HTTP_RESET_TIMEOUT_MS: z.coerce.number().default(5_000),
  CB_HTTP_OP_TIMEOUT_MS: z.coerce.number().default(500),
  CB_HTTP_SUCCESS_TO_CLOSE: z.coerce.number().default(2),
  CB_HTTP_HALF_OPEN_MAX_CONC: z.coerce.number().default(3),

  CB_DB_FAILURE_THRESHOLD: z.coerce.number().default(4),
  CB_DB_RESET_TIMEOUT_MS: z.coerce.number().default(8_000),
  CB_DB_OP_TIMEOUT_MS: z.coerce.number().default(400),
  CB_DB_MONITORING_PERIOD_MS: z.coerce.number().default(60_000),

  CB_ADAPTIVE_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  CB_ADAPTIVE_MIN: z.coerce.number().default(3),
  CB_ADAPTIVE_MAX: z.coerce.number().default(10),
  CB_ADAPTIVE_RATE: z.coerce.number().default(0.1),
}).passthrough();

export const envCircuit = Env.parse(process.env);

export const flags = {
  cache: envCircuit.CB_CACHE_ENABLED,
  http: envCircuit.CB_HTTP_ENABLED,
  db: envCircuit.CB_DB_ENABLED,
};
