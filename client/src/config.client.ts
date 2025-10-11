import { z } from 'zod';

const EnvSchema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_WIZARD_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const clientEnv = Object.freeze(EnvSchema.parse(import.meta.env));
export type ClientEnv = typeof clientEnv;
