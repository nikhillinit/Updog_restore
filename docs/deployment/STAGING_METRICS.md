# Staging Soak Test Metrics

## Overview

This document defines the metrics to track during the 48-hour staging soak test for the Phase 0 Foundation deployment. All metrics must meet or exceed targets for the deployment to proceed to production.

## Performance Metrics

### Core Web Vitals (Lighthouse/Vercel Analytics)

#### Time to First Byte (TTFB)
- **Target**: < 200ms
- **Measurement**: Server response time for initial HTML
- **Tool**: Lighthouse, WebPageTest, Vercel Analytics
- **Frequency**: Every 15 minutes (automated)
- **Acceptable Range**: 150-250ms
- **Alert Threshold**: > 300ms

**Tracking Template**:
```
Hour 0:  ___ ms
Hour 6:  ___ ms
Hour 12: ___ ms
Hour 18: ___ ms
Hour 24: ___ ms
Hour 30: ___ ms
Hour 36: ___ ms
Hour 42: ___ ms
Hour 48: ___ ms

Average: ___ ms
Min: ___ ms
Max: ___ ms
```

#### First Contentful Paint (FCP)
- **Target**: < 1.5s
- **Measurement**: Time until first visible content
- **Tool**: Lighthouse, Chrome DevTools
- **Frequency**: Every 6 hours (manual)
- **Acceptable Range**: 1.0-2.0s
- **Alert Threshold**: > 2.5s

**Tracking Template**:
```
Day 1 Morning:   ___ s
Day 1 Afternoon: ___ s
Day 1 Evening:   ___ s
Day 2 Morning:   ___ s
Day 2 Afternoon: ___ s
Day 2 Evening:   ___ s

Average: ___ s
P50: ___ s
P95: ___ s
```

#### Largest Contentful Paint (LCP)
- **Target**: < 2.5s
- **Measurement**: Time until largest visible element
- **Tool**: Lighthouse, Chrome DevTools
- **Frequency**: Every 6 hours (manual)
- **Acceptable Range**: 2.0-3.0s
- **Alert Threshold**: > 3.5s

**Tracking Template**:
```
Day 1 Morning:   ___ s
Day 1 Afternoon: ___ s
Day 1 Evening:   ___ s
Day 2 Morning:   ___ s
Day 2 Afternoon: ___ s
Day 2 Evening:   ___ s

Average: ___ s
P50: ___ s
P95: ___ s
```

#### Time to Interactive (TTI)
- **Target**: < 3.5s
- **Measurement**: Time until page is fully interactive
- **Tool**: Lighthouse
- **Frequency**: Every 12 hours (manual)
- **Acceptable Range**: 3.0-4.0s
- **Alert Threshold**: > 5.0s

**Tracking Template**:
```
Day 1 Morning: ___ s
Day 1 Evening: ___ s
Day 2 Morning: ___ s
Day 2 Evening: ___ s

Average: ___ s
```

#### Total Blocking Time (TBT)
- **Target**: < 200ms
- **Measurement**: Total time main thread is blocked
- **Tool**: Lighthouse
- **Frequency**: Every 12 hours (manual)
- **Acceptable Range**: 150-300ms
- **Alert Threshold**: > 400ms

**Tracking Template**:
```
Day 1 Morning: ___ ms
Day 1 Evening: ___ ms
Day 2 Morning: ___ ms
Day 2 Evening: ___ ms

Average: ___ ms
```

#### Cumulative Layout Shift (CLS)
- **Target**: < 0.1
- **Measurement**: Visual stability score
- **Tool**: Lighthouse, Chrome DevTools
- **Frequency**: Every 6 hours (manual)
- **Acceptable Range**: 0.0-0.15
- **Alert Threshold**: > 0.25

**Tracking Template**:
```
Day 1 Morning:   ___
Day 1 Afternoon: ___
Day 1 Evening:   ___
Day 2 Morning:   ___
Day 2 Afternoon: ___
Day 2 Evening:   ___

Average: ___
Max: ___
```

## Bundle Metrics

### JavaScript Bundle Sizes

#### Critical Path Bundle
- **Target**: < 150KB (gzipped)
- **Measurement**: Main bundle size for initial page load
- **Tool**: `npm run size-limit`, Vercel Analytics
- **Frequency**: Every deployment, every 12 hours
- **Acceptable Range**: 130-180KB
- **Alert Threshold**: > 200KB

**Tracking Template**:
```
Initial Deployment: ___ KB
Hour 12: ___ KB
Hour 24: ___ KB
Hour 36: ___ KB
Hour 48: ___ KB

Trend: [Stable / Growing / Shrinking]
```

