const INTERNAL_ECONOMICS_RUN_CREATION_PATH =
  /^\/api\/funds\/[^/?#]+\/internal-economics\/runs\/?$/i;

export function isDatabaseBackedIdempotencyRoute(method: string, path: string): boolean {
  const pathnameEnd = path.search(/[?#]/);
  const pathname = pathnameEnd === -1 ? path : path.slice(0, pathnameEnd);
  return method === 'POST' && INTERNAL_ECONOMICS_RUN_CREATION_PATH.test(pathname);
}
