# PR #113 - Auth Changes Review Comment

## 🔒 Security Review: RS256 JWT Authentication

### ✅ What's Good

- Algorithm allow-listing prevents algorithm confusion attacks
- JWKS implementation with caching (10min) and cooldown (30s)
- Fail-fast configuration validation
- Custom error types with reason codes

### 🔴 Blocking Issues

#### 1. Async Error Handling (CRITICAL)

Express 4 doesn't auto-catch async errors. Your middleware will leak unhandled promise rejections.

**Fix:** Add async wrapper + error middleware:

```typescript
// server/lib/helpers/asyncHandler.ts (NEW)
export const asyncHandler =
  <T extends (...args: any[]) => Promise<any>>(fn: T) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);
```

```typescript
// server/app.ts (ADD after routes)
app.use((err: any, _req: any, res: any, _next: any) => {
  const status = err?.status ?? 500;
  res.status(status).json({
    error: status === 401 ? 'unauthorized' : 'internal_error',
    reason: err?.reason ?? err?.message ?? 'unexpected_error',
  });
});
```

**Refactor middleware** ([jwt.ts:195-215](https://github.com/nikhillinit/Updog_restore/pull/113/files#diff-...)):

```typescript
export const requireAuth = () =>
  asyncHandler(async (req, res, next) => {
    const h = req.header('authorization') ?? '';
    if (!h.startsWith('Bearer ')) {
      const e: any = new Error('missing bearer token');
      e.status = 401; e.reason = 'missing_token';
      throw e;
    }
    const claims = await verifyAccessToken(h.slice(7));
    (req as any).user = { sub: claims.sub, roles: claims.roles ?? [] };
    next();
  });
```

#### 2. JWT Verification Hardening

**Missing:**
- ✅ Clock skew tolerance (should be ±5 minutes)
- ✅ `kid` (key ID) validation
- ✅ Enforce aud/issuer from config (not from token)

**Enhanced verifier:**

```typescript
import * as jose from 'jose';

const JWKS = jose.createRemoteJWKSet(new URL(authConfig.jwksUri!), {
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
  cooldownDuration: 30 * 1000,
});

export async function verifyAccessToken(token: string): Promise<JWTClaims> {
  const { payload, protectedHeader } = await jose.jwtVerify(token, JWKS, {
    algorithms: ['RS256'],
    audience: authConfig.audience,    // ENFORCE from config
    issuer: authConfig.issuer,        // ENFORCE from config
    clockTolerance: '300s',           // ±5 minutes
  });

  if (!protectedHeader.kid) {
    throw new InvalidTokenError('missing kid', 'missing_kid');
  }

  if (!payload.sub) {
    throw new InvalidTokenError('missing sub', 'invalid_claims');
  }

  return payload as JWTClaims;
}
```

#### 3. JWKS Cache Invalidation

Add admin endpoint to force cache refresh on key compromise:

```typescript
// server/lib/auth/jwksCache.ts (NEW)
let currentSet: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

export function getJWKS(url: string) {
  currentSet ||= jose.createRemoteJWKSet(new URL(url), { /* ... */ });
  return currentSet;
}

export function invalidateJWKS() { currentSet = null; }
```

```typescript
// server/routes/admin/auth.ts (NEW)
router.post('/jwks/invalidate', requireAuth(), requireRole('admin'), (_req, res) => {
  invalidateJWKS();
  res.json({ ok: true });
});
```

#### 4. HS256 Backward Compatibility

Maintain explicit HS256 support with feature flag:

```typescript
export async function verifyAccessToken(token: string): Promise<JWTClaims> {
  if (authConfig.algorithm === 'HS256') {
    // HS256 path for existing users
    const secret = new TextEncoder().encode(authConfig.secret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ['HS256'],
      audience: authConfig.audience,
      issuer: authConfig.issuer,
      clockTolerance: '300s',
    });
    return payload as JWTClaims;
  }

  // RS256 path (new)
  // ...
}
```

Add unit test:
```typescript
it('should verify HS256 tokens when AUTH_ALG=HS256', async () => {
  process.env.AUTH_ALG = 'HS256';
  const token = signToken({ sub: 'user123' });
  const claims = await verifyAccessToken(token);
  expect(claims.sub).toBe('user123');
});
```

#### 5. Dependencies & Config

**Verify:**
```bash
npm list jose  # Must be in dependencies, not devDependencies
```

**Update `.env.example`:**
```bash
AUTH_ALG=RS256
AUTH_ISSUER=https://issuer.example.com
AUTH_AUDIENCE=updog-api
AUTH_JWKS_URL=https://issuer.example.com/.well-known/jwks.json
AUTH_CLOCK_SKEW_SEC=300
```

**Create `docs/auth/RS256-SETUP.md`** with:
- How to set issuer/audience
- Where to find JWKS URL
- Key rotation instructions
- Troubleshooting guide

#### 6. Tests (REQUIRED)

**Unit tests** (all must pass):
- ✅ Valid token verification
- ✅ Expired token rejection
- ✅ Future nbf rejection
- ✅ Wrong audience rejection
- ✅ Wrong issuer rejection
- ✅ Missing kid rejection
- ✅ Algorithm spoofing prevention
- ✅ HS256 backward compat

**Integration test:**
- Mock JWKS server with key rotation scenario

---

### 🎯 Approval Checklist

- [ ] Async error handling implemented
- [ ] JWT verification hardened (clock skew, kid, aud/iss enforcement)
- [ ] JWKS invalidation endpoint added
- [ ] HS256 backward compatibility maintained
- [ ] `jose` in dependencies
- [ ] `.env.example` + docs updated
- [ ] All unit + integration tests passing

**Cannot approve until all blocking issues addressed.**

---

**Note:** Please split auth changes into separate PR from fund-calc changes. Mixing auth + feature logic makes security review difficult.