#### Deterministic Engine Bundle
- **Target**: < 50KB (gzipped)
- **Measurement**: Deterministic engine chunk size
- **Tool**: Bundle analyzer, `npm run size-limit`
- **Frequency**: Every deployment
- **Acceptable Range**: 40-60KB
- **Alert Threshold**: > 75KB

**Tracking**:
```
Size: ___ KB
Trend: [Expected / Concerning]
```

#### Math/Crypto Vendor Bundle
- **Target**: < 30KB (gzipped)
- **Measurement**: Math and crypto library chunk
- **Tool**: Bundle analyzer
- **Frequency**: Every deployment
- **Acceptable Range**: 25-35KB
- **Alert Threshold**: > 45KB

**Tracking**:
```
Size: ___ KB
Libraries included: ___
```

#### Total Bundle Size
- **Target**: < 600KB (gzipped)
- **Measurement**: All JavaScript bundles combined
- **Tool**: Vercel Analytics, bundle analyzer
- **Frequency**: Every deployment, every 12 hours
- **Acceptable Range**: 500-650KB
- **Alert Threshold**: > 750KB

**Tracking Template**:
```
Initial: ___ KB
Hour 12: ___ KB
Hour 24: ___ KB
Hour 36: ___ KB
Hour 48: ___ KB

Breakdown:
- Critical path: ___ KB
- Deterministic engine: ___ KB
- Math/crypto: ___ KB
- Other chunks: ___ KB
```

### Bundle Loading

#### Chunk Load Order
- **Target**: Correct dependency order (no TDZ errors)
- **Measurement**: Manual verification in DevTools Network tab
- **Tool**: Chrome DevTools
- **Frequency**: Every major test
- **Pass Criteria**: Zero Temporal Dead Zone errors

**Tracking Checklist**:
- [ ] Initial page load: No TDZ errors
- [ ] Route navigation: No TDZ errors
- [ ] Lazy loaded routes: No TDZ errors
- [ ] Modals/dialogs: No TDZ errors

## Functional Metrics

### Feature Flags

#### Feature Flag Uptime
- **Target**: 100% availability
- **Measurement**: Feature flag service health
- **Tool**: Manual testing, automated monitor
- **Frequency**: Every 15 minutes (automated)
- **Pass Criteria**: Zero downtime

**Tracking Template**:
```
Total checks: ___
Successful: ___
Failed: ___
Uptime: ____%

Failed checks (if any):
- Timestamp: ___, Reason: ___
```

#### Deterministic Engine Flag Status
- **Target**: `deterministicEngineV1: true` at all times
- **Measurement**: Flag value verification
- **Tool**: Browser console, automated monitor
- **Frequency**: Every 15 minutes (automated)
- **Pass Criteria**: Always `true`

**Tracking Template**:
```
Total checks: ___
Value = true: ___
Value = false: ___
Value = undefined: ___

Anomalies (if any):
- Timestamp: ___, Value: ___
```

#### Flag Update Propagation
- **Target**: Updates propagate within 5 seconds
- **Measurement**: Time from flag change to UI update
- **Tool**: Manual testing (if admin UI available)
- **Frequency**: Once per day
- **Pass Criteria**: < 5 seconds

**Tracking**:
```
Test 1: ___ seconds
Test 2: ___ seconds
Average: ___ seconds
```

### Staging Ribbon

#### Visibility
- **Target**: Visible on 100% of pages
- **Measurement**: Manual verification across routes
- **Tool**: Browser testing
- **Frequency**: Every major route test
- **Pass Criteria**: Visible on all pages

**Tracking Checklist**:
- [ ] Dashboard: Ribbon visible
- [ ] Fund setup: Ribbon visible
- [ ] Portfolio view: Ribbon visible
- [ ] Reports: Ribbon visible
- [ ] Settings: Ribbon visible
- [ ] All modals: Ribbon visible

#### Dismissibility
- **Target**: Close button works, preference persists
- **Measurement**: Manual testing
- **Tool**: Browser testing
- **Frequency**: Once per day
- **Pass Criteria**: Works correctly

**Tracking Checklist**:
- [ ] Click close button: Banner disappears
- [ ] Reload page: Banner stays dismissed
- [ ] New session: Banner reappears (expected)

### Golden Dataset Tests

#### Test Pass Rate
- **Target**: 100% pass rate
- **Measurement**: Test suite execution
- **Tool**: `npm test`, CI pipeline
- **Frequency**: Every 6 hours
- **Pass Criteria**: Zero failures

**Tracking Template**:
```
Day 1 - Hour 0:  ___/___  tests passing
Day 1 - Hour 6:  ___/___  tests passing
Day 1 - Hour 12: ___/___  tests passing
Day 1 - Hour 18: ___/___  tests passing
Day 2 - Hour 24: ___/___  tests passing
Day 2 - Hour 30: ___/___  tests passing
Day 2 - Hour 36: ___/___  tests passing
Day 2 - Hour 42: ___/___  tests passing
Day 2 - Hour 48: ___/___  tests passing

Total failures: ___
```

