import { z } from 'zod';

const Env = z
  .object({
    CB_CACHE_ENABLED: z
      .enum(['true', 'false'])
      .prefault('false')
      .transform((v) => v === 'true'),
    CB_HTTP_ENABLED: z
      .enum(['true', 'false'])
      .prefault('false')
      .transform((v) => v === 'true'),
    CB_DB_ENABLED: z
      .enum(['true', 'false'])
      .prefault('false')
      .transform((v) => v === 'true'),

    CB_CACHE_FAILURE_THRESHOLD: z.coerce.number().prefault(5),
    CB_CACHE_RESET_TIMEOUT_MS: z.coerce.number().prefault(10_000),
    CB_CACHE_OP_TIMEOUT_MS: z.coerce.number().prefault(350),
    CB_CACHE_SUCCESS_TO_CLOSE: z.coerce.number().prefault(2),
    CB_CACHE_HALF_OPEN_MAX_CONC: z.coerce.number().prefault(3),

    CB_HTTP_FAILURE_THRESHOLD: z.coerce.number().prefault(3),
    CB_HTTP_RESET_TIMEOUT_MS: z.coerce.number().prefault(5_000),
    CB_HTTP_OP_TIMEOUT_MS: z.coerce.number().prefault(500),
    CB_HTTP_SUCCESS_TO_CLOSE: z.coerce.number().prefault(2),
    CB_HTTP_HALF_OPEN_MAX_CONC: z.coerce.number().prefault(3),

    CB_DB_FAILURE_THRESHOLD: z.coerce.number().prefault(4),
    CB_DB_RESET_TIMEOUT_MS: z.coerce.number().prefault(8_000),
    CB_DB_OP_TIMEOUT_MS: z.coerce.number().prefault(400),
    CB_DB_MONITORING_PERIOD_MS: z.coerce.number().prefault(60_000),

    CB_ADAPTIVE_ENABLED: z
      .enum(['true', 'false'])
      .prefault('false')
      .transform((v) => v === 'true'),
    CB_ADAPTIVE_MIN: z.coerce.number().prefault(3),
    CB_ADAPTIVE_MAX: z.coerce.number().prefault(10),
    CB_ADAPTIVE_RATE: z.coerce.number().prefault(0.1),
  })
  .passthrough();

export const envCircuit = Env.parse(process.env);

export const flags = {
  cache: envCircuit.CB_CACHE_ENABLED,
  http: envCircuit.CB_HTTP_ENABLED,
  db: envCircuit.CB_DB_ENABLED,
};
