---
status: ACTIVE
last_updated: 2026-01-19
---

# Codex Issues Resolution Plan

**Generated**: 2025-10-04
**Status**: AI Consensus Achieved
**Priority**: Critical (P0) + High (P1)

---

## 🎯 AI Consensus Summary

After consulting **Gemini, OpenAI, and DeepSeek**, there is **unanimous agreement** on the optimal revision strategy:

### **Recommended Approach: Hybrid Strategy (Option B+C)**

**Consensus Decision**:
1. **P0 #1 (RS256 JWT)**: Create immediate hotfix branch from `main`
2. **P1 #2 & #3 (Client bugs)**: Create separate fix branches from `feat/iteration-a-deterministic-engine`

### **Rationale (All AIs Agree)**:
- ✅ **Production Impact**: P0 JWT regression blocks production auth → requires immediate isolation
- ✅ **Development Velocity**: Maintains Iteration A momentum (50% complete)
- ✅ **Risk Mitigation**: Separates emergency fix from incomplete features
- ✅ **Team Momentum**: Unblocks development while addressing production fire

---

## 📋 Execution Plan

### **Phase 1: P0 Hotfix (Immediate)** 🔥

#### Issue: RS256 JWT Regression
**Severity**: P0 - Critical Production Blocker
**Impact**: All requests rejected with 401 in RS256-configured environments

#### Action Plan

**Step 1: Create Hotfix Branch**
```bash
# Create from main/production
git checkout main
git pull origin main
git checkout -b hotfix/jwt-rs256-restoration

# Target files
# server/lib/auth/jwt.ts
# server/config/auth.ts (new)
```

**Step 2: Implementation** (AI Consensus Design)

All three AIs recommend using the **`jose`** library (Gemini) or **`jsonwebtoken` + `jwks-rsa`** (OpenAI, DeepSeek) with the following features:

**Core Requirements**:
1. ✅ Support both HS256 and RS256 based on `JWT_ALGORITHM` env var
2. ✅ JWKS client with caching/rate-limiting for RS256
3. ✅ Issuer and audience validation
4. ✅ Timing claim checks (exp, nbf, iat) with clock skew leeway
5. ✅ **Algorithm spoofing prevention** (critical security fix)
6. ✅ Backward compatibility with HS256 deployments

**Recommended Implementation** (Synthesized from AI designs):

```typescript
// server/config/auth.ts (NEW)
export interface AuthConfig {
  algorithm: 'HS256' | 'RS256';
  secret?: string;      // For HS256
  jwksUri?: string;     // For RS256
  issuer: string;
  audience: string;
}

export const authConfig: AuthConfig = (() => {
  const algorithm = process.env.JWT_ALGORITHM as 'HS256' | 'RS256';
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;

  // Fail-fast validation
  if (!issuer || !audience) {
    throw new Error('JWT_ISSUER and JWT_AUDIENCE are required');
  }

  if (algorithm === 'HS256') {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET required for HS256');
    if (secret.length < 32) console.warn('JWT_SECRET should be ≥32 chars');
    return { algorithm, secret, issuer, audience };
  }

  if (algorithm === 'RS256') {
    const jwksUri = process.env.JWKS_URI;
    if (!jwksUri) throw new Error('JWKS_URI required for RS256');
    return { algorithm, jwksUri, issuer, audience };
  }

  // Default to HS256 for backward compatibility
  if (!algorithm) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET required (defaulting to HS256)');
    console.warn('JWT_ALGORITHM not set, defaulting to HS256');
    return { algorithm: 'HS256', secret, issuer, audience };
  }

  throw new Error(`Unsupported JWT_ALGORITHM: ${algorithm}`);
})();
```

```typescript
// server/lib/auth/jwt.ts (REFACTORED)
import { jwtVerify, createRemoteJWKSet, JWTPayload, errors } from 'jose';
import { authConfig } from '../config/auth';

// Initialize once at module load
const jwksClient = authConfig.jwksUri
  ? createRemoteJWKSet(new URL(authConfig.jwksUri))
  : null;

const hmacSecret = authConfig.secret
  ? new TextEncoder().encode(authConfig.secret)
  : null;

export class InvalidTokenError extends Error {
  constructor(message = 'Invalid or expired access token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  try {
    const options = {
      issuer: authConfig.issuer,
      audience: authConfig.audience,
      // CRITICAL: Prevent algorithm spoofing
      algorithms: [authConfig.algorithm],
    };

    let result;

    if (authConfig.algorithm === 'RS256') {
      if (!jwksClient) throw new Error('JWKS client not initialized');
      result = await jwtVerify(token, jwksClient, options);
    } else { // HS256
      if (!hmacSecret) throw new Error('HMAC secret not initialized');
      result = await jwtVerify(token, hmacSecret, options);
    }

    return result.payload;

  } catch (error) {
    if (error instanceof errors.JOSEError) {
      console.error(`JWT Verification Failed: ${error.code} - ${error.message}`);
    } else {
      console.error('Unexpected JWT error:', error);
    }
    throw new InvalidTokenError();
  }
}
```

