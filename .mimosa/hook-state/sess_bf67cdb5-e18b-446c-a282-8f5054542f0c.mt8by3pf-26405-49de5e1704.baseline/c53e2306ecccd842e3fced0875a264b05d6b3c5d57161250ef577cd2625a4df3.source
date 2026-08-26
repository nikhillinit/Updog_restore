import { describe, expect, it } from 'vitest';
import type { FlagKey, ServerOnlyFlagKey } from '../../../shared/generated/flag-types.js';
import { CLIENT_FLAG_KEYS } from '../../../shared/generated/flag-types.js';
import {
  FLAG_ALIASES,
  FLAG_DEFAULTS,
  FLAG_DEFINITIONS,
  resolveAlias,
} from '../../../shared/generated/flag-defaults.js';

const portfolioIntelligenceKey: FlagKey = 'enable_portfolio_intelligence';
const portfolioIntelligenceServerOnlyKey: ServerOnlyFlagKey = portfolioIntelligenceKey;
const portfolioIntelligenceAlias = 'ENABLE_PORTFOLIO_INTELLIGENCE';

describe('enable_portfolio_intelligence flag registration', () => {
  it('defaults off and resolves the server env alias to the canonical key', () => {
    expect(FLAG_DEFAULTS[portfolioIntelligenceKey]).toBe(false);
    expect(FLAG_ALIASES[portfolioIntelligenceAlias]).toBe(portfolioIntelligenceKey);
    expect(resolveAlias(portfolioIntelligenceAlias)).toBe(portfolioIntelligenceKey);
  });

  it('is server-only and not exposed to client flag surfaces', () => {
    expect(FLAG_DEFINITIONS[portfolioIntelligenceServerOnlyKey]).toMatchObject({
      default: false,
      owner: 'platform',
      exposeToClient: false,
    });
    expect(CLIENT_FLAG_KEYS).not.toContain(portfolioIntelligenceKey);
  });
});
