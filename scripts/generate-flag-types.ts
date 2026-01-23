#!/usr/bin/env tsx
/**
 * Feature Flag Type Generator
 *
 * Generates TypeScript types and defaults from flags/registry.yaml
 * Run: npm run flags:generate
 *
 * Output:
 * - shared/generated/flag-types.ts
 * - shared/generated/flag-defaults.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(PROJECT_ROOT, 'flags', 'registry.yaml');
const OUTPUT_DIR = join(PROJECT_ROOT, 'shared', 'generated');

interface FlagDefinition {
  default: boolean;
  description: string;
  owner: string;
  risk: 'low' | 'medium' | 'high';
  exposeToClient: boolean;
  adminOnly?: boolean;
  environments: {
    development: boolean;
    staging: boolean;
    production: boolean;
  };
  dependencies: string[];
  expiresAt: string | null;
  aliases?: string[];
  rolloutPercentage?: number;
}

interface FlagRegistry {
  schema_version: string;
  flags: Record<string, FlagDefinition>;
  deprecated: Array<{
    key: string;
    reason: string;
    removeBy: string;
  }>;
}

function generateFlagTypes(registry: FlagRegistry): string {
  const flagKeys = Object.keys(registry.flags);
  const clientFlags = Object.entries(registry.flags)
    .filter(([_, def]) => def.exposeToClient)
    .map(([key]) => key);
  const serverOnlyFlags = Object.entries(registry.flags)
    .filter(([_, def]) => !def.exposeToClient)
    .map(([key]) => key);
  const adminFlags = Object.entries(registry.flags)
    .filter(([_, def]) => def.adminOnly)
    .map(([key]) => key);

  return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Generated from: flags/registry.yaml
 * Generated at: ${new Date().toISOString()}
 *
 * Run \`npm run flags:generate\` to regenerate
 */

/**
 * All available feature flag keys
 */
export type FlagKey =
${flagKeys.map(k => `  | '${k}'`).join('\n')};

/**
 * Flags safe to expose to client
 */
export type ClientFlagKey =
${clientFlags.map(k => `  | '${k}'`).join('\n')};

/**
 * Server-only flags (not exposed to client)
 */
export type ServerOnlyFlagKey =
${serverOnlyFlags.map(k => `  | '${k}'`).join('\n')};

/**
 * Admin flags (no localStorage override)
 */
export type AdminFlagKey =
${adminFlags.map(k => `  | '${k}'`).join('\n')};

/**
 * Flag risk levels
 */
export type FlagRisk = 'low' | 'medium' | 'high';

/**
 * Flag definition interface
 */
export interface FlagDefinition {
  default: boolean;
  description: string;
  owner: string;
  risk: FlagRisk;
  exposeToClient: boolean;
  adminOnly?: boolean;
  environments: {
    development: boolean;
    staging: boolean;
    production: boolean;
  };
  dependencies: FlagKey[];
  expiresAt: string | null;
  aliases?: string[];
  rolloutPercentage?: number;
}

/**
 * Type-safe flag record
 */
export type FlagRecord = Record<FlagKey, boolean>;

/**
 * Client-safe flag record
 */
export type ClientFlagRecord = Record<ClientFlagKey, boolean>;

/**
 * Array of all flag keys
 */
export const ALL_FLAG_KEYS: readonly FlagKey[] = [
${flagKeys.map(k => `  '${k}',`).join('\n')}
] as const;

/**
 * Array of client-safe flag keys
 */
export const CLIENT_FLAG_KEYS: readonly ClientFlagKey[] = [
${clientFlags.map(k => `  '${k}',`).join('\n')}
] as const;

/**
 * Array of admin flag keys (no localStorage override)
 */
export const ADMIN_FLAG_KEYS: readonly AdminFlagKey[] = [
${adminFlags.map(k => `  '${k}',`).join('\n')}
] as const;

/**
 * Check if a key is a valid flag key
 */
export function isFlagKey(key: string): key is FlagKey {
  return ALL_FLAG_KEYS.includes(key as FlagKey);
}

/**
 * Check if a flag is client-safe
 */
export function isClientFlag(key: FlagKey): key is ClientFlagKey {
  return CLIENT_FLAG_KEYS.includes(key as ClientFlagKey);
}

/**
 * Check if a flag is admin-only (no localStorage override)
 */
