---
type: reflection
id: REFL-010
title: Trust Proxy Configuration for Rate Limiters
status: VERIFIED
date: 2026-01-18
version: 1
severity: high
wizard_steps: []
error_codes: [ERR_TRUST_PROXY, RATE_LIMIT_BYPASS]
components: [server, security, express, rate-limiting]
keywords: [trust-proxy, rate-limiter, express, x-forwarded-for, reverse-proxy, load-balancer]
test_file: tests/regressions/REFL-010.test.ts
superseded_by: null
---

# Reflection: Trust Proxy Configuration for Rate Limiters

## 1. The Anti-Pattern (The Trap)

**Context:** Rate limiters behind reverse proxies (nginx, load balancers, Cloudflare) see the proxy's IP instead of the client's real IP, causing all requests to be rate-limited as one user.

**How to Recognize This Trap:**
1.  **Error Signal:** Rate limiter triggers for all users simultaneously; or rate limiting doesn't work at all (if using proxy IP as key)
2.  **Code Pattern:** Rate limiter without trust proxy configuration:
    ```typescript
    // ANTI-PATTERN
    const app = express();
    // Missing: app.set('trust proxy', 1);

    app.use(rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      keyGenerator: (req) => req.ip, // Returns proxy IP, not client IP!
    }));
    ```
3.  **Mental Model:** Assuming `req.ip` returns the client's IP. Behind a proxy, it returns the proxy's IP unless `trust proxy` is configured.

**Financial Impact:** Either all users get rate-limited together (DoS on legitimate users) or rate limiting is ineffective (security vulnerability).

> **DANGER:** Do NOT deploy rate limiters behind reverse proxies without configuring `trust proxy`.

## 2. The Verified Fix (The Principle)

**Principle:** Configure `trust proxy` to match your infrastructure before enabling rate limiting.

**Implementation Pattern:**
1.  Identify your proxy depth (how many proxies between client and app)
2.  Set `trust proxy` appropriately
3.  Verify `req.ip` returns expected values in staging

```typescript
// VERIFIED IMPLEMENTATION
import express from 'express';
import rateLimit from 'express-rate-limit';

const app = express();

// Configure trust proxy BEFORE rate limiter middleware
// Options:
// - true: Trust all proxies (use with caution)
// - 1: Trust first proxy (common for single LB/nginx)
// - 2: Trust two proxies (e.g., Cloudflare + nginx)
// - 'loopback': Trust loopback addresses only
// - ['10.0.0.0/8']: Trust specific CIDR ranges

// For single reverse proxy (nginx, ALB, etc.)
app.set('trust proxy', 1);

// Rate limiter now uses correct client IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // req.ip now returns client IP from X-Forwarded-For
    return req.ip ?? 'unknown';
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

app.use('/api/', limiter);

// Verify configuration in health check
app.get('/healthz', (req, res) => {
  res.json({
    clientIp: req.ip,
    forwardedFor: req.headers['x-forwarded-for'],
    trustProxy: app.get('trust proxy'),
  });
});
```

**Security Considerations:**
1. Never set `trust proxy: true` in production without understanding implications
2. Verify X-Forwarded-For header is set by your actual proxy
3. Attackers can spoof X-Forwarded-For if trust proxy is misconfigured
4. Test rate limiting from multiple real IPs before deploying

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-010.test.ts` validates proxy configuration
*   **Source Session:** Jan 1-7 2026 - rate limiter failures in CI
*   **Express Docs:** https://expressjs.com/en/guide/behind-proxies.html
