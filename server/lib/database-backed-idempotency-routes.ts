const INTERNAL_ECONOMICS_RUN_CREATION_PATH =
  /^\/api\/funds\/[^/?#]+\/internal-economics\/runs\/?$/i;
const CURRENT_FORECAST_RECOMPUTE_PATH = /^\/api\/funds\/[^/?#]+\/current-forecast\/recompute\/?$/i;
const DECISION_CREATION_PATH = /^\/api\/funds\/[^/?#]+\/decisions\/?$/i;
const DECISION_SUPERSESSION_PATH = /^\/api\/funds\/[^/?#]+\/decisions\/[^/?#]+\/supersede\/?$/i;
const DECISION_EVIDENCE_LINK_CREATION_PATH =
  /^\/api\/funds\/[^/?#]+\/decisions\/[^/?#]+\/evidence-links\/?$/i;
const TASK_EVIDENCE_LINK_CREATION_PATH =
  /^\/api\/funds\/[^/?#]+\/tasks\/[^/?#]+\/evidence-links\/?$/i;
const TASK_CREATION_PATH = /^\/api\/funds\/[^/?#]+\/tasks\/?$/i;
// KPI collection stores its own idempotency key and request hash on the row, so
// both write paths bypass the generic in-memory idempotency middleware.
const KPI_OBSERVATION_CREATION_PATH = /^\/api\/funds\/[^/?#]+\/kpi-observations\/?$/i;
const KPI_OBSERVATION_IMPORT_PATH = /^\/api\/funds\/[^/?#]+\/kpi-observations\/imports\/?$/i;
// Reserve calculation commands persist key, request hash, lease, and the
// canonical queued response in fund_scenario_calculation_commands.
const SCENARIO_CALCULATE_RESERVE_PATH =
  /^\/api\/funds\/[^/?#]+\/scenario-sets\/[^/?#]+\/calculate-reserve\/?$/i;
const ACTUALS_PREVIEW_PATH =
  /^\/api\/funds\/[^/?#]+\/imports\/actuals\/dry-run\/?$/i;
const ACTUALS_PUBLISH_PATH =
  /^\/api\/funds\/[^/?#]+\/imports\/actuals\/publish\/?$/i;

export function isDatabaseBackedIdempotencyRoute(method: string, path: string): boolean {
  const pathnameEnd = path.search(/[?#]/);
  const pathname = pathnameEnd === -1 ? path : path.slice(0, pathnameEnd);
  return (
    method === 'POST' &&
    (INTERNAL_ECONOMICS_RUN_CREATION_PATH.test(pathname) ||
      CURRENT_FORECAST_RECOMPUTE_PATH.test(pathname) ||
      DECISION_CREATION_PATH.test(pathname) ||
      DECISION_SUPERSESSION_PATH.test(pathname) ||
      DECISION_EVIDENCE_LINK_CREATION_PATH.test(pathname) ||
      TASK_CREATION_PATH.test(pathname) ||
      TASK_EVIDENCE_LINK_CREATION_PATH.test(pathname) ||
      KPI_OBSERVATION_CREATION_PATH.test(pathname) ||
      KPI_OBSERVATION_IMPORT_PATH.test(pathname) ||
      SCENARIO_CALCULATE_RESERVE_PATH.test(pathname) ||
      ACTUALS_PREVIEW_PATH.test(pathname) ||
      ACTUALS_PUBLISH_PATH.test(pathname))
  );
}
