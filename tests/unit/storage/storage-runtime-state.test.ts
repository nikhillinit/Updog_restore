import { describe, expect, it } from 'vitest';
import {
  createStorageFromEnvironment,
  getStorageRuntimeState,
} from '../../../server/storage';
import {
  getStorageConfigurationError,
  resolveStorageBootMode,
} from '../../../server/storage-runtime-policy';

describe('storage runtime state', () => {
  it('reports memory storage when DATABASE_URL is absent', () => {
    const env = {
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv;
    const instance = createStorageFromEnvironment(env);

    expect(instance.kind).toBe('memory');
    expect(getStorageRuntimeState(instance, env)).toEqual({
      kind: 'memory',
      capabilities: {
        investmentScenarioWrites: false,
      },
      mockDatabase: false,
    });
  });

  it('reports database storage when DATABASE_URL is present', () => {
    const env = {
      DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
    } as NodeJS.ProcessEnv;
    const instance = createStorageFromEnvironment(env);

    expect(instance.kind).toBe('database');
    expect(getStorageRuntimeState(instance, env)).toEqual({
      kind: 'database',
      capabilities: {
        investmentScenarioWrites: false,
      },
      mockDatabase: false,
    });
  });

  it('marks mock database mode explicitly', () => {
    const env = {
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock',
    } as NodeJS.ProcessEnv;
    const instance = createStorageFromEnvironment(env);

    expect(getStorageRuntimeState(instance, env).mockDatabase).toBe(true);
  });

  it('allows explicit development memory mode only when opted in', () => {
    const env = {
      NODE_ENV: 'development',
      ALLOW_MEMORY_STORAGE: '1',
    } as NodeJS.ProcessEnv;

    const instance = createStorageFromEnvironment(env);
    expect(resolveStorageBootMode(env)).toBe('explicit-memory');
    expect(instance.kind).toBe('memory');
  });

  it('prefers explicit development memory mode over a configured database URL', () => {
    const env = {
      NODE_ENV: 'development',
      ALLOW_MEMORY_STORAGE: '1',
      DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
    } as NodeJS.ProcessEnv;

    expect(resolveStorageBootMode(env)).toBe('explicit-memory');
    expect(createStorageFromEnvironment(env).kind).toBe('memory');
  });

  it('fails fast when development boot has no database URL and no explicit memory opt-in', () => {
    const env = {
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv;

    expect(resolveStorageBootMode(env)).toBe('missing-config');
    expect(() => createStorageFromEnvironment(env)).toThrow(getStorageConfigurationError(env));
  });
});
