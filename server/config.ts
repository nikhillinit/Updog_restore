import { z } from 'zod';

const bool = z.string().transform(v => v === "1" || v?.toLowerCase() === "true").or(z.boolean());

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  REDIS_URL: z.string().url().optional(),
  APP_VERSION: z.string().default(process.env.npm_package_version || '0.0.1'),
  
  // Auth
  JWT_ALG: z.enum(["HS256","RS256"]).default("HS256"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be ≥32 chars").optional(),
  JWT_ISSUER: z.string().default("updog"),
  JWT_AUDIENCE: z.string().default("updog-app"),
  JWT_JWKS_URL: z.string().url().optional(),

  // Feature flags
  DEMO_MODE: bool.default(false),
  REQUIRE_AUTH: bool.default(true),
  ENGINE_FAULT_RATE: z.coerce.number().min(0).max(1).default(0),

  // CSP
  CSP_REPORT_ONLY: bool.default(false),
});

export type AppConfig = z.infer<typeof Env> & { isDev: boolean; isProd: boolean; isTest: boolean };
let cache: AppConfig | null = null;

export function getConfig(force = false): AppConfig {
  if (cache && !force) return cache;
  const e = Env.parse(process.env);
  const cfg = { 
    ...e, 
    isDev: e.NODE_ENV === "development", 
    isProd: e.NODE_ENV === "production", 
    isTest: e.NODE_ENV === "test" 
  };
  
  // Validate JWT configuration
  if (cfg.JWT_ALG === "HS256" && !cfg.JWT_SECRET && !cfg.isTest) {
    throw new Error("JWT_ALG=HS256 requires JWT_SECRET (≥32 chars)");
  }
  if (cfg.JWT_ALG === "RS256" && !cfg.JWT_JWKS_URL) {
    throw new Error("JWT_ALG=RS256 requires JWT_JWKS_URL");
  }
  
  return (cache = cfg);
}

// Legacy export for compatibility
export const config: AppConfig = getConfig();
