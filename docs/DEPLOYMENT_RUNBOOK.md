# 🚀 Production Deployment Runbook

## Overview

This runbook covers the enhanced deployment process with weighted error monitoring, automatic rollback capabilities, and emergency failsafes.

## Pre-Deployment Checklist

### 1. Environment Configuration
```bash
# Production environment variables (set in hosting platform)
VITE_USE_FUND_STORE_ROLLOUT=10        # Start at 10% canary
VITE_TRACK_MIGRATIONS=1               # Enable for first 24h
VITE_USE_FUND_STORE=true              # Default flag
```

### 2. Local Validation
```powershell
# Run full local validation
pwsh scripts/validate-local.ps1

# Check build and dependencies
npm ci && npm run build
```

### 3. PR Size Check (Optional)
```bash
# Quick sanity check - should be <1000 lines for fund store migration
gh pr diff 48 --stat | tail -1
```

## Deployment Process

### Phase 1: Prepare PR (No Merge)
```powershell
# Two-phase finalize - prepares PR but doesn't merge yet
pwsh scripts/finalize-pr.ps1 -PR 48 -NoMerge -RunE2E
```

**Expected outcome:** PR labeled, E2E triggered, ready for review

### Phase 2: Merge When Green
```powershell
# Option A: Automated deployment with auto-revert capability
pwsh scripts/deploy-with-confidence.ps1 -PR 48 -AutoRevert

# Option B: Manual merge
gh pr merge 48 --squash --auto
```

**Expected outcome:** Code merged to main, deployment triggered

### Phase 3: Canary Monitoring (10% rollout)
```powershell
# Monitor with weighted error scoring and circuit breaker
pwsh scripts/monitor-deployment.ps1 -MinutesToMonitor 60 -ErrorThreshold 15 -AutoRevert
```

**Error Scoring:**
- Migration failures: 10 points (critical)
- Validation errors: 5 points (moderate)
- Console warnings: 1 point (low)
- Default errors: 3 points

**Circuit Breaker:** 3+ consecutive high-score checks trigger rollback

### Phase 4: Scale Rollout

#### Accelerated Timeline (if zero errors)
- **0-30 min at 10%**: If zero errors → jump to 50%
- **0-2 hours at 50%**: If clean → jump to 100%

#### Conservative Timeline (if some errors)
- **60-90 min at 10%**: If errors < threshold → 50%
- **6+ hours at 50%**: If stable → 100%

```bash
# Update rollout percentage in hosting platform
VITE_USE_FUND_STORE_ROLLOUT=50   # Then 100
```

### Phase 5: 24h Monitoring
- Keep `VITE_TRACK_MIGRATIONS=1` for full day
- Watch for:
  - Migration success rate ≥ 99.5%
  - Client error rate < 0.1%
  - Kill-switch usage ≤ 5 users

### Phase 6: Stabilization
After 24h at 100%:
```bash
# Reduce telemetry noise
VITE_TRACK_MIGRATIONS=0

# Optional: Lock flag to "on" as default
VITE_USE_FUND_STORE=true
```

## Emergency Procedures

### Runtime Kill Switch (Immediate)
```javascript
// Option 1: URL parameter (temporary)
https://yourapp.com/fund-setup?ff_useFundStore=0

// Option 2: localStorage (persistent)
localStorage.setItem('ff_useFundStore', '0'); location.reload();

// Option 3: Emergency rollback (nuclear option)
localStorage.setItem('emergency_rollback', 'true'); location.reload();
// or: https://yourapp.com/fund-setup?emergency_rollback=true
```

### Hard Rollback (Infrastructure)
```powershell
# Automatic revert PR creation
pwsh scripts/monitor-deployment.ps1 -AutoRevert

# Manual environment rollback
VITE_USE_FUND_STORE_ROLLOUT=0
VITE_USE_FUND_STORE=false
```

### Rollback Verification
```powershell
# Verify rollback worked
pwsh scripts/validate-local.ps1
curl -s https://yourapp.com/health | jq '.store_type'  # Should show "legacy"
```

## Monitoring Signals

### Green (Continue Rollout)
- ✅ Error score: 0-5 points
- ✅ Migration success: >99.5%
- ✅ No console errors in telemetry
- ✅ Kill-switch usage: <5 users

### Yellow (Hold/Investigate)
- ⚠️ Error score: 6-14 points
- ⚠️ Migration success: 95-99.5%
- ⚠️ Moderate console warnings
- ⚠️ Kill-switch usage: 5-20 users

### Red (Rollback)
- 🚨 Error score: 15+ points
- 🚨 Migration success: <95%
- 🚨 Critical console errors
- 🚨 Kill-switch usage: >20 users

## API Configuration & Idempotency

### Idempotency Settings
The fund creation API uses request idempotency to prevent duplicate operations:

**TTL & Storage:**
- **Default TTL:** 24 hours for idempotency keys
- **Storage:** PostgreSQL table `idempotency_store` 
- **Cleanup:** Automated via cron job (daily cleanup of expired keys)

**Environment Scoping:**
- Keys are namespaced per environment (e.g., `prod|fund-create|<hash>`)
- Client hash includes environment mode to prevent cross-env collisions
- Server validates idempotency keys against current environment

**Conflict Handling:**
- Same key + same body → 200 with `Idempotency-Status: replayed`
- Same key + different body → 409 with clear JSON error payload
- Failed requests are not cached (can be retried with same key)

**Client Behavior on 409:**
Users should review their input and either:
1. Use a different request (generates new idempotency key)
2. Wait for the original request to complete if still processing

### Server Response Headers
```
Idempotency-Key: <client-provided-key>
Idempotency-Status: created|replayed|conflict
```

### Monitoring
Track these metrics for idempotency health:
- `fund_create_conflict` (409 responses per minute)
- `idempotency_cache_hit_rate` 
- `idempotency_storage_size` (number of active keys)

## Files and Scripts Reference

### Key Scripts
- `scripts/validate-local.ps1` - Pre-deployment validation
- `scripts/finalize-pr.ps1` - Two-phase PR preparation
- `scripts/deploy-with-confidence.ps1` - Automated deployment
- `scripts/monitor-deployment.ps1` - Weighted error monitoring

### Configuration Files
- `client/src/config/rollout.ts` - Feature rollout logic
- `client/src/config/features.ts` - Feature flag configuration
- `client/src/lib/telemetry.ts` - Error tracking
- `.github/labeler.yml` - Auto-labeling for risky paths

### Emergency Files
- `client/src/main.tsx` - Emergency rollback check
- `docs/ROLLBACK.md` - Detailed rollback procedures

## Troubleshooting

### Common Issues

**Migration Failures**
- Check localStorage quota (older browsers)
- Verify legacy data format
- Look for race conditions during migration

**Rollout Issues**
- Verify UUID generation (check browser compatibility)
- Check FNV-1a hash consistency
- Validate environment variable propagation

**Monitoring False Positives**
- Review weighted error scoring
- Check telemetry buffer size (max 200 events)
- Verify GitHub issues API connectivity

### Support Commands
```powershell
# Debug rollout status
window.__rollouts.debugRollouts()

# Check user bucket
window.__rollouts.getUserBucket('USE_FUND_STORE')

# View telemetry buffer
cat ./telemetry-buffer.json | jq '.[] | select(.category == "error")'
```

## Success Criteria

✅ **Deployment Complete When:**
- 100% rollout active for 24+ hours
- Error score consistently <5
- Migration success rate >99.5%
- Kill-switch usage <5 total users
- No production issues reported

---

*Last updated: 2025-08-11*
*Version: 2.0 - Enhanced with weighted monitoring*
