# Deployment Instructions: Green Scoreboard & Guardian System

## Overview
This document provides step-by-step instructions for deploying the Gate-Based Quality System with Guardian canary monitoring.

## Prerequisites
- GitHub repository with Actions enabled
- Admin access to repository settings
- Node.js 20+ and npm installed locally
- PostgreSQL and Redis for full testing

## Step 1: Make Scripts Executable

On Unix-like systems (Linux, macOS), make all scripts executable:

```bash
# Guardian and monitoring scripts
chmod +x scripts/canary-check-fixed.sh
chmod +x scripts/test-gates-locally.sh
chmod +x scripts/extract-bundle-size.mjs
chmod +x tools/check-guardian-window.mjs

# Any other utility scripts
chmod +x scripts/phase0-audit.mjs
```

On Windows, these will run through Git Bash or WSL.

## Step 2: Configure GitHub Secrets

Navigate to: Settings → Secrets and variables → Actions

### Required Secrets:
1. **GUARDIAN_BASE_URL** (Optional but recommended)
   - Production URL for Guardian canary checks
   - Example: `https://app.yourcompany.com`
   - If not set, Guardian will test against local build

2. **E2E_BASE_URL** (Optional)
   - URL for E2E testing
   - Example: `https://staging.yourcompany.com`

### Repository Variables:
1. **GUARDIAN_MUTE_UNTIL** (Optional)
   - ISO 8601 timestamp for TTL mute
   - Example: `2024-12-31T23:59:59Z`
   - Clear this value to unmute Guardian

## Step 3: Enable Branch Protection

Navigate to: Settings → Branches → Add rule

### Main Branch Protection:
1. Branch name pattern: `main`
2. Required status checks:
   - ✅ TypeScript Check
   - ✅ Test Suite
   - ✅ Build & Bundle Check
   - ✅ CI Health Check
   - ✅ Guardian Window Check
   - ✅ Scoreboard Summary

3. Additional settings:
   - ✅ Require branches to be up to date
   - ✅ Include administrators (optional)
   - ✅ Restrict who can push (optional)

## Step 4: Test Locally

Before pushing changes, validate all gates locally:

```bash
# Run the local gate testing script
./scripts/test-gates-locally.sh

# Expected output for success:
# 🟢 ALL GATES PASSED (5/5)

# Individual gate commands:
npm run check          # TypeScript
npm test              # Unit tests
npm run build         # Build & bundle
npm start &           # Start server for health check
curl http://localhost:5000/healthz  # Manual health check
```

## Step 5: Deploy Workflows

The workflows are already in `.github/workflows/`. Simply push to trigger:

```bash
# Create a feature branch
git checkout -b feat/enable-gates

# Add and commit the workflow files
git add .github/workflows/
git add scripts/
git add tools/
git commit -m "feat: Enable Green Scoreboard and Guardian monitoring

- Add 5-gate quality system
- Implement Guardian canary with TTL mute
- Add bundle size tracking
- Configure automated PR comments"

# Push to trigger workflows
git push origin feat/enable-gates

# Create PR to see the system in action
gh pr create --title "Enable Gate-Based Quality System" \
  --body "Implements the Green Scoreboard with Guardian monitoring"
```

## Step 6: Monitor Initial Run

After creating the PR:

1. **Check PR Comments**: Bot will post a scoreboard summary
2. **View Checks Tab**: See individual gate status
3. **Monitor Actions Tab**: Watch workflow execution

Expected first run may show some failures - this is normal and helps establish baseline.

## Step 7: Guardian Canary Schedule

The Guardian runs every 2 hours by default. To adjust:

Edit `.github/workflows/guardian-complete.yml`:
```yaml
schedule:
  - cron: "0 */2 * * *"  # Every 2 hours
  # Alternative schedules:
  # - cron: "0 */4 * * *"  # Every 4 hours
  # - cron: "0 8,12,16,20 * * *"  # 4 times daily
```

## Step 8: Emergency Mute (TTL)

If Guardian is blocking legitimate deployments:

### Via Label (Recommended):
1. Add label `guardian-mute` to PR
2. System automatically mutes for 4 hours
3. Remove label to unmute early

### Via Repository Variable:
1. Go to Settings → Secrets and variables → Actions → Variables
2. Set `GUARDIAN_MUTE_UNTIL` to future timestamp
3. Example: `2024-01-15T18:00:00Z`
4. Clear variable to unmute

## Step 9: Bundle Size Monitoring

Track bundle size trends:

```bash
# After build, check report
cat dist/.bundle-report.json

# Monitor size over time
echo "$(date): $(cat dist/.app-size-kb)KB" >> bundle-history.log
```

Set up alerts if approaching limit:
- Warning: >380KB (95% of budget)
- Critical: >400KB (blocks merge)

## Step 10: Verify Everything Works

### Checklist:
- [ ] All scripts are executable
- [ ] Local gate test passes (`./scripts/test-gates-locally.sh`)
- [ ] PR shows scoreboard comment
- [ ] All 5 gates appear in PR checks
- [ ] Guardian runs on schedule (check Actions tab)
- [ ] Bundle size is tracked in artifacts
- [ ] TTL mute works (test with label)

## Troubleshooting

### Issue: Scripts fail with permission denied
```bash
# Fix permissions
find scripts tools -name "*.sh" -o -name "*.mjs" | xargs chmod +x
```

### Issue: Guardian always fails
```bash
# Test locally
BASE_URL=http://localhost:5000 ./scripts/canary-check-fixed.sh

# Check health endpoint manually
curl -v http://localhost:5000/healthz
```

### Issue: TypeScript gate blocks everything
```bash
# Get detailed error report
npm run check 2>&1 | grep "error TS" | head -20

# Run phase 0 audit for categorization
node scripts/phase0-audit.mjs
```

### Issue: Bundle exceeds limit
```bash
# Analyze bundle
npm run build -- --report
npx vite-bundle-visualizer

# Check what's included
node scripts/extract-bundle-size.mjs
```

## Monitoring & Metrics

### Daily Checks:
1. Guardian success rate: Should be >60% (3 of last 5)
2. Bundle size trend: Should stay <400KB
3. TypeScript errors: Should decrease over time
4. Test count: Should increase with new features

### Weekly Review:
1. Review failed Guardian runs for patterns
2. Check if any gates are consistently blocking
3. Adjust timeouts if needed
4. Update bundle budget based on requirements

## Success Criteria

The system is working correctly when:
- ✅ No PR can merge without passing all gates
- ✅ Guardian runs every 2 hours without exit code 124
- ✅ Bundle size stays under 400KB
- ✅ TypeScript errors trend toward zero
- ✅ Test suite runs deterministically
- ✅ Developers can mute Guardian for emergencies
- ✅ Every PR gets a clear scoreboard summary

## Next Steps

After successful deployment:
1. Fix existing TypeScript errors (25 identified)
2. Increase test coverage to >80%
3. Optimize bundle size if >380KB
4. Add performance benchmarks
5. Implement feature flag system
6. Set up Slack notifications for failures

## Support

For issues or questions:
- Check workflow logs in Actions tab
- Review this document's troubleshooting section
- Run local gate test for immediate feedback
- Use `guardian-mute` label for emergency bypass