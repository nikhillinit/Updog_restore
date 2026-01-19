---
status: HISTORICAL
last_updated: 2026-01-19
---

# PR #113 Review - RS256 JWT Authentication & Fund Calc Engine

**Status:** 🟡 **Requires Changes** (blocking issues identified)
**Reviewed:** 2025-10-06
**Reviewer:** Claude Code

---

## TL;DR

* **Split the PR** (auth vs. fund-calc). Keep security surface area small.
* **Auth: BLOCKING** until async error handling, clock-skew, and JWKS/key-rotation are handled and tests exist.
* **Fund-calc:** good direction; fix management-fee timing, make ownership/date inputs, and don't pre-subtract stage reserves.

---

## What to Keep (Nice Work)

* ✅ Algorithm allow-listing and moving to **RS256 + JWKS** with caching
* ✅ Centralized config validation ([server/config/auth.ts](../../server/config/auth.ts)) and custom error types
* ✅ Deterministic fund engine structure with `Decimal` usage (precision) and periodized sim scaffolding
* ✅ Matches your deterministic design goals from DECISIONS.md

---

## 0. How to Split the PR Cleanly

```bash
# Ensure clean state
git fetch origin && git checkout -b split/auth origin/PR-113-branch

# OPTION A: Keep only auth changes in this branch
git reset --soft $(git merge-base split/auth origin/main)
git restore --staged . && git checkout -- .

# Re-stage only auth files:
git add server/lib/auth/** \
        server/lib/secure-context.ts \
        server/config/auth.ts \
        docs/auth/** \
        .env.example \
        package.json \
        package-lock.json

git commit -m "auth(rs256): restore RS256 + JWKS with hardened middleware"

# Create PR-A from split/auth

# OPTION B: Fund-calc branch
git checkout -b split/fund-calc origin/PR-113-branch
git reset --soft $(git merge-base split/fund-calc origin/main)
git restore --staged . && git checkout -- .

# Re-stage only fund-calc files:
git add client/src/lib/fund-calc.ts \
        server/routes/calculations.ts \
        server/app.ts \
        tests/fund-calc/**

git commit -m "feat(calc): deterministic fund engine + CSV export"

# Create PR-B from split/fund-calc
```

**Note:** If commit history is tangled, use `git cherry-pick <auth-commits>` onto `split/auth` and `<calc-commits>` onto `split/fund-calc`.

---

## 1. Auth PR (BLOCKING Fixes Required)

### a) Async Error Handling (CRITICAL)

**Problem:** Express 4 doesn't auto-catch async errors; your middleware will leak unhandled promise rejections.

**Solution:**

```typescript
// server/lib/helpers/asyncHandler.ts (NEW FILE)
export const asyncHandler =
  <T extends (...args: any[]) => Promise<any>>(fn: T) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);
```

```typescript
// server/app.ts (ADD after routes, before final error handler)
app.use((err: any, _req: any, res: any, _next: any) => {
  const status = err?.status ?? 500;
  res.status(status).json({
    error: status === 401 ? 'unauthorized' : 'internal_error',
    reason: err?.reason ?? err?.message ?? 'unexpected_error',
  });
});
```

### b) Middleware Refactor (No Promise Chains)