#### AND Logic Enforcement
- **Target**: Both relative AND absolute tolerances enforced
- **Measurement**: Test case verification
- **Tool**: Test suite review
- **Frequency**: Once per day
- **Pass Criteria**: All tests use AND logic

**Tracking Checklist**:
- [ ] Relative tolerance checked
- [ ] Absolute tolerance checked
- [ ] Both must pass for test to pass
- [ ] No false positives

### Code Quality

#### TypeScript Errors
- **Target**: Zero errors
- **Measurement**: `npm run check`
- **Tool**: TypeScript compiler
- **Frequency**: Every deployment
- **Pass Criteria**: Zero errors

**Tracking**:
```
Errors: ___
Warnings: ___
```

#### Linting Errors
- **Target**: Zero errors
- **Measurement**: `npm run lint`
- **Tool**: ESLint
- **Frequency**: Every deployment
- **Pass Criteria**: Zero errors

**Tracking**:
```
Errors: ___
Warnings: ___
```

#### Forbidden Token Violations
- **Target**: Zero violations
- **Measurement**: Test suite execution
- **Tool**: Forbidden token test
- **Frequency**: Every deployment
- **Pass Criteria**: Zero violations

**Tracking**:
```
Violations: ___
Files affected: ___
```

## Error Tracking

### JavaScript Errors

#### Total JS Errors
- **Target**: 0 errors
- **Measurement**: Browser console, Sentry (if configured)
- **Tool**: DevTools, error monitoring service
- **Frequency**: Continuous
- **Alert Threshold**: > 0 critical errors

**Tracking Template**:
```
Total errors: ___
Critical errors: ___
Warnings: ___

Error breakdown by type:
- TDZ errors: ___
- Network errors: ___
- Rendering errors: ___
- Other: ___

Error breakdown by route:
- Dashboard: ___
- Fund setup: ___
- Portfolio: ___
- Reports: ___
```

#### Network Errors
- **Target**: < 0.1% error rate
- **Measurement**: Failed HTTP requests
- **Tool**: Browser DevTools, Vercel logs
- **Frequency**: Continuous
- **Alert Threshold**: > 1% error rate

**Tracking Template**:
```
Total requests: ___
Failed requests: ___
Error rate: ____%

Error breakdown:
- 4xx errors: ___
- 5xx errors: ___
- Timeout errors: ___
- Connection errors: ___
```

#### API Errors
- **Target**: < 1% error rate
- **Measurement**: API endpoint responses
- **Tool**: Vercel logs, application logs
- **Frequency**: Continuous
- **Alert Threshold**: > 5% error rate

**Tracking Template**:
```
Total API calls: ___
Failed calls: ___
Error rate: ____%

Error breakdown by endpoint:
- /api/funds: ___
- /api/portfolio: ___
- /api/reports: ___
- /api/health: ___
```

#### Bundle Load Failures
- **Target**: 0 failures
- **Measurement**: Chunk loading errors
- **Tool**: Browser console
- **Frequency**: Continuous
- **Alert Threshold**: > 0 failures

**Tracking**:
```
Load failures: ___
Affected chunks: ___
```

#### Feature Flag Failures
- **Target**: 0 failures
- **Measurement**: Flag service errors
- **Tool**: Application logs, browser console
- **Frequency**: Continuous
- **Alert Threshold**: > 0 failures

**Tracking**:
```
Service failures: ___
Parse failures: ___
Default fallback used: ___
```

## Browser Compatibility

### Desktop Browsers

#### Chrome (Latest)
- **Version**: ___
- **Status**: [Pass / Fail]
- **Issues**: ___

**Checklist**:
- [ ] All pages load
- [ ] No console errors
- [ ] Feature flags work
- [ ] Staging ribbon visible
- [ ] Performance meets targets

#### Firefox (Latest)
- **Version**: ___
- **Status**: [Pass / Fail]
- **Issues**: ___

**Checklist**:
- [ ] All pages load
- [ ] No console errors
- [ ] Feature flags work
- [ ] Staging ribbon visible
- [ ] Performance meets targets

#### Safari (15+)
- **Version**: ___
- **Status**: [Pass / Fail]
- **Issues**: ___

**Checklist**:
- [ ] All pages load
- [ ] No console errors
- [ ] Feature flags work
- [ ] Staging ribbon visible
- [ ] Performance meets targets

#### Edge (Latest)
- **Version**: ___
- **Status**: [Pass / Fail]
- **Issues**: ___

**Checklist**:
- [ ] All pages load
- [ ] No console errors
- [ ] Feature flags work
- [ ] Staging ribbon visible
- [ ] Performance meets targets

