# Rollback Triggers for Reserves v1.1

## Automatic Rollback Triggers

The following conditions will trigger an automatic rollback of the reserves v1.1 feature:

### 1. Error Rate Threshold
- **Trigger**: Error rate > 0.1% (1 in 1000 calculations fail)
- **Monitoring**: `/api/metrics/gate` endpoint
- **Action**: Feature flag `ff_reserves_v11` automatically set to `false`

### 2. Performance Degradation
- **Trigger**: P95 latency > 500ms for deterministic calculations
- **Target**: 300ms with 200ms buffer for variance
- **Monitoring**: Performance metrics beacon
- **Action**: Canary promotion halted, rollback initiated

### 3. Conservation Violations
- **Trigger**: Conservation warnings > 1% of calculations
- **Description**: When allocated + remaining ≠ available (beyond rounding tolerance)
- **Monitoring**: Audit log warnings
- **Action**: Shadow mode enabled, investigation required

### 4. Unhandled Exceptions
- **Trigger**: Any unhandled exception reaching user
- **Monitoring**: Error tracking system
- **Action**: Immediate feature flag disable

## Manual Rollback Procedures

### Quick Rollback (< 30 seconds)

1. **Feature Flag Kill Switch**
   ```javascript
   // In browser console or admin panel
   killSwitch('reserves_v11');
   ```

2. **URL Override**
   ```
   https://app.example.com?force_reserves_engine=legacy
   ```

3. **Meta Tag Update** (for all users)
   ```html
   <meta name="kill-switch-flags" content="reserves_v11,shadow_compare">
   ```

### Standard Rollback (2-5 minutes)

1. **Update Feature Flag Default**
   ```javascript
   // In feature-flags.ts
   reserves_v11: {
     defaultValue: false, // Changed from true
     rolloutPercent: 0,  // Changed from current value
   }
   ```

2. **Deploy Configuration Change**
   ```bash
   git checkout main
   git pull
   git checkout -b hotfix/disable-reserves-v11
   # Edit feature-flags.ts
   git add .
   git commit -m "hotfix: disable reserves v1.1"
   git push
   # Merge and deploy
   ```

3. **Clear User Overrides**
   ```javascript
   // Admin script
   clearAllUserFlags('reserves_v11');
   ```

### Database Rollback (if applicable)

```sql
-- Only if schema changes were made
BEGIN;
-- Restore previous schema
ALTER TABLE reserves_audit RENAME TO reserves_audit_v11_backup;
-- Restore previous data
COMMIT;
```

## Monitoring During Rollback

### Key Metrics to Watch

1. **Error Rate Recovery**
   - Target: < 0.01% within 5 minutes
   - Monitor: `/api/metrics/reserves/errors`

2. **Performance Recovery**
   - Target: P95 < 100ms within 2 minutes
   - Monitor: `/api/metrics/reserves/latency`

3. **User Impact**
   - Monitor: Active sessions affected
   - Track: Support tickets created

### Verification Steps

1. **Confirm Feature Disabled**
   ```bash
   curl https://api.example.com/api/reserves/health | jq '.features'
   ```

2. **Check Error Logs**
   ```bash
   tail -f /var/log/app/reserves.log | grep ERROR
   ```

3. **Verify User Experience**
   - Test calculation with known inputs
   - Confirm legacy engine active
   - Check UI responds correctly

## Escalation Path

1. **Level 1** (0-5 minutes): On-call engineer executes kill switch
2. **Level 2** (5-15 minutes): Team lead reviews and confirms rollback
3. **Level 3** (15+ minutes): Engineering manager + product owner decision

## Post-Rollback Checklist

- [ ] Feature flag disabled globally
- [ ] Error rate returned to baseline
- [ ] Performance metrics normal
- [ ] Incident report created
- [ ] Root cause analysis scheduled
- [ ] Fix identified and tested
- [ ] Re-deployment plan created
- [ ] Stakeholders notified

## Prevention Measures

1. **Shadow Mode Testing**: Run new engine in shadow for 24-48 hours
2. **Gradual Rollout**: 1% → 5% → 10% → 25% → 50% → 100%
3. **Canary Analysis**: Automated comparison of metrics
4. **Load Testing**: Verify performance at 2x expected load
5. **Chaos Testing**: Inject failures to test resilience

## Recovery Time Objectives

- **RTO**: 5 minutes (feature flag disable)
- **RPO**: 0 (no data loss, calculation only)
- **MTTR Target**: < 15 minutes
- **Success Rate Target**: > 99.9%