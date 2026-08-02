const INTERNAL_ECONOMICS_RUN_CREATION_PATH = /^\/api\/funds\/[^/?#]+\/internal-economics\/runs$/;

export function isDatabaseBackedIdempotencyRoute(method: string, path: string): boolean {
  return method === 'POST' && INTERNAL_ECONOMICS_RUN_CREATION_PATH.test(path);
}
