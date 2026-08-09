import { describe, expect, it } from 'vitest';

import {
  GOVERNED_REPORTING_FILES,
  analyzeSource,
  runSelfTest,
} from '../../../scripts/guardrails/check-canary-exclusion.mjs';

describe('canary exclusion guard', () => {
  it('covers the closed governed-reporting worklist', () => {
    expect(GOVERNED_REPORTING_FILES).toHaveLength(11);
    expect(new Set(GOVERNED_REPORTING_FILES).size).toBe(GOVERNED_REPORTING_FILES.length);
  });

  it('fails unprotected fund and rollup queries while accepting protected queries', () => {
    expect(
      analyzeSource({
        filePath: 'server/routes/example.ts',
        source: 'db.select().from(funds).where(eq(funds.id, fundId));',
      })
    ).toHaveLength(1);
    expect(
      analyzeSource({
        filePath: 'server/routes/example.ts',
        source:
          "import { productionFundPredicate } from '../lib/canary-exclusion'; db.select().from(funds).where(productionFundPredicate());",
      })
    ).toHaveLength(0);
    expect(
      analyzeSource({
        filePath: 'server/routes/example.ts',
        source: '// canary-exclusion is required here\ndb.select().from(funds);',
      })
    ).toHaveLength(1);
  });

  it('passes its executable self-test', () => {
    expect(() => runSelfTest()).not.toThrow();
  });
});
