/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  REDIS_URL: z.string().url().optional(),
  APP_VERSION: z.string().default(process.env.npm_package_version || '0.0.1')
});

export type AppConfig = z.infer<typeof Env>;

export const config: AppConfig = Env.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  CLIENT_URL: process.env.CLIENT_URL,
  REDIS_URL: process.env.REDIS_URL,
  APP_VERSION: process.env.APP_VERSION
});
