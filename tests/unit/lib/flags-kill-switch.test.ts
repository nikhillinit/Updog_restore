import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/db', () => ({ db: {} }));
vi.mock('../../../server/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { activateKillSwitch, getFlags } from '../../../server/lib/flags';

describe('flags kill switch', () => {
  afterEach(() => {
    delete process.env['FLAGS_DISABLED_ALL'];
  });

  it('disables every flag once activated at runtime, not only at import', async () => {
    activateKillSwitch();

    const snapshot = await getFlags();

    expect(snapshot.flags).toEqual({});
  });
});
