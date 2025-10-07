# Observability & Code Review Documentation

This directory contains code reviews, metrics documentation, and observability guides for the Updog platform.

---

## 📋 Code Reviews

### PR #113 Review (2025-10-06) - Editorial v2

**Status:** 🟡 Blocked pending fixes

A comprehensive review of PR #113 which contains two separate features that need to be split:
1. RS256 JWT Authentication (P0 security fix)
2. Deterministic Fund Calculation Engine (new feature)

**Paste-Ready PR Comments (Editorial v2):**
- 🔒 **[Auth Review](./auth-comment.md)** - Blocking security fixes (async errors, JWKS, verification)
- 📊 **[Fund Calc Review](./fundcalc-comment.md)** - Required changes (inputs, reserves, tests)
- 🔀 **[Split Plan](./split-plan-comment.md)** - How to split into two PRs

**What Changed in v2:**
- Clarified fee accrual is already periodized; added golden test recommendation
- Removed brittle CI specifics; links to latest CI run instead
- Softened tone to "Blocked pending fixes"
- Added aud/iss exact-match guidance (trailing slash pitfalls)
- Added `npm pkg set dependencies.jose="^5"` command
- Enforced `alg` allowlist pre-check before verification
- Added dual entry-point guidance (keep `jose` server-only)
- Added clock-skew edge test (±300s) and CSV header stability test
- Added follow-on reserve cap + structured warning guidance

