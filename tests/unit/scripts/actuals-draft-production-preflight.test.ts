import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessActualsDraftProductionPreflight } from '../../../scripts/release/actuals-draft-production-preflight';
import type { ActualsMigrationPreflightInput } from '../../../shared/contracts/schema-reconcile-receipt-v1.contract';
const { collect } = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock('../../../scripts/release/actuals-migration-preflight', () => ({
  collectActualsMigrationPreflight: collect,
}));
const ready = {
  migration: {
    tag: '0056_actuals_draft_revisions',
    idx: 57,
    when: 1788825600000,
    hash: '94fd8537ee7afbee9f0d5b19bfa9cfd78263096c89ee4ef0ae015ad268ed04cf',
  },
  targetFingerprint: 'd'.repeat(64),
  preState: {
    baselineKind: 'canonical',
    state: 'ready',
    appliedTargetCount: 0,
    lastAppliedTag: '0055_current_forecast_recompute_commands',
  },
  postState: 'ready',
  applied: false,
};
const input: ActualsMigrationPreflightInput = {
  mode: 'apply-actuals-draft-0056',
  repository: 'owner/repo',
  candidateSha: 'a'.repeat(40),
  runId: '123',
  runAttempt: 1,
  databaseUrl: 'postgresql://operator:private-password@example.invalid/updog',
  provider: {
    projectId: 'project',
    branchId: 'branch',
    endpointId: 'endpoint',
    databaseName: 'updog',
    roleName: 'operator',
  },
};
const credentials = { githubToken: 'private-github', neonApiKey: 'private-neon' };
const report = { binding: { targetFingerprint: ready.targetFingerprint }, evaluation: 'blocked' };
beforeEach(() => {
  collect.mockReset();
  collect.mockResolvedValue(report);
});
describe('0056 production preflight adapter', () => {
  it('binds the existing read-only result to authenticated collection', async () => {
    await expect(assessActualsDraftProductionPreflight(ready, input, credentials)).resolves.toBe(
      report
    );
    expect(collect).toHaveBeenCalledWith(input, credentials);
  });
  it.each([
    {},
    { ...ready, applied: true, postState: 'complete' },
    { ...ready, ownerApproved: true },
  ])('refuses non-read-only or caller-asserted result %# before collection', async (raw) => {
    await expect(assessActualsDraftProductionPreflight(raw, input, credentials)).rejects.toThrow();
    expect(collect).not.toHaveBeenCalled();
  });
  it('refuses cross-mode evidence before collection', async () => {
    await expect(
      assessActualsDraftProductionPreflight(
        ready,
        { ...input, mode: 'apply-actuals-restatement-0057' },
        credentials
      )
    ).rejects.toThrow();
    expect(collect).not.toHaveBeenCalled();
  });
  it('refuses mismatched before-state target binding', async () => {
    collect.mockResolvedValue({ ...report, binding: { targetFingerprint: 'f'.repeat(64) } });
    await expect(assessActualsDraftProductionPreflight(ready, input, credentials)).rejects.toThrow(
      'before-state target differs'
    );
  });
});
