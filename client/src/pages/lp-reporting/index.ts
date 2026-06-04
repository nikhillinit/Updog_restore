/**
 * LP Reporting -- pages barrel.
 *
 * Re-exports the 4 placeholder pages so `App.tsx` can register them
 * with a single import surface.
 *
 * @module client/pages/lp-reporting
 */

export { default as LpReportingLedgerPage } from './ledger';
export { default as LpReportingValuationsPage } from './valuations';
export { default as LpReportingMetricsPage } from './metrics';
export { default as LpReportingImportsPage } from './imports';
