# Synthetic Test Debugging Runbook

## Overview
This runbook provides step-by-step guidance for debugging and fixing synthetic test failures.

## Common Failure Patterns

### 1. Timeout Failures
**Symptoms**: Test fails with timeout errors, usually after 30-60 seconds.

**Debugging Steps**:
1. Check if the target URL is accessible:
   ```bash
   curl -I $SYNTHETIC_URL
   ```
2. Verify GitHub secrets/variables are configured:
   ```bash
   gh secret list
   gh variable list
   ```
3. Increase timeout values in the test:
   ```javascript
   page.setDefaultTimeout(60000); // 60 seconds
   ```

**Resolution**:
- Ensure `SYNTHETIC_URL` secret is set for production runs
- Add retry logic with exponential backoff
- Use `waitForLoadState('networkidle')` for dynamic content

### 2. Selector Not Found
**Symptoms**: "Element not found" or "Cannot find element with data-testid"

**Debugging Steps**:
1. Run locally with headed mode:
   ```bash
   npx playwright test --headed --debug
   ```
2. Take screenshots at failure point:
   ```javascript
   await page.screenshot({ path: 'debug.png' });
   ```
3. Check if selectors have changed:
   ```javascript
   console.log(await page.content()); // Log page HTML
   ```

**Resolution**:
- Update selectors in `client/src/lib/testIds.ts`
- Use more resilient selector strategies (data-testid > role > text)
- Add explicit waits: `await element.waitFor({ state: 'visible' })`

### 3. Flaky Tests
**Symptoms**: Tests pass/fail inconsistently

**Debugging Steps**:
1. Run test multiple times locally:
   ```bash
   for i in {1..10}; do npx playwright test; done
   ```
2. Add trace recording:
   ```javascript
   await context.tracing.start({ screenshots: true, snapshots: true });
   ```
3. Check for race conditions in the application

**Resolution**:
- Add explicit waits instead of arbitrary delays
- Use `waitForLoadState()` appropriately
- Implement retry logic at the action level:
  ```javascript
  await page.locator('button').click({ trial: 3 });
  ```

## Synthetic Test Configuration

### GitHub Actions Setup
```yaml
# .github/workflows/synthetics-e2e.yml
- name: Resolve BASE_URL
  id: base
  run: |
    if [ -n "${{ secrets.SYNTHETIC_URL }}" ]; then
      echo "base=${{ secrets.SYNTHETIC_URL }}" >> "$GITHUB_OUTPUT"
    else
      echo "skip=true" >> "$GITHUB_OUTPUT"
    fi
```

### Environment Variables
- `SYNTHETIC_URL`: Production/staging URL for synthetic tests
- `BASE_URL`: Fallback URL (default: http://localhost:5000)

## Test Structure Best Practices

### 1. Retry Logic
```javascript
let retries = 3;
while (retries > 0) {
  try {
    await page.goto(url);
    break;
  } catch (error) {
    retries--;
    if (retries === 0) throw error;
    await page.waitForTimeout(5000);
  }
}
```

### 2. Conditional Steps
```javascript
const element = page.getByTestId('element-id');
if (await element.isVisible().catch(() => false)) {
  await element.click();
}
```

### 3. Smart Waits
```javascript
// Wait for specific conditions
await page.waitForLoadState('networkidle');
await page.waitForSelector('[data-testid="loaded"]');
await expect(page.locator('.spinner')).not.toBeVisible();
```

## Debugging Commands

### Local Test Execution
```bash
# Run specific test file
npx playwright test tests/synthetics/wizard.e2e.spec.ts

# Run with UI mode
npx playwright test --ui

# Run with trace viewer
npx playwright test --trace on
npx playwright show-trace trace.zip

# Run specific test by name
npx playwright test -g "completes full wizard flow"
```

### CI Debugging
```bash
# Download artifacts from failed run
gh run download <run-id> -n playwright-artifacts-<run-id>

# View HTML report
npx playwright show-report ./playwright-report
```

## Monitoring and Alerting

### Success Rate Tracking
Monitor synthetic test success rate:
```bash
gh run list --workflow=synthetics-e2e.yml --json conclusion | \
  jq '[.[] | select(.conclusion != null)] | 
      group_by(.conclusion) | 
      map({(.[0].conclusion): length}) | 
      add'
```

### Required Success Rate
- Target: ≥ 95% over 30-day window
- Alert threshold: < 90% over 24 hours
- Page threshold: < 80% immediate

## Escalation Path

1. **First Failure**: Check runbook, attempt quick fix
2. **Persistent Failures** (>3 in a row): Notify on-call engineer
3. **Complete Outage** (>1 hour): Escalate to platform lead
4. **Business Hours**: Create incident ticket
5. **After Hours**: Follow on-call rotation

## Recovery Procedures

### Quick Recovery
1. Verify external services are operational
2. Check for recent deployments that may have broken selectors
3. Temporarily increase timeouts
4. Add skip flag if blocking deployments

### Full Recovery
1. Run synthetic tests locally to reproduce
2. Fix root cause (selector, timing, application bug)
3. Deploy fix and verify in staging
4. Monitor for 24 hours after fix

## Prevention Measures

1. **Pre-deployment**: Run synthetics against staging
2. **Selector stability**: Use data-testid exclusively
3. **Test maintenance**: Review monthly for optimization
4. **Documentation**: Keep testIds.ts synchronized with UI

---

*Last Updated: 2025-08-26*
*Version: 1.0*
*Owner: Platform Team*