### Mobile Browsers

#### Mobile Chrome (Latest)
- **Version**: ___
- **Device**: ___
- **Status**: [Pass / Fail]
- **Issues**: ___

**Checklist**:
- [ ] All pages load
- [ ] No console errors
- [ ] Touch interactions work
- [ ] Responsive design correct
- [ ] Performance acceptable

#### Mobile Safari (Latest)
- **Version**: ___
- **Device**: ___
- **Status**: [Pass / Fail]
- **Issues**: ___

**Checklist**:
- [ ] All pages load
- [ ] No console errors
- [ ] Touch interactions work
- [ ] Responsive design correct
- [ ] Performance acceptable

## System Health

### Deployment Uptime
- **Target**: 100% uptime
- **Measurement**: Health check endpoint
- **Tool**: Automated monitor, Vercel status
- **Frequency**: Every 15 minutes
- **Alert Threshold**: > 1 minute downtime

**Tracking Template**:
```
Total checks: ___
Successful: ___
Failed: ___
Uptime: ____%

Downtime incidents:
- Timestamp: ___, Duration: ___, Cause: ___
```

### Memory Usage
- **Target**: Stable (no leaks)
- **Measurement**: Vercel Analytics, browser DevTools
- **Tool**: Performance monitor
- **Frequency**: Every 12 hours
- **Alert Threshold**: > 20% increase over time

**Tracking Template**:
```
Hour 0:  ___ MB
Hour 12: ___ MB
Hour 24: ___ MB
Hour 36: ___ MB
Hour 48: ___ MB

Trend: [Stable / Growing / Concerning]
```

### Database Connection Health
- **Target**: 100% healthy
- **Measurement**: Connection pool status
- **Tool**: Application logs, health endpoint
- **Frequency**: Every 15 minutes
- **Alert Threshold**: > 0 connection failures

**Tracking**:
```
Total checks: ___
Healthy: ___
Unhealthy: ___
Connection pool size: ___
```

### Redis Connection Health
- **Target**: 100% healthy
- **Measurement**: Redis client status
- **Tool**: Application logs, health endpoint
- **Frequency**: Every 15 minutes
- **Alert Threshold**: > 0 connection failures

**Tracking**:
```
Total checks: ___
Healthy: ___
Unhealthy: ___
Reconnection attempts: ___
```

## Summary Dashboard

### Overall Status
```
Deployment Status: [Green / Yellow / Red]
Uptime: ____%
Total Issues: ___
Critical Issues: ___
Blockers: ___

Performance: [Pass / Fail]
Functionality: [Pass / Fail]
Stability: [Pass / Fail]
Browser Compat: [Pass / Fail]

Ready for Production: [Yes / No]
```

### Key Metrics Summary
```
TTFB:    ___ ms  [Target: < 200ms]
FCP:     ___ s   [Target: < 1.5s]
LCP:     ___ s   [Target: < 2.5s]
TTI:     ___ s   [Target: < 3.5s]
TBT:     ___ ms  [Target: < 200ms]
CLS:     ___     [Target: < 0.1]

Bundle:  ___ KB  [Target: < 600KB]
Errors:  ___     [Target: 0]
Uptime:  ____%   [Target: 100%]
```

### Decision Matrix

| Metric | Target | Actual | Status | Blocker? |
|--------|--------|--------|--------|----------|
| TTFB | < 200ms | ___ | __ | __ |
| FCP | < 1.5s | ___ | __ | __ |
| LCP | < 2.5s | ___ | __ | __ |
| TTI | < 3.5s | ___ | __ | __ |
| TBT | < 200ms | ___ | __ | __ |
| CLS | < 0.1 | ___ | __ | __ |
| Bundle Size | < 600KB | ___ | __ | __ |
| JS Errors | 0 | ___ | __ | __ |
| Test Pass Rate | 100% | ___ | __ | __ |
| Uptime | 100% | ___ | __ | __ |

**Legend**:
- Status: ✅ Pass / ⚠️ Warning / ❌ Fail
- Blocker: 🚫 Yes / ✓ No

## Appendix: Data Collection Tools

### Automated Tools
- **Lighthouse CI**: Performance metrics collection
- **Vercel Analytics**: Bundle size, runtime metrics
- **GitHub Actions**: Automated monitoring workflow
- **Monitoring Script**: `scripts/staging-monitor.sh`

### Manual Tools
- **Chrome DevTools**: Console errors, network tab, performance profiling
- **WebPageTest**: Detailed performance analysis
- **Bundle Analyzer**: Visual bundle inspection
- **Browser Testing**: Cross-browser compatibility

### Reporting
- **Frequency**: Every 6 hours during soak test
- **Format**: Markdown update to this file
- **Storage**: Git commit to branch
- **Review**: Team review at 24h and 48h marks