**Step 3: Testing Checklist**
- [ ] Unit tests for HS256 verification
- [ ] Unit tests for RS256 verification with mock JWKS
- [ ] Integration test with real JWKS endpoint
- [ ] Test algorithm spoofing prevention (HS256 token → RS256 verifier)
- [ ] Test issuer/audience validation
- [ ] Test timing claims (expired, nbf, iat)
- [ ] Test backward compatibility (existing HS256 deployments)

**Step 4: Deployment**
```bash
# Deploy to staging
git push origin hotfix/jwt-rs256-restoration

# Create PR to main
gh pr create --title "HOTFIX: Restore RS256 JWT + JWKS support (P0)" \
  --body "Critical fix for PR #88 regression. Restores RS256/JWKS validation with security hardening."

# After approval & testing
git checkout main
git merge hotfix/jwt-rs256-restoration
git push origin main

# Deploy to production
# (follow your deployment process)

# Cherry-pick to feature branch
git checkout feat/iteration-a-deterministic-engine
git cherry-pick <hotfix-commits>
git push origin feat/iteration-a-deterministic-engine
```

**Timeline**: **24-48 hours** (urgent)

---

### **Phase 2: P1 Fixes (Parallel Development)** 🛠️

While hotfix is in review, address P1 issues to unblock development.

---

#### Issue P1 #2: useFundSelector Export Crash

**Severity**: P1 - Blocks Development Environment
**Impact**: `TypeError: Assignment to constant variable` on dev startup

**Action Plan**:

**Step 1: Create Fix Branch**
```bash
git checkout feat/iteration-a-deterministic-engine
git pull origin feat/iteration-a-deterministic-engine
git checkout -b fix/dev-crash-useFundSelector
```

**Step 2: Implementation**

**Current Broken Code** (`client/src/stores/useFundSelector.ts:72-78`):
```typescript
// ❌ CRASH: Cannot reassign exported const
if (isDevelopment) {
  (useFundSelector as any) = wrapSelector(useFundSelector);
}
```

**Fixed Code** (AI Consensus):
```typescript
// ✅ Option 1: Wrapper function (Recommended)
function useFundSelectorImpl(...args) {
  // ... actual implementation
}

export function useFundSelector(...args) {
  const selector = useFundSelectorImpl(...args);
  return isDevelopment ? wrapSelector(selector) : selector;
}

// ✅ Option 2: Conditional export
const baseFundSelector = (...args) => { /* implementation */ };

export const useFundSelector = isDevelopment
  ? wrapSelector(baseFundSelector)
  : baseFundSelector;
```

**Step 3: Testing**
- [ ] Dev server starts without errors
- [ ] Components can import `useFundSelector`
- [ ] Hot module replacement works
- [ ] Wrapper only active in development
- [ ] Production build excludes wrapper

**Step 4: Merge**
```bash
git add client/src/stores/useFundSelector.ts
git commit -m "fix: Prevent useFundSelector export reassignment crash

P1 fix for PR #88 regression. Replaces read-only export reassignment
with wrapper pattern to restore dev environment functionality.

Before: TypeError on first import
After: Clean dev startup with debug wrapper active"

git push origin fix/dev-crash-useFundSelector
gh pr create --base feat/iteration-a-deterministic-engine \
  --title "Fix: useFundSelector dev environment crash (P1)"

# Merge after review
git checkout feat/iteration-a-deterministic-engine
git merge fix/dev-crash-useFundSelector
```

**Timeline**: **4-8 hours**

---

#### Issue P1 #3: Investment Strategy Data Loss

**Severity**: P1 - Silent Data Corruption
**Impact**: User input lost when navigating wizard steps

**Action Plan**:

**Step 1: Create Fix Branch**
```bash
git checkout feat/iteration-a-deterministic-engine
git checkout -b fix/data-loss-investmentStrategy
```

**Step 2: Implementation**

**Current Broken Code** (`client/src/pages/InvestmentStrategyStep.tsx:34-140`):
```typescript
// ❌ DATA LOSS: Local state never persists
const InvestmentStrategyStep: React.FC = () => {
  const [strategy, setStrategy] = useState({ /* default */ });
  // Never reads from store, never writes to store
  return <Form data={strategy} onChange={setStrategy} />;
};
```

