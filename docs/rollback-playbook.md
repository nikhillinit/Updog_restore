# Rollback Playbook

## Quick Reference
**Emergency Rollback Command**: `npm run rollback:emergency`  
**Rollback Hotline**: Slack #eng-alerts  
**Decision Time**: <5 minutes from alert

## Quantified Rollback Triggers

### 🔴 Automatic Rollback (Immediate)
| Metric | Threshold | Action | Command |
|--------|-----------|--------|---------|
| Error Rate | >2% of sessions | Auto-revert | `git revert HEAD && git push` |
| Build Failure | Any CI red | Block merge | Automatic via CI |
| Performance | >20% slower | Feature flag off | `npm run flags:kill -- --flag=NEW_CHARTS` |
| Memory Leak | >500MB/hour | Kill process | `npm run rollback:emergency` |

### 🟡 Manual Review (Within 1 hour)
| Metric | Threshold | Action | Command |
|--------|-----------|--------|---------|
| User Complaints | ≥5 in 24h | Investigate | Check Sentry + logs |
| Bundle Size | >10KB increase | Review PR | `npm run bundle-check` |
| Test Flakes | >3 failures | Quarantine | `npm run test:quarantine` |
| Deploy Time | >10 minutes | Investigate | Check CI logs |

### 🟢 Monitor Only
| Metric | Threshold | Action | Command |
|--------|-----------|--------|---------|
| TypeScript Errors | <50 | Continue | `npm run check` |
| ESLint Warnings | <1500 | Continue | `npm run lint` |
| Test Coverage | >70% | Continue | `npm run test:coverage` |

## Rollback Procedures by Area

### 1. Chart Library Migration
```bash
# Detection
npm run test:chart-interactions  # Functional test
npm run test:visual-regression   # Visual test

# Rollback (Feature Flag)
export CHART_IMPL=legacy        # Instant revert
npm run flags:kill -- --flag=NEW_CHARTS

# Rollback (Code Revert)
git revert <chart-migration-commit>
git push origin main --force-with-lease
```

### 2. TypeScript/ESLint Changes
```bash
# Detection
npm run check                   # TypeScript errors
npm run lint                     # ESLint errors
npm run build                    # Build success

# Rollback (Config)
git checkout HEAD -- tsconfig.json eslint.config.js
npm run check

# Rollback (Code)
git revert <cleanup-commit>
npm test:affected
```

### 3. Bundle Size Regression
```bash
# Detection
npm run bundle-check             # Check sizes
npx webpack-bundle-analyzer dist/stats.json

# Rollback (Immediate)
git revert <bundle-breaking-commit>
npm run build
npm run bundle-check            # Verify fixed

# Mitigation (Code Split)
# Add dynamic import for large modules
```

### 4. Performance Regression
```bash
# Detection (Automated)
- Prometheus alerts on p95 latency
- Sentry performance monitoring
- Browser RUM metrics

# Rollback (Feature Flag)
npm run flags:kill -- --flag=FEATURE_NAME

# Rollback (Deploy Previous)
npm run deploy:rollback -- --version=1.3.1
```

## Automated Monitoring Setup

### Slack Alerts Configuration
```javascript
// .github/workflows/monitor.yml
- name: Check Metrics
  run: |
    ERROR_RATE=$(npm run metrics:error-rate)
    if [ "$ERROR_RATE" -gt "2" ]; then
      curl -X POST $SLACK_WEBHOOK -d '{"text":"🚨 Error rate >2% - Auto-reverting"}'
      npm run rollback:emergency
    fi
```

### Rollback Script
```bash
#!/bin/bash
# scripts/rollback-emergency.sh

echo "🚨 EMERGENCY ROLLBACK INITIATED"

# 1. Capture current state
git stash
CURRENT_SHA=$(git rev-parse HEAD)

# 2. Find last known good commit
LAST_GOOD=$(git log --format="%H" --grep="stable" -1)

# 3. Create rollback branch
git checkout -b rollback/$CURRENT_SHA
git revert $CURRENT_SHA --no-edit

# 4. Fast-track deploy
npm run build || exit 1
npm run test:smoke || exit 1

# 5. Push and deploy
git push origin rollback/$CURRENT_SHA
npm run deploy:emergency

# 6. Notify team
curl -X POST $SLACK_WEBHOOK \
  -d "{\"text\":\"✅ Rolled back from $CURRENT_SHA to $LAST_GOOD\"}"
```

## Communication Templates

### Rollback Initiated
```
🚨 **ROLLBACK IN PROGRESS**
**Trigger**: [Error rate >2% | Performance regression | Build failure]
**Impact**: [User-facing | Internal only]
**Action**: Reverting commit abc123
**ETA**: 5 minutes
**Owner**: @oncall-engineer
```

### Rollback Complete
```
✅ **ROLLBACK COMPLETE**
**Duration**: X minutes
**Root Cause**: [Brief description]
**Next Steps**: [Investigation plan]
**Lessons Learned**: [Document in postmortem]
```

## Testing Rollback Procedures

### Weekly Drill
```bash
# Every Friday at 2pm
npm run drill:rollback

# This will:
# 1. Create a harmless breaking change
# 2. Trigger monitoring alerts
# 3. Execute rollback procedure
# 4. Verify system recovery
# 5. Generate drill report
```

### Staging Environment Test
```bash
# Test on staging first
npm run deploy:staging -- --branch=test-rollback
npm run test:staging:regression
npm run rollback:staging
npm run test:staging:smoke
```

## Post-Rollback Checklist

- [ ] System stable (all metrics green)
- [ ] Root cause identified
- [ ] Fix developed and tested
- [ ] Rollback procedure updated if needed
- [ ] Postmortem scheduled
- [ ] Stakeholders notified
- [ ] Monitoring enhanced for specific failure

## Escalation Matrix

| Time | Severity | Who to Contact | Action |
|------|----------|---------------|--------|
| 0-5min | Critical | On-call engineer | Auto-rollback |
| 5-15min | High | Team lead | Manual rollback |
| 15-30min | Medium | Engineering manager | Review and decide |
| 30min+ | Low | Schedule for next day | Document and plan |

## Tools and Commands

```bash
# Quick health check
npm run health:check

# Rollback commands
npm run rollback:emergency      # Immediate full rollback
npm run rollback:config         # Config only
npm run rollback:frontend       # Frontend only
npm run rollback:api           # API only

# Feature flags
npm run flags:list             # Show all flags
npm run flags:kill -- --flag=X # Disable specific flag
npm run flags:restore          # Reset to defaults

# Monitoring
npm run metrics:dashboard      # Open metrics dashboard
npm run alerts:test           # Test alert system
npm run sentry:recent         # Recent errors
```

---

**Remember**: Speed over perfection in rollbacks. Restore service first, investigate later.