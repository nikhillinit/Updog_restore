/**
 * LP Reporting -- Contract barrel.
 *
 * Re-exports the 4 Phase 0.3 Zod schemas plus their inferred TypeScript
 * types, including the Phase 1.1 metric-run results + diagnostics shapes
 * (XirrDiagnosticSchema, MarkConfidenceMixSchema, LpMetricRunResultsSchema,
 * LpMetricRunDiagnosticsSchema). Consumers should import from this barrel
 * rather than from individual contract files.
 *
 * @module shared/contracts/lp-reporting
 */

export * from './cash-flow-event.contract';
export * from './valuation-mark.contract';
export * from './evidence-record.contract';
export * from './lp-metric-run.contract';
export * from './lp-narrative-run.contract';
export * from './import-dry-run.contract';
export * from './import-commit.contract';
