import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import {
  normalizeCanonicalHostname,
  resolveCanonicalPromotion,
  verifyCanonicalPromotion,
} from '../../../scripts/release/verify-vercel-promotion.mjs';

const CANONICAL_HOSTNAME = 'fund.presson.vc';
const EXPECTED_DEPLOYMENT_ID = 'dpl_staged';
const EXPECTED_PROJECT_ID = 'prj_protected';
const EXPECTED_SHA = 'a'.repeat(40);

function deployment(overrides = {}) {
  const result = {
    id: EXPECTED_DEPLOYMENT_ID,
    projectId: EXPECTED_PROJECT_ID,
    readyState: 'READY',
    target: 'production',
    meta: { githubCommitSha: EXPECTED_SHA },
    aliases: [CANONICAL_HOSTNAME],
    ...overrides,
  };
  if (Object.prototype.hasOwnProperty.call(overrides, 'meta')) result.meta = overrides.meta;
  return result;
}

function verify(overrides = {}) {
  return verifyCanonicalPromotion({
    canonicalHostname: CANONICAL_HOSTNAME,
    deployment: deployment(),
    expectedDeploymentId: EXPECTED_DEPLOYMENT_ID,
    expectedProjectId: EXPECTED_PROJECT_ID,
    expectedSha: EXPECTED_SHA,
    ...overrides,
  });
}

describe('verify-vercel-promotion', () => {
  it('resolves promotion from the live alias list when the record field is stale', { retry: 0 }, async () => {
    const requested = [];
    const fetchImpl = async (url, init) => {
      requested.push(url);
      expect(init.headers.Authorization).toBe('Bearer vercel-token');
      const body = url.includes('/v2/deployments/dpl_staged/aliases')
        ? { aliases: [{ alias: 'project-team.vercel.app' }, { alias: CANONICAL_HOSTNAME }] }
        : { ...deployment(), aliases: undefined, alias: ['project-team.vercel.app'] };
      if (body.aliases === undefined) delete body.aliases;
      return { ok: true, json: async () => body };
    };
    await expect(resolveCanonicalPromotion({
      canonicalHostname: CANONICAL_HOSTNAME,
      expectedDeploymentId: EXPECTED_DEPLOYMENT_ID,
      expectedProjectId: EXPECTED_PROJECT_ID,
      expectedSha: EXPECTED_SHA,
      token: 'vercel-token',
      organizationId: 'team_protected',
      fetchImpl,
    })).resolves.toEqual({
      productionUrl: `https://${CANONICAL_HOSTNAME}`,
      deploymentId: EXPECTED_DEPLOYMENT_ID,
    });
    expect(requested).toEqual([
      `https://api.vercel.com/v13/deployments/${CANONICAL_HOSTNAME}?teamId=team_protected`,
      'https://api.vercel.com/v2/deployments/dpl_staged/aliases?teamId=team_protected',
    ]);
  });

  it('normalizes a bare lowercase canonical hostname', { retry: 0 }, () => {
    expect(normalizeCanonicalHostname(CANONICAL_HOSTNAME)).toBe(CANONICAL_HOSTNAME);
  });

  it.each([
    ['HTTPS scheme', 'https://fund.presson.vc'],
    ['HTTP scheme', 'http://fund.presson.vc'],
    ['port', 'fund.presson.vc:443'],
    ['path', 'fund.presson.vc/health'],
    ['query', 'fund.presson.vc?check=1'],
    ['fragment', 'fund.presson.vc#canonical'],
    ['wildcard', '*.presson.vc'],
    ['credentials', 'user:password@fund.presson.vc'],
    ['uppercase', 'FUND.PRESSON.VC'],
    ['surrounding whitespace', ' fund.presson.vc'],
    ['malformed labels', 'fund..presson.vc'],
  ])('rejects malformed canonical hostname: %s', { retry: 0 }, (_label, value) => {
    expect(() => normalizeCanonicalHostname(value)).toThrow(/canonical hostname/i);
  });

  it('accepts exact canonical promotion identity', { retry: 0 }, () => {
    expect(verify()).toBeUndefined();
  });

  it.each([
    ['deployment ID', { deployment: deployment({ id: 'dpl_other' }) }, 'deployment ID'],
    ['project ID', { deployment: deployment({ projectId: 'prj_other' }) }, 'project'],
    ['ready state', { deployment: deployment({ readyState: 'BUILDING' }) }, 'READY'],
    ['target', { deployment: deployment({ target: 'preview' }) }, 'production'],
    [
      'commit SHA',
      { deployment: deployment({ meta: { githubCommitSha: 'b'.repeat(40) } }) },
      'SHA',
    ],
    ['canonical alias', { deployment: deployment({ aliases: ['other.presson.vc'] }) }, 'alias'],
  ])('rejects each individual promotion mismatch: %s', { retry: 0 }, (_label, overrides, message) => {
    expect(() => verify(overrides)).toThrow(new RegExp(message, 'i'));
  });

  it.each([
    ['missing deployment', undefined],
    ['null deployment', null],
    ['array deployment', []],
    ['missing metadata', deployment({ meta: undefined })],
    ['array metadata', deployment({ meta: [] })],
    ['empty deployment ID', deployment({ id: '' })],
    ['non-array aliases', deployment({ aliases: CANONICAL_HOSTNAME })],
    ['non-string alias', deployment({ aliases: [42] })],
  ])('rejects malformed Vercel response: %s', { retry: 0 }, (_label, malformed) => {
    expect(() => verify({ deployment: malformed })).toThrow(/Vercel|deployment|alias/i);
  });

  it('rejects response API errors instead of treating them as deployment data', { retry: 0 }, () => {
    expect(() => verify({ deployment: { error: { code: 'not_found' } } })).toThrow(
      /Vercel|deployment/i
    );
  });

  it('rejects a deployment missing both alias fields', { retry: 0 }, () => {
    const response = deployment();
    delete response.aliases;
    delete response.alias;
    expect(() => verify({ deployment: response })).toThrow(/aliases are missing/i);
  });

  it('rejects duplicate conflicting alias fields', { retry: 0 }, () => {
    expect(() => verify({
      deployment: deployment({
        alias: [CANONICAL_HOSTNAME],
        aliases: ['other.presson.vc'],
      }),
    })).toThrow(/alias/i);
  });

  it('accepts Vercel singular alias response field', { retry: 0 }, () => {
    const response = deployment();
    delete response.aliases;
    response.alias = [CANONICAL_HOSTNAME];
    expect(verify({ deployment: response })).toBeUndefined();
  });

  it('requires exact alias spelling', { retry: 0 }, () => {
    expect(() => verify({
      deployment: deployment({ aliases: ['FUND.PRESSON.VC'] }),
    })).toThrow(/alias/i);
  });

  it('keeps polling implementation separate from pure verification and bounded', { retry: 0 }, async () => {
    const source = await readFile(
      new URL('../../../scripts/release/verify-vercel-promotion.mjs', import.meta.url),
      'utf8'
    );
    expect(source).toContain('performance.now()');
    expect(source).toContain('MAX_ATTEMPTS = 60');
    expect(source).toContain('OVERALL_DEADLINE_MS = 5 * 60 * 1000');
    expect(source).toContain('REQUEST_TIMEOUT_MS = 4_000');
    expect(source).toContain('MAX_WAIT_MS = 5_000');
    expect(source).toContain('Math.min(MAX_WAIT_MS, remaining)');
    expect(source).toContain('requestTimeout');
    expect(source).not.toContain('console.log(JSON.stringify');
  });
});
