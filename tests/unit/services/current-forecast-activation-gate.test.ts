/**
 * Task 13 activation-ready gate assertions (PLAN_61, falsifiable per 13.2).
 *
 * This file pins gate item 1: the global flag exists, defaults OFF in every
 * environment, and is never exposed to the client (the client reacts to the
 * dual-forecast response shape only). The remaining gate items are pinned
 * elsewhere and deliberately not duplicated here:
 * - held-state map + kill switch on both sides of cutover:
 *   tests/unit/services/current-forecast-calc-mode-resolver.test.ts
 * - PMC never invoked post-cutover at the consumer level:
 *   tests/unit/services/metrics-aggregator-dual-forecast.test.ts
 * - replay corpus green per the three D1 criteria:
 *   tests/unit/services/current-forecast-shadow-service.test.ts
 *
 * Actual flag and mode VALUES stay unchanged - this suite only proves the
 * dormant posture is what the plan says it is.
 */
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { parse } from 'yaml';

type FlagEntry = {
  default: boolean;
  description: string;
  owner: string;
  risk: string;
  exposeToClient: boolean;
  environments: Record<string, boolean>;
  dependencies: unknown[];
};

async function loadRegistry(): Promise<Record<string, FlagEntry>> {
  // The shared node setup mocks fs; go through the real module for this scan.
  const { readFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
  const raw = readFileSync(join(process.cwd(), 'flags', 'registry.yaml'), 'utf8');
  // Registry shape: { schema_version, flags: { <name>: entry }, deprecated }.
  return (parse(raw) as { flags: Record<string, FlagEntry> }).flags;
}

describe('current-forecast activation gate: flag posture', () => {
  it('enable_current_forecast_v2 exists, defaults off everywhere, and is server-only', async () => {
    const registry = await loadRegistry();
    const flag = registry['enable_current_forecast_v2'];

    expect(flag).toBeDefined();
    expect(flag?.default).toBe(false);
    expect(flag?.exposeToClient).toBe(false);
    expect(flag?.risk).toBe('high');
    expect(flag?.environments).toEqual({
      development: false,
      staging: false,
      production: false,
    });
  });
});
