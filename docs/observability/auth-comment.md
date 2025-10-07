# PR-A — Auth: RS256 JWT Restoration (Status: Blocked pending fixes)

**Why blocked:** async error handling, strict verification, and rotation ergonomics need tightening before we ship RS256.

## Required changes

### 1) Async safety (Express 4)
- Wrap async middleware with a shared `asyncHandler`.
- Add a global error handler so promise rejections hit Express' error path.

```ts
// server/lib/helpers/asyncHandler.ts
export const asyncHandler =
  <T extends (...args: any[]) => Promise<any>>(fn: T) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// server/app.ts (after routes)
app.use((err: any, _req: any, res: any, _next: any) => {
  const status = err?.status ?? 500;
  res.status(status).json({
    error: status === 401 ? 'unauthorized' : 'internal_error',
    reason: err?.reason ?? err?.message ?? 'unexpected_error',
  });
});
```

### 2) Strict verification (alg/aud/iss/kid)

* **Reject tokens whose header `alg` isn't allowed *before* verification.**
* Enforce **exact** `aud`/`iss` from config (watch trailing slashes and scheme).
* Require `kid`; on unknown `kid`, let JWKS fetch; on miss, return 401 with a reason.
* Allow clock skew **±300s** for `nbf/iat/exp`.

```ts
// server/lib/auth/verify.ts
import * as jose from 'jose';
import { getAuthConfig } from '../../config/auth';

const cfg = getAuthConfig();

export async function verifyAccessToken(token: string) {
  const { alg } = jose.decodeProtectedHeader(token);      // pre-check alg
  const allowed = cfg.algorithm === 'RS256' ? ['RS256'] : ['HS256'];
  if (!allowed.includes(alg as string)) {
    const e: any = new Error('algorithm not allowed');
    e.status = 401; e.reason = 'alg_not_allowed';
    throw e;
  }

  if (cfg.algorithm === 'HS256') {
    const secret = new TextEncoder().encode(cfg.secret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ['HS256'],
      audience: cfg.audience,
      issuer: cfg.issuer,
      clockTolerance: '300s',
    });
    return payload;
  }

  const JWKS = jose.createRemoteJWKSet(new URL(cfg.jwksUrl), {
    cache: true, cacheMaxAge: 10 * 60 * 1000, cooldownDuration: 30 * 1000,
  });

  const { payload, protectedHeader } = await jose.jwtVerify(token, JWKS, {
    algorithms: ['RS256'],
    audience: cfg.audience,
    issuer: cfg.issuer,
    clockTolerance: '300s',
  });

  if (!protectedHeader.kid) {
    const e: any = new Error('missing kid');
    e.status = 401; e.reason = 'missing_kid';
    throw e;
  }
  if (!payload.sub) {
    const e: any = new Error('missing sub');
    e.status = 401; e.reason = 'invalid_claims';
    throw e;
  }

  return payload;
}
```

### 3) Middleware refactor (no promise chains)

```ts
// server/lib/auth/middleware.ts
import { asyncHandler } from '../helpers/asyncHandler';
import { verifyAccessToken } from './verify';

export const requireAuth = () =>
  asyncHandler(async (req, res, next) => {
    const h = req.header('authorization') ?? '';
    if (!h.startsWith('Bearer ')) {
      const e: any = new Error('missing bearer token');
      e.status = 401; e.reason = 'missing_token';
      throw e;
    }
    const claims = await verifyAccessToken(h.slice(7));
    (req as any).user = { sub: claims.sub, aud: claims.aud, roles: (claims as any).roles ?? [] };
    next();
  });

// If equivalent in your stack:
export const requireSecureContext = requireAuth();
```

### 4) JWKS cache invalidation (admin-guarded)

```ts
// server/lib/auth/jwksCache.ts
import * as jose from 'jose';
let current: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
export const getJWKS = (url: string) =>
  (current ??= jose.createRemoteJWKSet(new URL(url), { cache: true, cacheMaxAge: 600_000, cooldownDuration: 30_000 }));
export const invalidateJWKS = () => { current = null; };

// server/routes/admin/auth.ts
router.post('/auth/jwks/invalidate', requireAuth(), requireRole('admin'), (_req, res) => {
  invalidateJWKS();
  res.json({ ok: true, message: 'JWKS cache invalidated' });
});
```

### 5) Server-only `jose` (keep it out of client bundles)

* Ensure all `jose` imports live under `server/**`.
* If a shared module needs it, **dynamic import with a server guard** so Vite never includes it client-side.

### 6) Dependency & config hygiene

```bash
# lock in runtime dep
npm pkg set dependencies.jose="^5"

# .env.example (add)
AUTH_ALG=RS256
AUTH_ISSUER=https://issuer.example.com          # EXACT match; trailing slash matters
AUTH_AUDIENCE=updog-api                         # EXACT match
AUTH_JWKS_URL=https://issuer.example.com/.well-known/jwks.json
AUTH_CLOCK_SKEW_SEC=300

# For HS256 (legacy/testing):
# JWT_SECRET=<min 32 chars>
```

## Tests to add (must pass)

* Unit: valid, expired, future-nbf, wrong-aud, wrong-iss, missing-kid, alg-mismatch, HS256 compat path.
* Integration: mock JWKS server with keys A→B rotation; verify invalidate endpoint behavior.
* Skew edge: ±300s for `nbf/iat/exp`.

## Quick checklist

* [ ] Async middleware + global error handler
* [ ] `alg` allowlist enforced before verify
* [ ] Exact `aud`/`iss` validation, `kid` required
* [ ] JWKS invalidate route (admin-guarded)
* [ ] `jose@^5` in **dependencies**
* [ ] HS256 compat behind config + test
* [ ] Server-only `jose`
* [ ] Unit + integration tests added and green

> Build is currently red; see the latest CI run linked on the PR for details.
