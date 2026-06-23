/**
 * Client feature flag definitions.
 *
 * Thin adapter over flags/registry.yaml generated output. Keep this surface
 * because client code imports ALL_FLAGS and expects an `enabled` boolean.
 */

import { z } from 'zod';
import { CLIENT_FLAG_KEYS, type ClientFlagKey } from '../generated/flag-types.js';
import { FLAG_DEFINITIONS } from '../generated/flag-defaults.js';

export const FeatureFlagSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.number().min(0).max(100).default(0),
  dependencies: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

function buildFeatureFlag(key: ClientFlagKey): FeatureFlag {
  const definition = FLAG_DEFINITIONS[key];

  return {
    key,
    name: key,
    description: definition.description,
    enabled: definition.default,
    rolloutPercentage: definition.rolloutPercentage ?? 0,
    dependencies: [...definition.dependencies],
    ...(definition.expiresAt ? { expiresAt: definition.expiresAt } : {}),
  };
}

export const ALL_FLAGS = Object.fromEntries(
  CLIENT_FLAG_KEYS.map((key) => [key, buildFeatureFlag(key)])
) as Record<ClientFlagKey, FeatureFlag>;

export type FlagKey = keyof typeof ALL_FLAGS;

/**
 * Check if flag is enabled, respecting dependencies.
 */
export function isFlagEnabled(flagKey: FlagKey, flagStates: Record<string, boolean>): boolean {
  const flag = ALL_FLAGS[flagKey];
  if (!flag) {
    return false;
  }

  if (flag.dependencies) {
    const allDepsEnabled = flag.dependencies.every((dep) => flagStates[dep] === true);
    if (!allDepsEnabled) {
      return false;
    }
  }

  if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
    return false;
  }

  return flagStates[flagKey] ?? flag.enabled;
}

export function shouldEnableForUser(
  flagKey: FlagKey,
  userId: string,
  flagStates: Record<string, boolean>
): boolean {
  if (!isFlagEnabled(flagKey, flagStates)) {
    return false;
  }

  const flag = ALL_FLAGS[flagKey];
  if (!flag) {
    return false;
  }

  if (flag.rolloutPercentage === 100) {
    return true;
  }

  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 100 < flag.rolloutPercentage;
}

export function validateFlagConfiguration(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  Object.entries(ALL_FLAGS).forEach(([key, flag]) => {
    if (flag.dependencies?.includes(key)) {
      errors.push(`Flag ${key} depends on itself`);
    }

    flag.dependencies?.forEach((dep) => {
      if (!(dep in ALL_FLAGS)) {
        errors.push(`Flag ${key} depends on non-existent flag ${dep}`);
      }
    });
  });

  return { valid: errors.length === 0, errors };
}
