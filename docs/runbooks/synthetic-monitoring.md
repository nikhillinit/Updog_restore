# Synthetic Monitoring Guide

## Overview

Synthetic monitoring runs automated smoke tests every 5 minutes against production to detect issues before users do.

## Components

### 1. Smoke Tests (`tests/smoke/wizard.spec.ts`)
- Health endpoint validation
- Critical user flow testing
- Login verification
- Wizard functionality
- Dashboard loading
- API endpoint checks
- Circuit breaker status
- Memory leak detection

### 2. GitHub Actions Workflow (`.github/workflows/synthetic.yml`)
- Runs every 5 minutes via cron schedule
- Manual trigger support
- Automatic alerting on failures
- Test result archiving

### 3. Alerting Channels
- GitHub Issues (automatic creation)
- Slack notifications
- PagerDuty incidents
- Email to on-call

## Configuration

### Required GitHub Secrets
```
PROD_BASE_URL     # Production URL (e.g., https://app.example.com)
SMOKE_USER        # Test user email
SMOKE_PASS        # Test user password
SLACK_WEBHOOK_URL # Optional: Slack webhook for alerts
PAGERDUTY_INTEGRATION_KEY # Optional: PagerDuty integration
```

### Setting Up Secrets
```bash
# Via GitHub CLI
gh secret set PROD_BASE_URL --body "https://app.example.com"
gh secret set SMOKE_USER --body "smoke@test.com"
gh secret set SMOKE_PASS --body "secure-password-123"
```

## Test Coverage

### Critical Paths Monitored
1. **Health Checks**
   - `/ready` endpoint
   - `/health` endpoint
   - Database connectivity
   - Redis connectivity

2. **User Flows**
   - Homepage loading
   - Login process
   - Wizard interaction
   - Dashboard rendering

3. **API Functionality**
   - Fund endpoints
   - Simulation endpoints
   - Portfolio endpoints

4. **System Health**
   - Circuit breaker status
   - JavaScript errors
   - Memory usage
   - Response times

## Alert Response

### When Alerts Fire

1. **Immediate Actions (< 5 min)**
   - Check production logs
   - Verify health endpoints manually
   - Check recent deployments
   - Review circuit breaker status

2. **Escalation Path**
   - Primary: On-call engineer (PagerDuty)
   - Secondary: Team lead (Slack)
   - Tertiary: Engineering manager (Email)

3. **Investigation Commands**
   ```bash
   # Check health
   curl https://app.example.com/health
   
   # Check ready
   curl https://app.example.com/ready
   
   # Check circuit breakers
   curl https://app.example.com/api/circuit-breaker/status
   
   # View recent logs
   kubectl logs -l app=api --tail=100
   ```

## Running Tests Locally

### Full Smoke Suite
```bash
# With production URL
BASE_URL=https://app.example.com \
SMOKE_USER=test@example.com \
SMOKE_PASS=password \
npm run test:smoke
```

### Individual Tests
```bash
# Test specific flow
npx playwright test tests/smoke/wizard.spec.ts -g "Health endpoints"
```

### Debug Mode
```bash
# Run with headed browser
npx playwright test tests/smoke/wizard.spec.ts --headed

# Run with trace viewer
npx playwright test tests/smoke/wizard.spec.ts --trace on
```

## Maintenance

### Adding New Tests
1. Add test cases to `tests/smoke/wizard.spec.ts`
2. Keep tests fast (< 30s per test)
3. Focus on critical paths only
4. Avoid flaky selectors

### Updating Thresholds
Edit in `tests/smoke/wizard.spec.ts`:
- Response time limits
- Memory usage thresholds
- Error tolerance

### Disabling Monitoring
```yaml
# In .github/workflows/synthetic.yml
on:
  schedule:
    # Comment out to disable
    # - cron: '*/5 * * * *'
```

## Metrics

### Success Metrics
- Uptime: > 99.9%
- False positive rate: < 1%
- Detection time: < 5 minutes
- Alert response time: < 10 minutes

### Monitoring Dashboard
Track in Grafana/Datadog:
- `smoke_test_passed` - Pass/fail status
- `smoke_test_duration_seconds` - Test execution time
- `smoke_test_failures_total` - Cumulative failures

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify SMOKE_USER exists in production
   - Check password hasn't expired
   - Ensure user has required permissions

2. **Timeout Errors**
   - Increase test timeout in workflow
   - Check for performance degradation
   - Verify network connectivity

3. **Flaky Tests**
   - Add explicit waits
   - Use more specific selectors
   - Check for race conditions

4. **False Positives**
   - Review recent UI changes
   - Update selectors if needed
   - Adjust timing/thresholds

### Debug Workflow
```bash
# Run workflow manually
gh workflow run synthetic.yml

# View recent runs
gh run list --workflow=synthetic.yml

# Download artifacts
gh run download <RUN_ID>
```

## Best Practices

1. **Keep Tests Simple**
   - Focus on critical paths
   - Avoid complex scenarios
   - Maintain < 5 min total runtime

2. **Use Stable Selectors**
   - Prefer data-testid attributes
   - Avoid fragile CSS selectors
   - Use accessible role queries

3. **Handle Failures Gracefully**
   - Continue on non-critical failures
   - Collect all results before alerting
   - Provide actionable error messages

4. **Regular Review**
   - Monthly test coverage review
   - Quarterly threshold adjustment
   - Annual architecture review

## Related Documentation
- [Rollback Procedures](./rollback.md)
- [Incident Response](./incident-response.md)
- [Monitoring Setup](../monitoring.md)
- [Testing Strategy](../testing.md)