export function isAdminFlag(key: FlagKey): key is AdminFlagKey {
  return ADMIN_FLAG_KEYS.includes(key as AdminFlagKey);
}
`;
}

function generateFlagDefaults(registry: FlagRegistry): string {
  const entries = Object.entries(registry.flags);
  const env = process.env['NODE_ENV'] || 'development';

  return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Generated from: flags/registry.yaml
 * Generated at: ${new Date().toISOString()}
 *
 * Run \`npm run flags:generate\` to regenerate
 */

import type { FlagKey, FlagDefinition, FlagRecord } from './flag-types.js';

/**
 * Complete flag definitions
 */
export const FLAG_DEFINITIONS: Record<FlagKey, FlagDefinition> = {
${entries.map(([key, def]) => `  '${key}': {
    default: ${def.default},
    description: '${def.description.replace(/'/g, "\\'")}',
    owner: '${def.owner}',
    risk: '${def.risk}',
    exposeToClient: ${def.exposeToClient},
    ${def.adminOnly ? `adminOnly: true,` : ''}
    environments: {
      development: ${def.environments.development},
      staging: ${def.environments.staging},
      production: ${def.environments.production},
    },
    dependencies: [${def.dependencies.map(d => `'${d}'`).join(', ')}],
    expiresAt: ${def.expiresAt ? `'${def.expiresAt}'` : 'null'},
    ${def.aliases ? `aliases: [${def.aliases.map(a => `'${a}'`).join(', ')}],` : ''}
    ${def.rolloutPercentage !== undefined ? `rolloutPercentage: ${def.rolloutPercentage},` : ''}
  },`).join('\n')}
};

/**
 * Default flag values (from registry)
 */
export const FLAG_DEFAULTS: FlagRecord = {
${entries.map(([key, def]) => `  '${key}': ${def.default},`).join('\n')}
};

/**
 * Environment-specific defaults
 * @param env - Environment name (development, staging, production)
 */
export function getEnvironmentDefaults(env: 'development' | 'staging' | 'production'): FlagRecord {
  const defaults: Partial<FlagRecord> = {};
  for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
    defaults[key as FlagKey] = def.environments[env];
  }
  return defaults as FlagRecord;
}

/**
 * Get flag definition by key
 */
export function getFlagDefinition(key: FlagKey): FlagDefinition {
  return FLAG_DEFINITIONS[key];
}

/**
 * Get flag dependencies
 */
export function getFlagDependencies(key: FlagKey): FlagKey[] {
  return FLAG_DEFINITIONS[key].dependencies;
}

/**
 * Check if flag is expired
 */
export function isFlagExpired(key: FlagKey): boolean {
  const def = FLAG_DEFINITIONS[key];
  if (!def.expiresAt) return false;
  return new Date(def.expiresAt) < new Date();
}

/**
 * Resolve flag with dependencies
 * Returns true only if flag AND all dependencies are enabled
 */
export function resolveFlagWithDependencies(
  key: FlagKey,
  flagStates: Partial<FlagRecord>
): boolean {
  const def = FLAG_DEFINITIONS[key];

  // Check if flag itself is enabled
  const flagValue = flagStates[key] ?? def.default;
  if (!flagValue) return false;

  // Check all dependencies
  for (const dep of def.dependencies) {
    if (!resolveFlagWithDependencies(dep, flagStates)) {
      return false;
    }
  }

  return true;
}

/**
 * Legacy alias mapping (for migration)
 */
export const FLAG_ALIASES: Record<string, FlagKey> = {
${entries
  .filter(([_, def]) => def.aliases && def.aliases.length > 0)
  .flatMap(([key, def]) => def.aliases!.map(alias => `  '${alias}': '${key}',`))
  .join('\n')}
};

/**
 * Resolve legacy alias to canonical key
 */
export function resolveAlias(aliasOrKey: string): FlagKey | undefined {
  if (aliasOrKey in FLAG_ALIASES) {
    return FLAG_ALIASES[aliasOrKey];
  }
  if (aliasOrKey in FLAG_DEFINITIONS) {
    return aliasOrKey as FlagKey;
  }
  return undefined;
}
`;
}

function main() {
  console.log('Reading flag registry...');
  const registryContent = readFileSync(REGISTRY_PATH, 'utf-8');
  const registry = parse(registryContent) as FlagRegistry;

  console.log(`Found ${Object.keys(registry.flags).length} flags`);
  console.log(`Found ${registry.deprecated.length} deprecated flags`);

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate types
  console.log('Generating flag-types.ts...');
  const typesContent = generateFlagTypes(registry);
  writeFileSync(join(OUTPUT_DIR, 'flag-types.ts'), typesContent);

  // Generate defaults
  console.log('Generating flag-defaults.ts...');
  const defaultsContent = generateFlagDefaults(registry);
  writeFileSync(join(OUTPUT_DIR, 'flag-defaults.ts'), defaultsContent);

  console.log('Done! Generated:');
  console.log('  - shared/generated/flag-types.ts');
  console.log('  - shared/generated/flag-defaults.ts');
}

main();
