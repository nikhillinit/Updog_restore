import { describe, expect, it } from 'vitest';

import {
  assertSourceIdentity,
  computePlanDigest,
  parseProvisioningMode,
} from '../../../scripts/provision-prod-users.ts';

const sha = 'a'.repeat(40);

describe('governed production user provisioning gates', () => {
  it('parses exactly one explicit mode', () => {
    expect(parseProvisioningMode(['--dry-run'])).toBe('dry-run');
    expect(parseProvisioningMode(['--apply', '--expected-plan-digest=x'])).toBe('apply');
  });

  it('requires the exact, clean, live-main source for apply', () => {
    const clean = { expectedSha: sha, headSha: sha, liveMainSha: sha, dirty: false };
    expect(() => assertSourceIdentity(clean)).not.toThrow();
    expect(() => assertSourceIdentity({ ...clean, expectedSha: undefined })).toThrow(
      /EXPECTED_SHA/
    );
    expect(() => assertSourceIdentity({ ...clean, expectedSha: 'abc' })).toThrow(/EXPECTED_SHA/);
    expect(() => assertSourceIdentity({ ...clean, headSha: 'b'.repeat(40) })).toThrow(/HEAD/);
    expect(() => assertSourceIdentity({ ...clean, liveMainSha: 'b'.repeat(40) })).toThrow(
      /origin main/
    );
    expect(() => assertSourceIdentity({ ...clean, dirty: true })).toThrow(/uncommitted/);
  });

  it('binds the plan digest to source, identity file, target, and current rows', () => {
    const plan = {
      headSha: sha,
      identityFileSha256: 'f'.repeat(64),
      targetFingerprint: 'e'.repeat(64),
      current: [
        {
          id: 3,
          username: 'partner',
          role: 'admin',
          isActive: true,
          isReleaseCanaryPrincipal: false,
          updatedAt: '2026-07-12 18:50:21.927+00',
          fundIds: [2],
        },
      ],
    };
    const digest = computePlanDigest(plan);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(computePlanDigest(structuredClone(plan))).toBe(digest);
    for (const changed of [
      { ...plan, headSha: 'b'.repeat(40) },
      { ...plan, identityFileSha256: '0'.repeat(64) },
      { ...plan, targetFingerprint: '0'.repeat(64) },
      { ...plan, current: [{ ...plan.current[0]!, updatedAt: '2026-09-29 00:00:00+00' }] },
      { ...plan, current: [{ ...plan.current[0]!, fundIds: [] }] },
      { ...plan, current: [] },
    ]) {
      expect(computePlanDigest(changed)).not.toBe(digest);
    }
  });
});
