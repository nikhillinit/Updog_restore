const INTERNAL_ECONOMICS_RUN_CREATION_PATH =
  /^\/api\/funds\/[^/?#]+\/internal-economics\/runs\/?$/i;
const TASK_EVIDENCE_LINK_CREATION_PATH =
  /^\/api\/funds\/[^/?#]+\/tasks\/[^/?#]+\/evidence-links\/?$/i;

export function isDatabaseBackedIdempotencyRoute(method: string, path: string): boolean {
  const pathnameEnd = path.search(/[?#]/);
  const pathname = pathnameEnd === -1 ? path : path.slice(0, pathnameEnd);
  return (
    method === 'POST' &&
    (INTERNAL_ECONOMICS_RUN_CREATION_PATH.test(pathname) ||
      TASK_EVIDENCE_LINK_CREATION_PATH.test(pathname))
  );
}
