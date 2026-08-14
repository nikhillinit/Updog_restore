import { describe, expect, it, vi } from 'vitest';

import { runPurge } from '../../../scripts/release/purge-canary-runs.mjs';
import { parseRedeliveryArgs } from '../../../scripts/release/redeliver-capital-call-outbox.mjs';
import { assertDemoSeedEnabled } from '../../../server/seed-demo-data.ts';
import { assertProvisionProdUsersMutationBlocked } from '../../../scripts/provision-prod-users.ts';

describe('production data dispatch block', () => {
  it('blocks canary purge before first database query', async () => {
    const client = { query: vi.fn() };

    await expect(runPurge(client, { execute: true })).rejects.toThrow(
      /production data mutation is mechanically blocked/i
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it('blocks outbox redelivery apply before database selection or update', () => {
    expect(() =>
      parseRedeliveryArgs([
        '--apply',
        '--id=11111111-1111-4111-8111-111111111111',
      ])
    ).toThrow(/production data mutation is mechanically blocked/i);
  });

  it('blocks production demo seed despite the legacy override', () => {
    expect(() =>
      assertDemoSeedEnabled({
        DEMO_SEED: '1',
        ALLOW_PRODUCTION_DEMO_SEED: '1',
        NODE_ENV: 'production',
      })
    ).toThrow(/production demo data mutation is mechanically blocked/i);
  });

  it('blocks production user provisioning before reading identity or database inputs', () => {
    expect(() => assertProvisionProdUsersMutationBlocked([])).toThrow(
      /production user mutation is mechanically blocked/i
    );
  });
});
