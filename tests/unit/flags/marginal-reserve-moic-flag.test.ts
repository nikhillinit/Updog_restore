import { describe, expect, it } from 'vitest';

import {
  CLIENT_FLAG_KEYS,
  type FlagKey,
  type ServerOnlyFlagKey,
} from '../../../shared/generated/flag-types.js';
import {
  FLAG_ALIASES,
  FLAG_DEFAULTS,
  FLAG_DEFINITIONS,
  resolveAlias,
} from '../../../shared/generated/flag-defaults.js';

const flagKey: FlagKey = 'enable_marginal_reserve_moic';
const serverOnlyFlagKey: ServerOnlyFlagKey = flagKey;
const environmentAlias = 'ENABLE_MARGINAL_RESERVE_MOIC';

describe('enable_marginal_reserve_moic flag registration', () => {
  it('defaults off in every environment and resolves its server alias', () => {
    expect(FLAG_DEFAULTS[flagKey]).toBe(false);
    expect(FLAG_DEFINITIONS[flagKey].environments).toEqual({
      development: false,
      staging: false,
      production: false,
    });
    expect(FLAG_ALIASES[environmentAlias]).toBe(flagKey);
    expect(resolveAlias(environmentAlias)).toBe(flagKey);
  });

  it('is server-only and absent from the client flag surface', () => {
    expect(FLAG_DEFINITIONS[serverOnlyFlagKey]).toMatchObject({
      default: false,
      owner: 'analytics',
      exposeToClient: false,
    });
    expect(CLIENT_FLAG_KEYS).not.toContain(flagKey);
  });
});
