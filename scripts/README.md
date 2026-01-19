---
status: ACTIVE
last_updated: 2026-01-19
owner: Core Team
review_cadence: P90D
---

# Scripts Directory

This directory contains the production-ready deployment system with progressive rollouts, weighted error scoring, and automated safety nets.

## 🚀 Production Deployment System

Complete enterprise-grade deployment system with:
- Progressive rollout control (10% → 25% → 50% → 100%)
- Weighted error scoring with circuit breakers
- Automated rollback mechanisms
- Comprehensive telemetry and monitoring
- Post-deployment cleanup automation

## Core Deployment Scripts

### `deploy-with-confidence.ps1`
Safe deployment orchestration with automatic rollback capabilities.
- Validates PR status and CI completion
- Handles merge with safety checks
- Provides rollback mechanisms if issues detected

### `monitor-deployment.ps1` ⚡ **OPTIMIZED**
Real-time deployment monitoring with weighted error scoring.
- **Auto-reads `VITE_ERROR_SCORE_THRESHOLD`** from environment
- Tracks error metrics with configurable thresholds
- Circuit breaker pattern for persistent errors  
- Automatic revert PR creation when thresholds exceeded
- Weighted scoring: migration failures=10pts, validation=5pts, warnings=1pt

### `smoke-test-prod.ps1` ✨ **NEW**
Fast production confidence checks between rollout stages.
- Quick HTTP endpoint validation
- Tests app bootstrap, wizard, kill switches
- Non-blocking asset verification
- Perfect for progressive rollout validation

### `finalize-pr.ps1`
PR preparation and validation before deployment.
- Runs comprehensive validation suite
- Updates PR status and labels
- Optional E2E test triggering

### `stage-cleanup-pr.ps1` ⚡ **OPTIMIZED**
Post-deployment cleanup PR generation with templating.
- **Auto-loads `docs/CLEANUP_PR_BODY.md`** template
- Creates cleanup branch for legacy code removal
- Analyzes files for cleanup with dynamic injection
- Generates consistent, comprehensive PR descriptions

### `victory-lap.ps1`
Celebrates successful deployment with metrics display.
- Shows deployment success metrics
- Displays rollout statistics
- Performance and reliability summaries

## Supporting Scripts

### `validate-local.ps1`
Local validation before deployment.
- Runs tests, build, and linting
- Validates code quality gates
- Ensures readiness for CI

### `setup-fundstore-pr.ps1`
Specialized PR setup for fund store integration.
- Configures PR metadata and labels
- Sets up branch protection requirements
- Prepares deployment pipeline

### `mark-pr-files-viewed.sh`
Automates marking all changed files in a PR as viewed.
- Uses GitHub CLI and GraphQL API
- Marks all changed files as viewed automatically
- Useful for bulk PR file review operations

## 📋 Streamlined Deployment Flow

### One-Command Progressive Rollout
```powershell
# 0) Set production environment variables
#    VITE_USE_FUND_STORE_ROLLOUT=10
#    VITE_TRACK_MIGRATIONS=1
#    VITE_ERROR_SCORE_THRESHOLD=15

# 1) Local confidence & prep
pwsh scripts/validate-local.ps1
pwsh scripts/finalize-pr.ps1 -PR 48 -NoMerge -RunE2E

# 2) Deploy with safety nets
pwsh scripts/deploy-with-confidence.ps1 -PR 48 -AutoRevert

# 3) Monitor 10% canary (15 min active watch)
pwsh scripts/monitor-deployment.ps1 -MinutesToMonitor 15 -AutoRevert

# 4) Progressive scaling with smoke tests
#    Bump to 25%: VITE_USE_FUND_STORE_ROLLOUT=25
pwsh scripts/smoke-test-prod.ps1 -BaseUrl https://your-app.com
pwsh scripts/monitor-deployment.ps1 -MinutesToMonitor 120

# 5) Continue to 50% → 100%
#    Set VITE_USE_FUND_STORE_ROLLOUT=50, then 100

# 6) Victory & cleanup (24h after 100% stable)
pwsh scripts/victory-lap.ps1 -ShowDetails
pwsh scripts/stage-cleanup-pr.ps1
```

### Emergency Rollback
```powershell
# Scripts handle automatic rollback when error thresholds exceeded
pwsh scripts/monitor-deployment.ps1 -MinutesToMonitor 30 -AutoRevert
# Creates revert PR automatically if errors ≥ threshold for 3 consecutive checks
```

## 📊 Configuration

### Environment Variables (Production Dashboard)
- `VITE_USE_FUND_STORE_ROLLOUT` - Rollout percentage (10, 25, 50, 100)
- `VITE_TRACK_MIGRATIONS` - Migration telemetry (1 during rollout, 0 after 24h)
- `VITE_ERROR_SCORE_THRESHOLD` - Configurable error threshold (default: 15)

### Templates & Documentation
- `docs/CLEANUP_PR_BODY.md` - Standardized cleanup PR template
- `docs/DEPLOYMENT_RUNBOOK.md` - Complete deployment procedures

## 🛡 Safety Features

### Weighted Error Scoring System
- **Migration failures**: 10 points (critical)
- **Validation errors**: 5 points (moderate)
- **Console warnings**: 1 point (low)
- **3 consecutive red intervals** → automatic rollback

### Circuit Breakers & Kill Switches
- **Exponential backoff** on persistent errors
- **URL params**: `?ff_useFundStore=0` (legacy) or `=1` (force)
- **localStorage**: `useFundStore=false` override
- **Environment**: `VITE_USE_FUND_STORE_ROLLOUT=0` emergency stop

### Progressive Rollout Strategy
1. **10% canary** (15 min active monitoring)
2. **25% expansion** (2 hour validation)  
3. **50% majority** (4 hour stability)
4. **100% full rollout** (24h before cleanup)

## 🔧 Requirements

- **PowerShell 7.0+**
- **GitHub CLI** (`gh`) authenticated
- **Git** with clean working directory
- **Node.js/npm** for local validation
- **Production environment** with configurable vars

## 🎯 Key Optimizations

1. **Auto-threshold detection** - Monitor script reads env vars automatically
2. **Fast smoke tests** - Quick confidence checks between rollout stages  
3. **Templated cleanup** - Consistent post-deployment cleanup PRs
4. **One-copy-paste deployment** - Complete flow in single command block
5. **Environmental tuning** - Adjust sensitivity without code changes

## 📈 Success Metrics

**Go/No-Go Criteria:**
- **Green** (≤ 5 pts, migrations ≥ 99.5%): Scale up
- **Yellow** (6-14 pts): Hold and investigate
- **Red** (≥ 15 pts or 3 consecutive): Automatic rollback

This system provides enterprise-grade deployment safety with minimal ceremony - deploy with confidence! 🚀
