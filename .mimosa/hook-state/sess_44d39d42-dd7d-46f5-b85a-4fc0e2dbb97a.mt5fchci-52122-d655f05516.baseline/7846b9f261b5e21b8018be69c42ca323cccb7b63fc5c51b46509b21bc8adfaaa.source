import { describe, expect, it } from 'vitest';
import { createStorageFromEnvironment, getStorageRuntimeState } from '../../../server/storage';
import {
  PROFESSIONAL_DEMO_DEFAULT_BASE_URL,
  PROFESSIONAL_DEMO_DEFAULT_PORT,
  PROFESSIONAL_DEMO_RUNTIME_MODE,
  getProfessionalDemoRuntimeConfigurationError,
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

  it('fails professional demo mode when storage would resolve to memory', () => {
    const env = {
      NODE_ENV: 'development',
      PROFESSIONAL_DEMO_MODE: PROFESSIONAL_DEMO_RUNTIME_MODE,
      ALLOW_MEMORY_STORAGE: '1',
      DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
    } as NodeJS.ProcessEnv;

    expect(resolveStorageBootMode(env)).toBe('explicit-memory');
    expect(getProfessionalDemoRuntimeConfigurationError(env)).toContain('ALLOW_MEMORY_STORAGE=0');
    expect(() => createStorageFromEnvironment(env)).toThrow('ALLOW_MEMORY_STORAGE=0');
  });

  it('allows professional demo mode only with persistent database storage', () => {
    const env = {
      NODE_ENV: 'development',
      PROFESSIONAL_DEMO_MODE: PROFESSIONAL_DEMO_RUNTIME_MODE,
      ALLOW_MEMORY_STORAGE: '0',
      DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
    } as NodeJS.ProcessEnv;

    expect(getProfessionalDemoRuntimeConfigurationError(env)).toBeNull();
    expect(createStorageFromEnvironment(env).kind).toBe('database');
  });

  it('fails professional demo API verification when the target is not pinned', () => {
    const env = {
      NODE_ENV: 'development',
      PROFESSIONAL_DEMO_MODE: PROFESSIONAL_DEMO_RUNTIME_MODE,
      ALLOW_MEMORY_STORAGE: '0',
      DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
      PORT: '8080',
      BASE_URL: 'http://localhost:8080',
      CLIENT_URL: 'http://localhost:8080',
      VITE_API_BASE_URL: 'http://localhost:8080',
    } as NodeJS.ProcessEnv;

    expect(getProfessionalDemoRuntimeConfigurationError(env, { requireApiTarget: true })).toBe(
      `Professional demo BASE_URL must be ${PROFESSIONAL_DEMO_DEFAULT_BASE_URL}.`
    );
  });

  it('fails professional demo API verification when BASE_URL includes a path', () => {
    const env = {
      NODE_ENV: 'development',
      PROFESSIONAL_DEMO_MODE: PROFESSIONAL_DEMO_RUNTIME_MODE,
      ALLOW_MEMORY_STORAGE: '0',
      DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
      PORT: PROFESSIONAL_DEMO_DEFAULT_PORT,
      BASE_URL: `${PROFESSIONAL_DEMO_DEFAULT_BASE_URL}/api`,
      CLIENT_URL: `${PROFESSIONAL_DEMO_DEFAULT_BASE_URL}/api`,
      VITE_API_BASE_URL: `${PROFESSIONAL_DEMO_DEFAULT_BASE_URL}/api`,
    } as NodeJS.ProcessEnv;

    expect(getProfessionalDemoRuntimeConfigurationError(env, { requireApiTarget: true })).toBe(
      'Professional demo BASE_URL must not include a path, query, or fragment.'
    );
  });

  it('allows professional demo API verification only on the pinned target', () => {
    const env = {
      NODE_ENV: 'development',
      PROFESSIONAL_DEMO_MODE: PROFESSIONAL_DEMO_RUNTIME_MODE,
      ALLOW_MEMORY_STORAGE: '0',
      DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
      PORT: PROFESSIONAL_DEMO_DEFAULT_PORT,
      BASE_URL: PROFESSIONAL_DEMO_DEFAULT_BASE_URL,
      CLIENT_URL: PROFESSIONAL_DEMO_DEFAULT_BASE_URL,
      VITE_API_BASE_URL: PROFESSIONAL_DEMO_DEFAULT_BASE_URL,
    } as NodeJS.ProcessEnv;

    expect(
      getProfessionalDemoRuntimeConfigurationError(env, { requireApiTarget: true })
    ).toBeNull();
  });
});
