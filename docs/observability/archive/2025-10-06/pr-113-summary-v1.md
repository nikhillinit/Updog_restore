# PR #113 Review Summary

**Date:** 2025-10-06
**Reviewer:** Claude Code
**Status:** 🟡 **Requires Changes** (blocking issues identified)

---

## Quick Summary

PR #113 contains **excellent work** on two important features, but they need to be **split into separate PRs** for proper review:

1. **RS256 JWT Authentication** (P0 security fix) - Has blocking async error handling issues
2. **Deterministic Fund Calc Engine** (new feature) - Has configuration and reserve logic issues

---

## Next Steps

### 1. Split the PR (Required)

Choose one of these methods:

**Option A - Cherry-pick (Recommended):**
```bash
# Create auth branch
git checkout main && git pull
git checkout -b fix/rs256-jwt-auth
git cherry-pick <auth-commit-hash>
git push -u origin fix/rs256-jwt-auth

# Create fund calc branch
git checkout main
git checkout -b feat/deterministic-fund-engine
git cherry-pick <calc-commit-1> <calc-commit-2>
git push -u origin feat/deterministic-fund-engine
```

**Full instructions:** [docs/observability/pr-113-split-instructions.md](./pr-113-split-instructions.md)

### 2. Fix Auth PR Blocking Issues

**Critical issues:**
- ✅ Async error handling (Express doesn't auto-catch async errors)
- ✅ JWT verification hardening (clock skew, kid validation, aud/iss enforcement)
- ✅ JWKS cache invalidation endpoint
- ✅ HS256 backward compatibility maintained
- ✅ Unit + integration tests

**Detailed fixes:** [docs/observability/pr-113-auth-comment.md](./pr-113-auth-comment.md)

### 3. Fix Fund Calc PR Issues

**Issues to address:**
- ✅ Make `fundStartDate` and `stageOwnership` configurable (remove hard-codes)
- ✅ Fix reserve allocation (pool-level, not per-stage)
- ✅ Implement or remove follow-on investment tracking
- ✅ Add golden fixture tests
- ✅ Add CSV export tests

**Detailed fixes:** [docs/observability/pr-113-fundcalc-comment.md](./pr-113-fundcalc-comment.md)

---

## What's Good (Keep This!)

### Auth Changes ✅
- Algorithm allow-listing prevents algorithm confusion attacks
- JWKS implementation with proper caching
- Fail-fast configuration validation
- Custom error types with reason codes

### Fund Calc Changes ✅
- Deterministic design (no RNG)
- Decimal.js prevents floating-point errors
- Clear period-by-period tracking
- Good separation of concerns
- Management fee horizon fix (lines 295-304) is correct

---

## Approval Blockers

### Auth PR
- [ ] Async error handling fixed
- [ ] JWT verification hardened (clock skew, kid, aud/iss)
- [ ] JWKS invalidation endpoint added
- [ ] HS256 backward compat maintained
- [ ] `jose` in dependencies
- [ ] Tests passing (unit + integration)
- [ ] Documentation complete

### Fund Calc PR
- [ ] `fundStartDateISO` input added
- [ ] `stageOwnership` input added
- [ ] Reserve logic fixed (pool-level)
- [ ] Follow-on logic implemented or removed
- [ ] Golden fixture tests added
- [ ] CSV export tests added

---

## Resources

📄 **Complete Review:** [docs/observability/pr-113-review.md](./pr-113-review.md)
🔒 **Auth Review Comment:** [docs/observability/pr-113-auth-comment.md](./pr-113-auth-comment.md)
📊 **Fund Calc Review Comment:** [docs/observability/pr-113-fundcalc-comment.md](./pr-113-fundcalc-comment.md)
🔀 **Split Instructions:** [docs/observability/pr-113-split-instructions.md](./pr-113-split-instructions.md)

---

## Questions?

Feel free to ask about any of the review feedback. Happy to clarify or provide additional examples for any of the fixes.

The work here is solid - just needs some security hardening on the auth side and configuration cleanup on the calc side. Both are straightforward to address.

Looking forward to the updated PRs! 🚀
