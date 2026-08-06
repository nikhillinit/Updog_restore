import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  invokeVercelFunction,
  workerConsumerIsHealthy,
} from '../../../audit/surface-contract-matrix/scripts/boot-proof.mjs';

const fixture = (name: string) => path.join(process.cwd(), 'tests/unit/audit/fixtures', name);

describe('surface contract matrix boot proof completion gates', () => {
  it('requires Vercel handlers to complete an acceptable response', async () => {
    await expect(invokeVercelFunction({
      name: 'api/completing',
      entry: fixture('completing-vercel-handler.mjs'),
      responseTimeout: 100,
    })).resolves.toMatchObject({ ok: true });
    await expect(invokeVercelFunction({
      name: 'api/incomplete',
      entry: fixture('incomplete-vercel-handler.mjs'),
      responseTimeout: 25,
    })).resolves.toMatchObject({ ok: false });
  });

  it('rejects empty or non-running worker consumer health payloads', () => {
    expect(workerConsumerIsHealthy({ health: { workers: [] }, stats: { workers: [] } })).toBe(false);
    expect(workerConsumerIsHealthy({
      health: { workers: [{ name: 'fund-scenario-calc', status: 'unhealthy', isRunning: false }] },
      stats: { workers: [{ name: 'fund-scenario-calc', processed: 0, errors: 0 }] },
    })).toBe(false);
    expect(workerConsumerIsHealthy({
      health: { workers: [{ name: 'fund-scenario-calc', status: 'healthy', isRunning: true }] },
      stats: { workers: [{ name: 'fund-scenario-calc', processed: 0, errors: 0 }] },
    })).toBe(true);
  });
});
