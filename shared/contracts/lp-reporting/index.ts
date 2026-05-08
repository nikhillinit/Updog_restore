/**
 * LP Reporting -- Contract barrel.
 *
 * Re-exports the 4 Phase 0.3 Zod schemas plus their inferred TypeScript
 * types. Consumers should import from this barrel rather than from
 * individual contract files.
 *
 * @module shared/contracts/lp-reporting
 */

export * from './cash-flow-event.contract';
export * from './valuation-mark.contract';
export * from './evidence-record.contract';
export * from './lp-metric-run.contract';