**Fixed Code**:
```typescript
// ✅ PERSISTENT: Wire to fund store
import { useFundStore } from '@/stores/fundStore';

const InvestmentStrategyStep: React.FC = () => {
  const { fundData, updateFund } = useFundStore();

  const handleChange = (field: string, value: any) => {
    updateFund({
      ...fundData,
      investmentStrategy: {
        ...fundData.investmentStrategy,
        [field]: value
      }
    });
  };

  return (
    <Form
      data={fundData.investmentStrategy}
      onChange={handleChange}
    />
  );
};
```

**Step 3: Testing**
- [ ] Data persists across wizard navigation
- [ ] Refresh doesn't lose data (if using localStorage)
- [ ] Integration test: fill form → next step → back → verify data
- [ ] Downstream calculations use correct data

**Step 4: Merge**
```bash
git add client/src/pages/InvestmentStrategyStep.tsx
git commit -m "fix: Wire InvestmentStrategyStep to fund store

P1 fix for PR #88 regression. Replaces local useState with fund store
integration to prevent silent data loss during wizard navigation.

Before: Data lost when unmounting component
After: Data persists via central store"

git push origin fix/data-loss-investmentStrategy
gh pr create --base feat/iteration-a-deterministic-engine \
  --title "Fix: Investment strategy data persistence (P1)"

# Merge after review
git checkout feat/iteration-a-deterministic-engine
git merge fix/data-loss-investmentStrategy
```

**Timeline**: **6-12 hours**

---

## 📊 Timeline Summary

| Phase | Issue | Priority | Timeline | Status |
|-------|-------|----------|----------|--------|
| **1** | RS256 JWT regression | P0 | 24-48h | 🔥 Immediate |
| **2a** | useFundSelector crash | P1 | 4-8h | ⏱️ Parallel |
| **2b** | Data loss bug | P1 | 6-12h | ⏱️ Parallel |

**Total Estimated Time**: **2-3 days** for all fixes

---

## ✅ Success Criteria

### P0 Hotfix Success
- [ ] RS256 + JWKS validation working in staging
- [ ] HS256 backward compatibility verified
- [ ] Algorithm spoofing prevented
- [ ] Zero production downtime
- [ ] Deployed to production
- [ ] Cherry-picked to feature branch

### P1 Fixes Success
- [ ] Dev environment starts cleanly
- [ ] Wizard data persists across navigation
- [ ] Integration tests passing
- [ ] Merged to feature branch
- [ ] No regression in existing features

---

## 🎯 Post-Fix Actions

### Documentation
- [ ] Update JWT configuration docs
- [ ] Add migration guide (HS256 → RS256)
- [ ] Document environment variables
- [ ] Create ADR for JWT architecture

### Process Improvements
- [ ] Add pre-merge Codex check to checklist
- [ ] Create E2E test for wizard data persistence
- [ ] Add JWT auth tests (HS256 + RS256)
- [ ] Set up dev environment smoke tests

### Monitoring
- [ ] Track JWT verification success/failure rates
- [ ] Monitor JWKS cache hit rate
- [ ] Alert on algorithm mismatch attempts
- [ ] Track wizard completion rates (detect data loss)

---

## 📚 AI Collaboration Summary

**Gemini**:
- ✅ Recommended `jose` library (modern, zero-dep, strict security)
- ✅ Emphasized fail-fast config validation
- ✅ Detailed JWKS caching strategy
- ✅ Strong separation of concerns

**OpenAI**:
- ✅ Recommended `jsonwebtoken` + `jwks-rsa` (battle-tested)
- ✅ Comprehensive error handling taxonomy
- ✅ Gradual rollout strategy
- ✅ Backward compatibility focus

**DeepSeek**:
- ✅ Detailed security analysis (timing attacks, spoofing)
- ✅ Custom error types with specific codes
- ✅ Max token age enforcement
- ✅ Comprehensive testing strategy

**Consensus**:
- All AIs agree on **hybrid hotfix strategy** (Option B+C)
- All AIs emphasize **algorithm spoofing prevention** as critical
- All AIs recommend **separate branches** for P0 vs P1
- All AIs support **backward compatibility** with HS256

---

## 🚀 Ready to Execute

This plan has been validated by 3 leading AI systems and represents the optimal balance of:
- ✅ **Production stability** (immediate P0 hotfix)
- ✅ **Development velocity** (parallel P1 fixes)
- ✅ **Risk mitigation** (isolated branches)
- ✅ **Team momentum** (50% through Iteration A)
- ✅ **Technical quality** (comprehensive security fixes)

**Approval Required**: Review and approve before execution
**Owner**: [Assign developer/team]
**Start Date**: [Today]
**Completion Target**: 2-3 days
