import { describe, expect, it } from 'vitest';
import {
  createStorageFromEnvironment,
  getStorageRuntimeState,
} from '../../../server/storage';

describe('storage runtime state', () => {
  it('reports memory storage when DATABASE_URL is absent', () => {
    const env = {} as NodeJS.ProcessEnv;
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
});
