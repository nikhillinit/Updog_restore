import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertFundIdsExist,
  assertIdentityFileOutsideRepo,
  getProdIdentityBcryptCost,
  parseProdIdentityFile,
} from '../../../server/lib/prod-identity';
import { TEST_LOGIN_CREDENTIALS } from '../../../server/lib/seed-users';

const validIdentity = {
  username: 'prod-admin',
  password: 'a-unique-password-with-16-chars',
  role: 'admin',
  fundIds: [1, 2],
} as const;

describe('production identity file validation', () => {
  it('parses a valid identity file', () => {
    expect(parseProdIdentityFile(JSON.stringify([validIdentity]))).toEqual([validIdentity]);
  });

  it('rejects passwords shorter than 16 characters', () => {
    expect(() =>
      parseProdIdentityFile(JSON.stringify([{ ...validIdentity, password: 'too-short' }]))
    ).toThrow();
  });

  it('rejects roles outside USER_ROLES', () => {
    expect(() =>
      parseProdIdentityFile(JSON.stringify([{ ...validIdentity, role: 'owner' }]))
    ).toThrow();
  });

  it('rejects duplicate usernames and lists them', () => {
    expect(() =>
      parseProdIdentityFile(
        JSON.stringify([validIdentity, { ...validIdentity, password: 'another-unique-password' }])
      )
    ).toThrow('Duplicate usernames in production identity file: "prod-admin"');
  });

  it('rejects a committed dev seed password', () => {
    const devCredential = TEST_LOGIN_CREDENTIALS.find(({ password }) => password.length >= 16);
    expect(devCredential).toBeDefined();

    expect(() =>
      parseProdIdentityFile(
        JSON.stringify([{ ...validIdentity, password: devCredential?.password }])
      )
    ).toThrow('Refusing production dev seed password');
  });

  it('rejects repo paths and accepts paths outside the repo', () => {
    const repoRoot = resolve('workspace', 'updog');
    const repoIdentityFile = resolve(repoRoot, 'secrets', 'identities.json');
    const deceptiveRepoIdentityFile = resolve(repoRoot, '..secrets', 'identities.json');
    const outsideIdentityFile = resolve(repoRoot, '..', 'identities.json');

    expect(() => assertIdentityFileOutsideRepo(repoIdentityFile, repoRoot)).toThrow(
      'IDENTITY_FILE must be outside the repository.'
    );
    expect(() => assertIdentityFileOutsideRepo(deceptiveRepoIdentityFile, repoRoot)).toThrow(
      'IDENTITY_FILE must be outside the repository.'
    );
    expect(assertIdentityFileOutsideRepo(outsideIdentityFile, repoRoot)).toBe(outsideIdentityFile);
  });

  it('rejects missing fund ids and accepts an all-present set', () => {
    const identities = parseProdIdentityFile(JSON.stringify([validIdentity]));

    expect(() => assertFundIdsExist(identities, new Set([1]))).toThrow(
      'Production identity file references missing fund id(s): 2'
    );
    expect(() => assertFundIdsExist(identities, new Set([1, 2]))).not.toThrow();
  });

  it('selects bcrypt cost 12 only for production', () => {
    expect(getProdIdentityBcryptCost('production')).toBe(12);
    expect(getProdIdentityBcryptCost('test')).toBe(8);
    expect(getProdIdentityBcryptCost(undefined)).toBe(8);
  });
});