**Current Issue:** [server/lib/auth/jwt.ts:195-215](../../server/lib/auth/jwt.ts#L195-L215) uses `.then()/.catch()` which doesn't play well with Express error middleware.

**Fix:**

```typescript
// server/lib/auth/middleware.ts (REFACTORED)
import { asyncHandler } from '../helpers/asyncHandler';
import { verifyAccessToken } from './verify';

export const requireAuth = () =>
  asyncHandler(async (req, res, next) => {
    const h = req.header('authorization') ?? '';

    if (!h.startsWith('Bearer ')) {
      const e: any = new Error('missing bearer token');
      e.status = 401;
      e.reason = 'missing_token';
      throw e;
    }

    const claims = await verifyAccessToken(h.slice(7));

    (req as any).user = {
      sub: claims.sub,
      aud: claims.aud,
      roles: claims.roles ?? []
    };

    next();
  });

export const requireSecureContext = requireAuth(); // if equivalent
```

### c) JWT Verification Hardening

**Required Changes:**

```typescript
// server/lib/auth/verify.ts (ENHANCED)
import * as jose from 'jose';
import { getAuthConfig } from '../../config/auth';

const authConfig = getAuthConfig();

// JWKS with kid selection and rotation
const JWKS = jose.createRemoteJWKSet(new URL(authConfig.jwksUri!), {
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,      // 10 minutes
  cooldownDuration: 30 * 1000,       // 30 seconds
});

export async function verifyAccessToken(token: string): Promise<JWTClaims> {
  const { payload, protectedHeader } = await jose.jwtVerify(token, JWKS, {
    algorithms: ['RS256'],
    audience: authConfig.audience,    // ENFORCE from config
    issuer: authConfig.issuer,        // ENFORCE from config
    clockTolerance: '300s',           // ±5 minutes clock skew
  });

  // Validate kid is present
  if (!protectedHeader.kid) {
    const e: any = new Error('missing kid in JWT header');
    e.status = 401;
    e.reason = 'missing_kid';
    throw e;
  }

  // Validate required claims
  if (!payload.sub) {
    const e: any = new Error('missing sub claim');
    e.status = 401;
    e.reason = 'invalid_claims';
    throw e;
  }

  return payload as JWTClaims;
}
```

**Key Improvements:**
- ✅ Clock skew tolerance (±5 minutes for nbf/iat/exp)
- ✅ `kid` (key ID) selection and validation
- ✅ Enforce audience/issuer from config (don't trust token)
- ✅ Proper error types with reason codes

### d) JWKS Cache Invalidation

**Add Admin Endpoint:**

```typescript
// server/lib/auth/jwksCache.ts (NEW FILE)
import * as jose from 'jose';

let currentSet: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

export function getJWKS(url: string) {
  if (!currentSet) {
    currentSet = jose.createRemoteJWKSet(new URL(url), {
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    });
  }
  return currentSet;
}

export function invalidateJWKS(): void {
  currentSet = null;
}
```

```typescript
// server/routes/admin/auth.ts (NEW FILE)
import { Router } from 'express';
import { requireAuth, requireRole } from '../../lib/auth/middleware';
import { invalidateJWKS } from '../../lib/auth/jwksCache';

const router = Router();

router.post('/jwks/invalidate', requireAuth(), requireRole('admin'), (_req, res) => {
  invalidateJWKS();
  res.json({ ok: true, message: 'JWKS cache invalidated' });
});

export default router;
```

### e) HS256 Backward Compatibility

**Maintain Explicit Support:**

```typescript
// server/lib/auth/verify.ts (BRANCH BY ALGORITHM)
export async function verifyAccessToken(token: string): Promise<JWTClaims> {
  const authConfig = getAuthConfig();

  if (authConfig.algorithm === 'HS256') {
    // HS256 path (existing users)
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
  const { payload, protectedHeader } = await jose.jwtVerify(token, getJWKS(authConfig.jwksUri!), {
    algorithms: ['RS256'],
    audience: authConfig.audience,
    issuer: authConfig.issuer,
    clockTolerance: '300s',
  });

  if (!protectedHeader.kid) {
    throw new InvalidTokenError('missing kid', 'missing_kid');
  }

  return payload as JWTClaims;
}
```

**Add Unit Test:**

```typescript
// server/lib/auth/__tests__/backward-compat.test.ts
describe('HS256 backward compatibility', () => {
  it('should verify HS256 tokens when AUTH_ALG=HS256', async () => {
    process.env.AUTH_ALG = 'HS256';
    process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long';

    const token = signToken({ sub: 'user123', role: 'admin' });
    const claims = await verifyAccessToken(token);

    expect(claims.sub).toBe('user123');
  });
});
```

### f) Package & Config Hygiene

**Verify Dependencies:**

```bash
# Ensure jose is in dependencies (NOT devDependencies)
npm list jose
```

**Update .env.example:**

```bash
# Authentication Configuration
AUTH_ALG=RS256                                          # HS256 | RS256
AUTH_ISSUER=https://issuer.example.com                  # Your IdP issuer URL
AUTH_AUDIENCE=updog-api                                 # Your API audience
AUTH_JWKS_URL=https://issuer.example.com/.well-known/jwks.json
AUTH_CLOCK_SKEW_SEC=300                                 # ±5 minutes

# For HS256 (legacy/testing only):
# JWT_SECRET=<generate-with-npm-run-secret-gen>
```

**Create Documentation:**

```markdown
# docs/auth/RS256-SETUP.md

## RS256 JWT Authentication Setup

### Prerequisites
- Identity provider (Auth0, AWS Cognito, Azure AD, Okta, etc.)
- JWKS endpoint URL from your IdP

### Configuration

1. **Set Environment Variables:**
   ```bash
   AUTH_ALG=RS256
   AUTH_ISSUER=https://your-idp.com/
   AUTH_AUDIENCE=your-api-identifier
   AUTH_JWKS_URL=https://your-idp.com/.well-known/jwks.json
   ```

2. **Verify JWKS Endpoint:**
   ```bash
   curl https://your-idp.com/.well-known/jwks.json
   ```
   Should return JSON with `keys` array.

3. **Test Token Verification:**
   ```bash
   curl -H "Authorization: Bearer <your-test-token>" \
        http://localhost:5000/api/flags
   ```

### Key Rotation

When your IdP rotates signing keys:

1. New tokens will automatically work (JWKS fetches new keys)
2. If issues arise, invalidate cache:
   ```bash
   curl -X POST http://localhost:5000/api/admin/auth/jwks/invalidate \
        -H "Authorization: Bearer <admin-token>"
   ```

### Troubleshooting

**Error: "missing kid in JWT header"**
- Your IdP isn't including `kid` in token headers
- Check IdP configuration for JWT signing settings

**Error: "Token signature verification failed"**
- JWKS URL might be incorrect
- Check issuer/audience match exactly (including trailing slashes)

**Error: "Token has expired"**
- Check server clock sync (NTP)
- Clock skew tolerance is ±5 minutes
```

### g) Tests (REQUIRED Before Merge)

**Unit Tests:**

```typescript
// server/lib/auth/__tests__/jwt.test.ts
describe('JWT Verification', () => {
  describe('RS256', () => {
    it('should verify valid RS256 token', async () => {
      // Test with mock JWKS
    });

    it('should reject expired token', async () => {
      // Test exp claim
    });

    it('should reject token with future nbf', async () => {
      // Test nbf claim
    });

    it('should reject wrong audience', async () => {
      // Test aud validation
    });

    it('should reject wrong issuer', async () => {
      // Test iss validation
    });

    it('should reject missing kid', async () => {
      // Test kid validation
    });

    it('should reject algorithm mismatch', async () => {
      // Test algorithm spoofing prevention
    });
  });

  describe('HS256 backward compatibility', () => {
    it('should verify HS256 when configured', async () => {
      // Test HS256 path still works
    });
  });
});
```

**Integration Test:**

```typescript
// server/lib/auth/__tests__/jwks-rotation.integration.test.ts
describe('JWKS Key Rotation', () => {
  it('should handle key rotation', async () => {
    // 1. Start mock JWKS server with key A
    // 2. Sign token with key A
    // 3. Verify token succeeds
    // 4. Rotate to key B on JWKS server
    // 5. Sign new token with key B
    // 6. Verify new token succeeds
    // 7. Call invalidate endpoint
    // 8. Verify old token with key A fails
  });
});
```

---

## 2. Fund Calc PR (Improvements)

### a) Inputs (Remove Hard-Codes)

**Current Issues:**
- Line 308: `new Date().toISOString()` - should be input
- Line 268: `ownershipAtExit: 0.15` - should be configurable per stage

**Fix:**

```typescript
// shared/schemas/fund-model.ts
export const FundModelInputsSchema = z.object({
  fundSize: z.number().positive(),
  fundStartDateISO: z.string().datetime(),         // NEW
  periodLengthMonths: z.number().int().positive(),
  managementFeeRate: z.number().min(0).max(1),
  managementFeeYears: z.number().int().positive(),

  // Stage-specific ownership percentages
  stageOwnership: z.record(                         // NEW
    z.enum(['preseed', 'seed', 'seriesA', 'seriesB', 'seriesC', 'growth']),
    z.number().min(0).max(1)
  ),

  reservePoolPct: z.number().min(0).max(1),

  // ... rest of schema
});
```

```typescript
// client/src/lib/fund-calc.ts (UPDATE)
function deployCompanies(inputs: FundModelInputs): CompanyResult[] {
  // ...
  companies.push({
    companyId,
    stageAtEntry: stageAlloc.stage,
    initialInvestment,
    followOnInvestment: 0,
    totalInvested: initialInvestment,
    ownershipAtExit: inputs.stageOwnership[stageAlloc.stage] || 0.15, // ✅ From inputs
    exitBucket,
    exitValue: 0,
    proceedsToFund: 0,
  });
}

function simulatePeriods(inputs: FundModelInputs, companies: CompanyResult[]): PeriodResult[] {
  // ...
  const periodDates = generatePeriodDates(
    inputs.fundStartDateISO,  // ✅ From inputs, not new Date()
    inputs.periodLengthMonths,
    numPeriods + 1
  );
}
```

### b) Periodize Fees (Keeps DPI/TVPI Paths Sane)

**Current Issue:** Management fees are charged but not properly reflected in period cashflows.

**Fix:**

```typescript
// client/src/lib/fund-calc.ts (ENHANCE simulatePeriods)
function simulatePeriods(
  inputs: FundModelInputs,
  companies: CompanyResult[]
): PeriodResult[] {
  // ... existing setup ...

  // Calculate periods based on BOTH exits AND fee horizon
  const maxExitMonths = Math.max(
    ...inputs.stageAllocations.map(s => inputs.monthsToExit[s.stage] || 0)
  );
  const managementFeeMonths = inputs.managementFeeYears * 12;
  const simulationMonths = Math.max(maxExitMonths, managementFeeMonths); // ✅ Already fixed
  const numPeriods = Math.ceil(simulationMonths / inputs.periodLengthMonths);

  // ... rest of implementation ...

  // For each period, fees reduce NAV correctly
  for (let periodIndex = 1; periodIndex <= numPeriods; periodIndex++) {
    const periodFees = calculateManagementFee(
      inputs.fundSize,
      inputs.periodLengthMonths,
      inputs.managementFeeRate,
      inputs.managementFeeYears,
      periodIndex
    );

    // Fees come out of uninvested cash first, then reduce NAV
    uninvestedCash = uninvestedCash.minus(periodFees);

    // ✅ This already correctly reduces NAV in period calculation
  }
}
```

**Note:** The current implementation already handles this correctly (lines 380-395). Keep as-is.

### c) Reserves at Pool Level (Not Per-Stage Subtraction)

**Current Issue:** Lines 243-246 subtract reserves from each stage independently.

**Problem:** This double-counts reserves. Reserves should be a single pool.

**Fix:**

```typescript
function deployCompanies(inputs: FundModelInputs): CompanyResult[] {
  const companies: CompanyResult[] = [];
  let globalCompanyIndex = 0;

  // ✅ Calculate total reserve pool ONCE at fund level
  const totalReservePool = toDecimal(inputs.fundSize).times(inputs.reservePoolPct);
  const totalDeployableCapital = toDecimal(inputs.fundSize).minus(totalReservePool);

  // Deploy companies sequentially by stage
  inputs.stageAllocations.forEach(stageAlloc => {
    // ✅ Stage capital is fraction of DEPLOYABLE capital (not total fund size)
    const stageDeployableCapital = totalDeployableCapital.times(stageAlloc.allocationPct);

    // ❌ REMOVE this line (no per-stage reserve subtraction):
    // const reserveCapital = stageCapital.times(inputs.reservePoolPct);
    // const deployableCapital = stageCapital.minus(reserveCapital);

    const avgCheckSize = toDecimal(inputs.averageCheckSizes[stageAlloc.stage] || 0);
    const numCompanies = stageDeployableCapital.dividedToIntegerBy(avgCheckSize).toNumber();

    // ... rest of company deployment ...
  });

  return companies;
}
```

### d) Follow-on Logic: Implement or Remove

**Current Issue:** Line 266 says "will be calculated" but it's never implemented.

**Option 1 - Minimal Deterministic Implementation:**

```typescript
function simulatePeriods(
  inputs: FundModelInputs,
  companies: CompanyResult[]
): PeriodResult[] {
  // ... existing setup ...

  let remainingReservePool = toDecimal(inputs.fundSize).times(inputs.reservePoolPct);

  for (let periodIndex = 1; periodIndex <= numPeriods; periodIndex++) {
    const periodMonths = periodIndex * inputs.periodLengthMonths;

    // Handle company graduations (deterministic)
    companies.forEach(company => {
      const stageGradMonths = inputs.monthsToGraduate[company.stageAtEntry] || 0;

      if (periodMonths >= stageGradMonths && company.followOnInvestment === 0) {
        // Simple deterministic follow-on: 50% of initial check
        const targetFollowOn = toDecimal(company.initialInvestment).times(0.5);
        const actualFollowOn = Decimal.min(targetFollowOn, remainingReservePool);

        company.followOnInvestment = actualFollowOn.toNumber();
        company.totalInvested += company.followOnInvestment;
        remainingReservePool = remainingReservePool.minus(actualFollowOn);
      }
    });

    // ... rest of period simulation ...
  }
}
```

**Option 2 - Remove for Now:**

```typescript
// Remove followOnInvestment field entirely
companies.push({
  companyId,
  stageAtEntry: stageAlloc.stage,
  initialInvestment,
  // followOnInvestment: 0,  // ❌ REMOVED
  totalInvested: initialInvestment,
  ownershipAtExit: inputs.stageOwnership[stageAlloc.stage],
  exitBucket,
  exitValue: 0,
  proceedsToFund: 0,
});
```

**Recommendation:** Option 2 (remove) for this PR, implement in follow-up PR with proper reserve optimization logic.

### e) Tests (Golden Fixtures)

**Create Test Fixtures:**

```typescript
// tests/fixtures/fund-calc/smoke-test.json
{
  "name": "Smoke test - no reserves, no exits",
  "inputs": {
    "fundSize": 100000000,
    "fundStartDateISO": "2025-01-01T00:00:00.000Z",
    "periodLengthMonths": 3,
    "managementFeeRate": 0.02,
    "managementFeeYears": 10,
    "stageOwnership": {
      "seed": 0.15,
      "seriesA": 0.12
    },
    "reservePoolPct": 0,
    "stageAllocations": [
      { "stage": "seed", "allocationPct": 0.6 },
      { "stage": "seriesA", "allocationPct": 0.4 }
    ],
    "averageCheckSizes": {
      "seed": 1000000,
      "seriesA": 2000000
    },
    "monthsToGraduate": {
      "seed": 12,
      "seriesA": 18
    },
    "monthsToExit": {
      "seed": 60,
      "seriesA": 72
    }
  },
  "expected": {
    "numPeriods": 40,
    "finalTVPI": 2.5,
    "finalDPI": 1.8,
    "totalManagementFees": 20000000
  }
}
```

```typescript
// tests/fund-calc.test.ts
import { runFundModel } from '../client/src/lib/fund-calc';
import smokeTest from './fixtures/fund-calc/smoke-test.json';

describe('Fund Calculation Engine - Golden Fixtures', () => {
  it('should match golden fixture: smoke test', () => {
    const result = runFundModel(smokeTest.inputs);

    expect(result.periodResults).toHaveLength(smokeTest.expected.numPeriods);
    expect(result.kpis.tvpi).toBeCloseTo(smokeTest.expected.finalTVPI, 2);
    expect(result.kpis.dpi).toBeCloseTo(smokeTest.expected.finalDPI, 2);

    const totalFees = result.periodResults.reduce(
      (sum, p) => sum + p.managementFees, 0
    );
    expect(totalFees).toBeCloseTo(smokeTest.expected.totalManagementFees, -3);
  });
});
```

**CSV Export Test:**

```typescript
// tests/csv-export.test.ts
import { convertToCSV } from '../server/routes/calculations';

describe('CSV Export', () => {
  it('should export period results to CSV with correct formatting', () => {
    const periodResults = [
      {
        periodIndex: 0,
        periodStart: '2025-01-01T00:00:00.000Z',
        periodEnd: '2025-03-31T23:59:59.999Z',
        contributions: 100000000,
        investments: 60000000,
        managementFees: 500000,
        exitProceeds: 0,
        distributions: 0,
        unrealizedPnl: 0,
        nav: 39500000,
        tvpi: 0.395,
        dpi: 0,
        irrAnnualized: 0,
      },
    ];

    const csv = convertToCSV(periodResults);
    const lines = csv.split('\n');

    expect(lines[0]).toContain('periodIndex,periodStart,periodEnd');
    expect(lines[1]).toContain('0,2025-01-01');
    expect(lines[1]).toContain('100000000.00'); // Currency formatting
  });
});
```

---

## 3. Review Completion Checklist

### Auth PR
- [ ] PRs split (Auth = P0; Calc = Feature)
- [ ] Async handling via `asyncHandler` + global error middleware
- [ ] RS256 verifier enforces `aud/iss`, `kid`, `clockTolerance`
- [ ] JWKS invalidate endpoint in place
- [ ] `jose` in dependencies (not devDependencies)
- [ ] `.env.example` + `docs/auth/RS256-SETUP.md` updated
- [ ] HS256 path still works when `AUTH_ALG=HS256`
- [ ] Auth tests (unit + integration) pass locally/CI

### Fund Calc PR
- [ ] Fees periodized correctly (already done)
- [ ] `fundStartDateISO` + `stageOwnership` inputs wired
- [ ] Reserve modeled at pool level (not per-stage subtraction)
- [ ] Follow-on either implemented or removed (recommend remove)
- [ ] Golden fixture tests added
- [ ] CSV export tests added

---

## Additional Notes

### File Organization Suggestion

Consider splitting auth concerns for better maintainability:

```
server/lib/auth/
  ├── jwksCache.ts      # JWKS management
  ├── verify.ts         # Token verification
  ├── middleware.ts     # Express middleware
  └── errors.ts         # Custom error types
```

### Path Aliases

Keep using Vite aliases (`@/`, `@shared/`) to avoid brittle relative paths when moving calc code into shared lib later.

---

## Summary

**Auth PR** requires security-critical fixes (async error handling, JWKS hardening, tests) before merge.

**Fund Calc PR** is architecturally sound but needs input configuration and reserve logic corrections.

Both PRs show solid understanding of the domain and good implementation direction. The blocking issues are straightforward to address.
