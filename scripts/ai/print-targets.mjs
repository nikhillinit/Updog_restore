#!/usr/bin/env node
/**
 * Print TypeScript error target files for subagent analysis
 */

const sets = {
  typeSafety: [
    'client/src/hooks/useInvalidateQueries.ts',
    'client/src/lib/decimal-utils.ts',
    'client/src/components/charts/investment-breakdown-chart.tsx',
    'client/src/components/dashboard/portfolio-concentration.tsx',
    'client/src/components/forecasting/portfolio-insights.tsx',
    'client/src/components/charts/nivo-allocation-pie.tsx'
  ],
  patterns: [
    'client/src/core/flags/flagAdapter.ts',
    'client/src/adapters/kpiAdapter.ts',
    'client/src/features/scenario/ScenarioCompareChart.tsx',
    'client/src/features/scenario/summary.ts',
    'client/src/utils/export-reserves.ts'
  ],
  businessLogic: [
    'client/src/pages/WaterfallStep.tsx',
    'client/src/lib/fund-calc-v2.ts',
    'client/src/hooks/useModelingWizard.ts',
    'client/src/workers/simulation.worker.ts'
  ]
};

console.log(JSON.stringify(sets, null, 2));