**Key Issues Identified:**
- Async error handling in JWT middleware (Express 4 doesn't auto-catch)
- Missing `alg` allowlist pre-check before verification
- JWKS cache invalidation endpoint missing
- Hard-coded fund start date and ownership percentages
- Reserve pool allocation logic (per-stage vs pool-level double-counting)

**Archive:**
- [v1 documents](./archive/2025-10-06/) - Original review with detailed analysis

---

## 📊 Metrics Documentation

### AI Agent Metrics

**[AI Metrics Documentation](./ai-metrics.md)**

Comprehensive guide to AI agent observability including:
- Performance metrics (latency, token usage, throughput)
- Quality metrics (success rate, retry count, error types)
- Business metrics (cost per operation, ROI)
- Integration with Prometheus + Grafana

**Key Metrics:**
- `ai_agent_operation_duration_seconds` - Operation latency histogram
- `ai_agent_tokens_total` - Token usage counter
- `ai_agent_cost_dollars` - Cost tracking
- `ai_agent_errors_total` - Error classification

**Dashboards:**
- AI Performance Dashboard (Grafana)
- Cost Analysis Dashboard
- Error Analysis & Debug Dashboard

---

## 🔍 Metrics Meanings

**[Metrics Meanings Reference](../metrics-meanings.md)**

Quick reference for fund metrics and financial calculations:

**Core Metrics:**
- **TVPI** (Total Value to Paid-In): (Distributions + NAV) / Contributions
- **DPI** (Distributions to Paid-In): Distributions / Contributions
- **RVPI** (Residual Value to Paid-In): NAV / Contributions
- **IRR** (Internal Rate of Return): Annualized return rate

**Usage:**
```typescript
import { calculateKPIs } from '@/lib/fund-calc';

const kpis = calculateKPIs(periodResults);
// => { tvpi: 2.54, dpi: 1.23, irrAnnualized: 18.25 }
```

---

## 🏗️ Architecture

### Observability Stack

```
┌─────────────────────────────────────────────┐
│           Application Layer                  │
│  ┌─────────────┐  ┌──────────────────────┐ │
│  │ AI Agents   │  │ Fund Calc Engine     │ │
│  │ (Prometheus)│  │ (Custom Metrics)     │ │
│  └──────┬──────┘  └──────────┬───────────┘ │
│         │                    │              │
└─────────┼────────────────────┼──────────────┘
          │                    │
          ▼                    ▼
┌─────────────────────────────────────────────┐
│         Metrics Collection Layer             │
│  ┌──────────────────────────────────────┐  │
│  │   Prometheus Server (Port 9090)      │  │
│  │   - Scrapes /metrics every 15s       │  │
│  │   - 15 day retention                 │  │
│  └──────────────┬───────────────────────┘  │
└─────────────────┼───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│         Visualization Layer                  │
│  ┌──────────────────────────────────────┐  │
│  │   Grafana (Port 3001)                │  │
│  │   - AI Performance Dashboard         │  │
│  │   - Cost Analysis Dashboard          │  │
│  │   - Fund Metrics Dashboard           │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Metrics Flow

1. **Collection:** Application emits metrics via Prometheus client
2. **Storage:** Prometheus scrapes and stores time-series data
3. **Visualization:** Grafana queries Prometheus and displays dashboards
4. **Alerting:** Prometheus Alertmanager sends alerts to Slack/Email

---

## 🚀 Quick Start

### View AI Metrics Dashboard

```bash
# Start metrics server
npm run ai:metrics

# Open Grafana
open http://localhost:3001

# Default credentials
# Username: admin
# Password: admin
```

### Query Metrics (PromQL)

```promql
# Average AI operation latency (last 5 minutes)
rate(ai_agent_operation_duration_seconds_sum[5m])
  / rate(ai_agent_operation_duration_seconds_count[5m])

# Total tokens used (last hour)
increase(ai_agent_tokens_total[1h])

# Error rate by type (last 15 minutes)
rate(ai_agent_errors_total[15m])

# Cost per operation
ai_agent_cost_dollars / ai_agent_operations_total
```

### Export Metrics

```bash
# Prometheus format
curl http://localhost:9090/api/v1/query?query=ai_agent_operations_total

# JSON export
curl http://localhost:9090/api/v1/query?query=ai_agent_operations_total \
  | jq '.data.result'
```

---

## 📁 Directory Structure

```
docs/observability/
├── README.md                          # This file
├── ai-metrics.md                      # AI agent metrics guide
├── auth-comment.md                    # PR #113 Auth review (v2, paste-ready)
├── fundcalc-comment.md               # PR #113 Fund calc review (v2, paste-ready)
├── split-plan-comment.md             # PR #113 Split instructions (v2, paste-ready)
└── archive/
    └── 2025-10-06/                    # v1 documents (detailed analysis)
        ├── pr-113-review-v1.md
        ├── pr-113-auth-comment-v1.md
        ├── pr-113-fundcalc-comment-v1.md
        ├── pr-113-split-instructions-v1.md
        └── pr-113-summary-v1.md

docs/
├── metrics-meanings.md                # Fund metrics reference
└── auth/
    └── RS256-SETUP.md                 # RS256 JWT setup guide
```

---

## 🔗 Related Documentation

- **[CLAUDE.md](../../CLAUDE.md)** - Project overview and conventions
- **[DECISIONS.md](../../DECISIONS.md)** - Architectural decisions
- **[CHANGELOG.md](../../CHANGELOG.md)** - Change history
- **[cheatsheets/](../../cheatsheets/)** - Development guides

---

## 📝 Contributing

When adding observability documentation:

1. **Metrics:** Add to [ai-metrics.md](./ai-metrics.md) with PromQL examples
2. **Reviews:** Create new `pr-{number}-*.md` files for code reviews
3. **Dashboards:** Export JSON to `config/grafana/dashboards/`
4. **Alerts:** Document in `config/prometheus/alerts/`

### Review Template

```markdown
# PR #{number} Review

**Date:** YYYY-MM-DD
**Reviewer:** Name
**Status:** 🟢 Approved | 🟡 Requires Changes | 🔴 Blocked

## Summary
Brief overview of changes

## Issues Found
- [ ] Issue 1
- [ ] Issue 2

## Recommendations
- Suggestion 1
- Suggestion 2

## Approval Checklist
- [ ] Tests passing
- [ ] Documentation updated
- [ ] No security concerns
```

---

## 🎯 Best Practices

### Metrics Naming

Follow Prometheus naming conventions:
- `{namespace}_{subsystem}_{metric}_{unit}`
- Example: `ai_agent_operation_duration_seconds`

### Dashboard Design

- **Consistency:** Use same color scheme across dashboards
- **Context:** Include relevant filters (time range, agent type)
- **Actionability:** Link metrics to documentation/runbooks

### Alert Thresholds

- **Warning:** 2σ deviation from baseline
- **Critical:** 3σ deviation or complete failure
- **Duration:** Alert after 5+ minutes sustained issue

---

## 📞 Support

- **Metrics Issues:** Check Prometheus targets at http://localhost:9090/targets
- **Dashboard Issues:** Verify Grafana data source connection
- **Code Review Questions:** Comment on the PR or check review docs

---

*Last Updated: 2025-10-06*
