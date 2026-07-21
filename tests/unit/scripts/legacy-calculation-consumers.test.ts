import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyze, check } from '../../../scripts/guardrails/legacy-calculation-consumers-lib.mjs';

const root = path.resolve('.');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'config/calculation-migration-manifest.json'), 'utf8')
);

describe('legacy-calculation-consumers guard', () => {
  it.each([
    {
      name: 'direct protected engine import',
      filePath: 'server/routes/new-thing.ts',
      source: "import { CohortEngine } from '@shared/core/cohorts/CohortEngine';",
      entryClass: 'protected_calculation_engines',
    },
    {
      name: 'literal dynamic protected engine import',
      filePath: 'server/services/new-thing.ts',
      source: "const m = await import('@shared/core/cohorts/CohortEngine');",
      entryClass: 'protected_calculation_engines',
    },
    {
      name: 'protected symbol imported through the cohorts barrel',
      filePath: 'client/src/pages/new.tsx',
      source: "import { generateCohortSummary } from '@/core/cohorts';",
      entryClass: 'protected_calculation_engines',
    },
    {
      name: 'legacy-backed facade import',
      filePath: 'server/routes/new-facade.ts',
      source: "import { metricsAggregator } from '@server/services/metrics-aggregator';",
      entryClass: 'legacy_backed_facades',
    },
  ])('flags a new $name', ({ filePath, source, entryClass }) => {
    const result = analyze([{ filePath, source }], manifest);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'legacy-calculation-consumers',
        file: filePath,
        entryClass,
      }),
    ]);
  });

  it.each([
    {
      name: 'the unrelated capital-allocation compareCohorts symbol',
      filePath: 'server/x.ts',
      source: "import { compareCohorts } from '@shared/core/capitalAllocation';",
    },
    {
      name: 'the analysis-cohort subtree',
      filePath: 'server/routes/cohort-analysis.ts',
      source: "import { analyzeCohorts } from '@shared/core/cohorts/analysis/advanced-engine';",
    },
  ])('does not flag $name', ({ filePath, source }) => {
    const result = analyze([{ filePath, source }], manifest);

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it.each([
    {
      filePath: 'server/services/projected-metrics-calculator.ts',
      source: "import { generateCohortSummary } from '@shared/core/cohorts/CohortEngine';",
    },
    {
      filePath: 'server/services/metrics-aggregator.ts',
      source: "import { ProjectedMetricsCalculator } from './projected-metrics-calculator';",
    },
    {
      filePath: 'server/routes/engine-summaries.ts',
      source: "import { generateCohortSummary } from '@shared/core/cohorts/CohortEngine';",
    },
    {
      filePath: 'client/src/core/cohorts/CohortEngine.ts',
      source:
        "export { CohortEngine, compareCohorts, generateCohortSummary } from '@shared/core/cohorts/CohortEngine';",
    },
    {
      filePath: 'client/src/core/cohorts/index.ts',
      source:
        "export { CohortEngine, generateCohortSummary, compareCohorts } from './CohortEngine';",
    },
    {
      filePath: 'server/routes/dual-forecast.ts',
      source: "import { metricsAggregator } from '../services/metrics-aggregator';",
    },
    {
      filePath: 'server/routes/fund-metrics.ts',
      source: "import { metricsAggregator } from '../services/metrics-aggregator';",
    },
    {
      filePath: 'server/services/h9-artifact-invalidation-service.ts',
      source: "import { metricsAggregator } from './metrics-aggregator';",
    },
  ])('allows declared consumer $filePath', ({ filePath, source }) => {
    const result = analyze([{ filePath, source }], manifest);

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('passes against the current repository tree', async () => {
    const result = await check({ root, manifest });

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
