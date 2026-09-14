import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.unmock('fs');

import {
  analyzeScriptAliasPolicy,
  findLegacyScriptAliases,
} from '../../../scripts/guardrails/script-alias-policy.mjs';

describe('script-alias-policy', () => {
  it('keeps local and CI routing checks identical and strict', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(scripts['docs:routing:check']).toBe('npx tsx scripts/generate-discovery-map.ts --check');
    expect(scripts['docs:routing:check:ci']).toBe(scripts['docs:routing:check']);
  });

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
