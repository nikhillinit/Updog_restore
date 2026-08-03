const INTERNAL_ECONOMICS_RUN_CREATION_PATH =
  /^\/api\/funds\/[^/?#]+\/internal-economics\/runs\/?$/i;
const TASK_EVIDENCE_LINK_CREATION_PATH =
  /^\/api\/funds\/[^/?#]+\/tasks\/[^/?#]+\/evidence-links\/?$/i;
// KPI collection stores its own idempotency key and request hash on the row, so
// both write paths bypass the generic in-memory idempotency middleware.
const KPI_OBSERVATION_CREATION_PATH = /^\/api\/funds\/[^/?#]+\/kpi-observations\/?$/i;
const KPI_OBSERVATION_IMPORT_PATH = /^\/api\/funds\/[^/?#]+\/kpi-observations\/imports\/?$/i;

export function isDatabaseBackedIdempotencyRoute(method: string, path: string): boolean {
  const pathnameEnd = path.search(/[?#]/);
  const pathname = pathnameEnd === -1 ? path : path.slice(0, pathnameEnd);
  return (
    method === 'POST' &&
    (INTERNAL_ECONOMICS_RUN_CREATION_PATH.test(pathname) ||
      TASK_EVIDENCE_LINK_CREATION_PATH.test(pathname) ||
      KPI_OBSERVATION_CREATION_PATH.test(pathname) ||
      KPI_OBSERVATION_IMPORT_PATH.test(pathname))
  );
}
