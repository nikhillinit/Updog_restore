import { describe, expect, it } from 'vitest';

import {
  analyzeScriptAliasPolicy,
  findLegacyScriptAliases,
} from '../../../scripts/guardrails/script-alias-policy.mjs';

describe('script-alias-policy', () => {
  it('allows existing legacy phase and wave aliases while rejecting new ones', () => {
    const scripts = {
      'test:unit': 'vitest run',
      'test:wave4': 'vitest run tests/unit/reserves-v11.test.ts',
      'lint:phase4': 'eslint shared/core/reserves/ReserveEngine.ts',
      'test:integration:phase0-dbproof': 'vitest run -c vitest.config.phase0-dbproof.ts',
      'test:wave7': 'vitest run tests/unit/new-cleanup.test.ts',
    };

    const result = analyzeScriptAliasPolicy({
      scripts,
      allowedLegacyAliases: ['test:wave4', 'lint:phase4'],
    });

    expect(result.currentLegacyAliases).toEqual(['lint:phase4', 'test:wave4', 'test:wave7']);
    expect(result.unexpectedLegacyAliases).toEqual(['test:wave7']);
  });

  it('does not treat descriptive script names containing phase as legacy aliases', () => {
    const aliases = findLegacyScriptAliases({
      'test:integration:phase0-dbproof': 'vitest run -c vitest.config.phase0-dbproof.ts',
      'docs:routing:check': 'tsx scripts/generate-discovery-map.ts --check',
      'validate:core': 'npm run baseline:check',
    });

    expect(aliases).toEqual([]);
  });
});
