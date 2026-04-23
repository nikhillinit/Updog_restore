# Sprint G2C Automation Kickoff Guide

## Immediate Actions (Day 15 - Today)

### 1. GitHub Actions Jobs Setup
**Owner:** DevOps Engineer  
**Timeline:** Complete within 4 hours of sprint start

#### Required GitHub Actions
- [ ] **Lighthouse CI Pipeline**
  - Minimum score threshold: 90
  - Runs on every PR to main
  - Blocks merge on failure
  - Reports detailed metrics

- [ ] **axe-core Accessibility Checks**
  - Integrated with PR pipeline
  - Zero critical/serious violations required
  - WCAG 2.1 AA compliance verification

- [ ] **Performance Regression Detection**
  - Baseline metrics established
  - <10% performance degradation threshold
  - Automated comparison reports

#### Setup Commands
```bash
# 1. Copy GitHub Actions templates
cp .github/workflows/quality-gates-template.yml .github/workflows/quality-gates.yml

# 2. Configure Lighthouse CI
npm install --save-dev @lhci/cli @lhci/server
mkdir .lighthouseci
# Edit lighthouserc.json with project settings

# 3. Setup axe-core integration
npm install --save-dev @axe-core/cli axe-playwright
# Configure axe tests in playwright.config.ts

# 4. Test pipeline locally
npm run ci:quality-gates
```

### 2. Session Replay Script Setup
**Owner:** Frontend Engineer  
**Timeline:** 2 hours after GitHub Actions complete

#### Session Replay Configuration
- [ ] **Tool Selection:** LogRocket/FullStory/Sentry Session Replay
- [ ] **Staging Environment Integration**
  - Initialize session replay SDK
  - Configure user privacy settings
  - Set up error boundary capture
  - Enable performance monitoring

#### Implementation Checklist
```javascript
// Example session replay initialization
import { init } from 'session-replay-sdk';

init({
  appId: 'staging-g2c-sprint',
  environment: 'staging',
  capturePerformance: true,
  captureNetwork: true,
  captureUserInteractions: true,
  privacyMode: 'strict'
});
```

### 3. Staging Environment Validation
**Owner:** SRE Engineer  
**Timeline:** Parallel with session replay setup

#### Pre-Bug-Bash Checklist
- [ ] **Database State Verification**
  - Test data populated
  - User accounts created
  - Permission levels configured

- [ ] **Service Health Checks**
  - All APIs responding
  - Authentication working
  - External integrations functional

- [ ] **Monitoring Stack Operational**
  - Prometheus scraping metrics
  - Grafana dashboards loading
  - Alert manager configured

#### Health Check Script
```bash
#!/bin/bash
# staging-health-check.sh

echo "🔍 Staging Environment Health Check"

# API endpoints
curl -f http://staging.example.com/health || echo "❌ API health check failed"
curl -f http://staging.example.com/api/v1/status || echo "❌ API status failed"

# Database connectivity
npm run db:check || echo "❌ Database connectivity failed"

# Session replay working
curl -f http://staging.example.com/replay/test || echo "❌ Session replay failed"

echo "✅ Staging health check complete"
```

## Alert Configuration (Critical)

### 1. Burn-Rate SLO Alerts
**Owner:** SRE Engineer  
**Must Complete:** Before Day 16 bug bash

#### Alert Thresholds
- **Fast Burn:** 2% error budget consumed in 1 hour
- **Slow Burn:** 10% error budget consumed in 6 hours
- **Long-term:** 90% error budget consumed in 3 days

#### Prometheus Alert Rules
```yaml
# alerts/burn-rate.yml
groups:
- name: slo.burn.rate
  rules:
  - alert: ErrorBudgetBurnRateFast
    expr: |
      (
        increase(http_requests_total{code=~"5.."}[1h])
        /
        increase(http_requests_total[1h])
      ) > 0.02
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Fast burn rate detected - 2% error budget in 1h"
      
  - alert: ErrorBudgetBurnRateSlow
    expr: |
      (
        increase(http_requests_total{code=~"5.."}[6h])
        /
        increase(http_requests_total[6h])
      ) > 0.10
    for: 15m
    labels:
      severity: warning
    annotations:
      summary: "Slow burn rate detected - 10% error budget in 6h"
```

### 2. Slack/PagerDuty Integration
- [ ] **Slack Webhook Configuration**
  - #sprint-g2c-alerts channel created
  - Bot permissions configured
  - Alert formatting templates

- [ ] **PagerDuty Escalation**
  - Service created for sprint
  - On-call rotation configured
  - Escalation policies defined

## Verification Steps

### Pre-Bug-Bash Smoke Test (Day 15 Evening)
Run this checklist before Day 16 bug bash:

1. **GitHub Actions Verification**
   ```bash
   # Create test PR to verify quality gates
   git checkout -b test-quality-gates
   echo "// test change" >> test-file.js
   git add . && git commit -m "test: verify quality gates"
   git push origin test-quality-gates
   # Verify PR checks run and report results
   ```

2. **Session Replay Verification**
   - Navigate to staging environment
   - Perform 3-5 user actions
   - Verify session appears in replay dashboard
   - Test error capture functionality

3. **Alert Verification**
   ```bash
   # Trigger test alert
   curl -X POST http://staging.example.com/test/trigger-alert
   # Verify alert fires in Slack within 30 seconds
   ```

## Troubleshooting Guide

### Common Issues & Solutions

**GitHub Actions Pipeline Fails**
- Check runner capacity and queue times
- Verify secrets and environment variables
- Validate workflow YAML syntax

**Session Replay Not Capturing**
- Check browser console for SDK errors
- Verify network connectivity to replay service
- Validate API keys and configuration

**Alerts Not Firing**
- Check Prometheus targets are up
- Verify alert rule syntax
- Test webhook connectivity

## Success Criteria

By end of Day 15:
- [ ] All GitHub Actions pipelines operational
- [ ] Session replay capturing on staging
- [ ] SLO alerts configured and tested
- [ ] Staging environment validated for bug bash
- [ ] Team notified of automation status

**Next Steps:** Ready for Day 16 bug bash with full monitoring and quality gates operational.
