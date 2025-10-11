import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  API_PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const serverEnv = Object.freeze(EnvSchema.parse(process.env));

export type ServerEnv = typeof serverEnv;
