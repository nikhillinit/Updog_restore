/**
 * Lightweight endpoint-ownership manifest for the canonical funds surface.
 *
 * This keeps the solo-maintainer version of the strategy executable without
 * requiring a larger CI manifest system up front.
 */

export type FundsEndpointMethod = 'GET' | 'POST';
export type FundsEndpointPath = '/api/funds' | '/api/funds/:id' | '/api/funds/calculate';
export type FundsRuntimeSurface = 'registerRoutes' | 'vercel_stub';
export type FundsEndpointOwner = 'router' | 'stub';
export type FundsEndpointSupport = 'supported' | 'out_of_scope';

export type FundsEndpointOwnershipEntry = {
  method: FundsEndpointMethod;
  path: FundsEndpointPath;
  canonicalOwner: FundsEndpointOwner;
  ownerModule: 'server/routes/funds.ts' | 'api/funds.ts';
  runtimeSurface: FundsRuntimeSurface;
  mountPath: '/api' | null;
  contractSource: string;
  support: FundsEndpointSupport;
  notes?: string;
};

export const fundsEndpointOwnershipManifest = [
  {
    method: 'GET',
    path: '/api/funds',
    canonicalOwner: 'router',
    ownerModule: 'server/routes/funds.ts',
    runtimeSurface: 'registerRoutes',
    mountPath: '/api',
    contractSource: 'tests/unit/contract/funds-endpoint-snapshots.test.ts',
    support: 'supported',
    notes: 'Canonical list endpoint on the authoritative runtime.',
  },
  {
    method: 'GET',
    path: '/api/funds/:id',
    canonicalOwner: 'router',
    ownerModule: 'server/routes/funds.ts',
    runtimeSurface: 'registerRoutes',
    mountPath: '/api',
    contractSource: 'tests/unit/contract/funds-endpoint-snapshots.test.ts',
    support: 'supported',
    notes: 'Canonical detail endpoint on the authoritative runtime.',
  },
  {
    method: 'POST',
    path: '/api/funds',
    canonicalOwner: 'router',
    ownerModule: 'server/routes/funds.ts',
    runtimeSurface: 'registerRoutes',
    mountPath: '/api',
    contractSource: 'tests/unit/contract/funds-route-ownership.test.ts',
    support: 'supported',
    notes: 'Canonical create endpoint with wrapper contract.',
  },
  {
    method: 'POST',
    path: '/api/funds/calculate',
    canonicalOwner: 'router',
    ownerModule: 'server/routes/funds.ts',
    runtimeSurface: 'registerRoutes',
    mountPath: '/api',
    contractSource: 'tests/unit/contract/funds-endpoint-snapshots.test.ts',
    support: 'supported',
    notes: 'Canonical calculate endpoint on the single-prefix mounted path.',
  },
  {
    method: 'GET',
    path: '/api/funds',
    canonicalOwner: 'stub',
    ownerModule: 'api/funds.ts',
    runtimeSurface: 'vercel_stub',
    mountPath: null,
    contractSource: 'docs/evidence/endpoint-ownership.md',
    support: 'out_of_scope',
    notes: 'Gated by ENABLE_API_STUB=true and intentionally deferred.',
  },
] as const satisfies readonly FundsEndpointOwnershipEntry[];

export function fundsEndpointKey(
  entry: Pick<FundsEndpointOwnershipEntry, 'method' | 'path' | 'runtimeSurface'>
): string {
  return `${entry.method} ${entry.path} @ ${entry.runtimeSurface}`;
}

export const supportedCanonicalFundsEndpoints = fundsEndpointOwnershipManifest.filter(
  (entry) => entry.runtimeSurface === 'registerRoutes' && entry.support === 'supported'
);
