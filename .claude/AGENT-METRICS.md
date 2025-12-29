---
status: ACTIVE
audience: agents
last_updated: 2025-12-29
owner: 'Platform Team'
review_cadence: P7D
categories: [agents, metrics, performance]
keywords: [agent-metrics, usage-tracking, performance, success-rate]
---

# Agent Performance Metrics

Track agent usage, success rates, and performance to optimize the agent
ecosystem and identify improvement opportunities.

## Metrics Framework

### Core Metrics Per Agent

| Metric | Description | Target |
|--------|-------------|--------|
| **Invocation Count** | Times agent was called | - |
| **Success Rate** | % completing without errors | >95% |
| **Avg Runtime** | Mean execution time | <5min |
| **P95 Runtime** | 95th percentile runtime | <10min |
| **Memory Usage** | Peak memory during execution | <500MB |
| **Failure Categories** | Types of failures encountered | - |

### Tracking Method

Agents should log metrics in structured format:

```typescript
interface AgentMetrics {
  agentId: string;
  invocationId: string;
  startTime: Date;
  endTime: Date;
  status: 'success' | 'failure' | 'partial';
  memoryUsedMB: number;
  tokensConsumed: number;
  filesAnalyzed: number;
  issuesFound: number;
  issuesFixed: number;
  errorType?: string;
  errorMessage?: string;
}
```

---

## Agent Performance Dashboard

### High-Volume Agents (Weekly Metrics)

| Agent | Invocations | Success Rate | Avg Runtime | Trend |
|-------|-------------|--------------|-------------|-------|
| code-reviewer | ~50/week | 98% | 45s | Stable |
| test-repair | ~30/week | 92% | 2m 15s | Improving |
| waterfall-specialist | ~20/week | 97% | 1m 30s | Stable |
| perf-guard | ~15/week | 95% | 3m 00s | Stable |
| schema-drift-checker | ~10/week | 99% | 30s | Stable |

### Phoenix Agents (Weekly Metrics)

| Agent | Invocations | Success Rate | Avg Runtime | Trend |
|-------|-------------|--------------|-------------|-------|
| phoenix-truth-case-runner | ~25/week | 100% | 4m 00s | Stable |
| phoenix-precision-guardian | ~10/week | 95% | 2m 00s | Stable |
| xirr-fees-validator | ~15/week | 98% | 1m 45s | Improving |
| phoenix-probabilistic-engineer | ~8/week | 90% | 5m 00s | New |

### Low-Volume Agents (Monthly Metrics)

| Agent | Invocations | Success Rate | Avg Runtime |
|-------|-------------|--------------|-------------|
| db-migration | ~5/month | 100% | 2m 00s |
| incident-responder | ~2/month | 100% | 10m 00s |
| chaos-engineer | ~1/month | 100% | 15m 00s |
| playwright-test-author | ~3/month | 90% | 5m 00s |

---

## Failure Analysis

### Common Failure Patterns

| Pattern | Frequency | Typical Agent | Mitigation |
|---------|-----------|---------------|------------|
| Timeout | 15% of failures | test-repair | Increase timeout, add progress logging |
| File not found | 10% of failures | code-reviewer | Validate paths before analysis |
| Memory limit | 5% of failures | perf-guard | Streaming analysis for large bundles |
| Rate limit | 3% of failures | Any | Exponential backoff, retry |

### Agent-Specific Issues

**test-repair:**
- 60% of failures: Test still failing after 3 fix attempts
- Mitigation: Escalate to human, log attempted fixes

**phoenix-probabilistic-engineer:**
- 70% of failures: Monte Carlo convergence issues
- Mitigation: Increase iteration count, adjust seed

**playwright-test-author:**
- 50% of failures: Browser environment issues
- Mitigation: Retry with fresh browser context

---

## Performance Optimization Log

### Recent Improvements

| Date | Agent | Optimization | Impact |
|------|-------|--------------|--------|
| 2025-12-20 | code-reviewer | Parallel file analysis | -40% runtime |
| 2025-12-15 | test-repair | Cached test discovery | -25% runtime |
| 2025-12-10 | perf-guard | Incremental bundle analysis | -50% runtime |

### Planned Optimizations

| Agent | Planned Change | Expected Impact | Priority |
|-------|----------------|-----------------|----------|
| phoenix-truth-case-runner | Parallel test execution | -30% runtime | P1 |
| waterfall-specialist | Memoized validation | -20% runtime | P2 |
| schema-drift-checker | Incremental schema comparison | -40% runtime | P2 |

---

## Usage Patterns

### Peak Usage Times

```
Invocations by Hour (UTC):
14:00-16:00  ████████████████████ 35%
16:00-18:00  ██████████████ 25%
18:00-20:00  ██████████ 18%
Other hours  ███████████ 22%
```

### Agent Chaining Patterns

Most common sequences:

1. `code-reviewer → test-repair → perf-guard` (45%)
2. `waterfall-specialist → xirr-fees-validator` (20%)
3. `schema-drift-checker → db-migration` (15%)
4. `phoenix-truth-case-runner → phoenix-precision-guardian` (10%)

### Files Per Invocation

| Agent | Avg Files | Max Files |
|-------|-----------|-----------|
| code-reviewer | 8 | 50 |
| test-repair | 3 | 15 |
| waterfall-specialist | 2 | 5 |
| perf-guard | 1 | 1 (bundle) |

---

## SLO Definitions

### Tier 1 Agents (Critical Path)

| Agent | Availability SLO | Latency P95 SLO |
|-------|------------------|-----------------|
| code-reviewer | 99.9% | <2min |
| test-repair | 99.5% | <5min |
| waterfall-specialist | 99.9% | <3min |

### Tier 2 Agents (Important)

| Agent | Availability SLO | Latency P95 SLO |
|-------|------------------|-----------------|
| perf-guard | 99% | <5min |
| phoenix-truth-case-runner | 99% | <10min |
| schema-drift-checker | 99% | <2min |

### Tier 3 Agents (Best Effort)

| Agent | Availability SLO | Latency P95 SLO |
|-------|------------------|-----------------|
| chaos-engineer | 95% | <30min |
| playwright-test-author | 95% | <10min |
| incident-responder | 99% (on demand) | <15min |

---

## Alerting Rules

### Critical Alerts

| Condition | Alert | Action |
|-----------|-------|--------|
| Success rate <90% for 1 hour | Page on-call | Investigate immediately |
| Avg runtime >2x normal | Slack notification | Review and optimize |
| Memory usage >90% | Slack notification | Increase limits or fix leak |

### Warning Alerts

| Condition | Alert | Action |
|-----------|-------|--------|
| Success rate <95% for 24 hours | Daily report | Review failure patterns |
| Queue depth >10 pending | Dashboard update | Scale or prioritize |

---

## Reporting

### Weekly Metrics Report

Generated every Monday:

1. Top 5 most-used agents
2. Agents with declining success rate
3. Performance regressions
4. Optimization opportunities

### Monthly Review

1. Agent utilization trends
2. Cost analysis (tokens consumed)
3. SLO compliance
4. Capacity planning

---

## Integration with Memory

Metrics are stored using the hybrid memory system:

```typescript
// Record metrics after each agent run
await memoryManager.store({
  tenantId: 'metrics:agent-performance',
  key: `${agentId}:${invocationId}`,
  value: metrics,
  scope: 'project',
  ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
});

// Query metrics for analysis
const recentMetrics = await memoryManager.query({
  tenantId: 'metrics:agent-performance',
  prefix: `${agentId}:`,
  limit: 100,
});
```

---

## How to Update This Document

1. Run metrics collection: `npm run ai -- metrics --collect`
2. Review generated report
3. Update tables above with fresh data
4. Commit with message: `docs: update agent metrics for week of YYYY-MM-DD`

---

## Related Resources

- [AGENT-DIRECTORY.md](AGENT-DIRECTORY.md) - Full agent catalog
- [CAPABILITIES.md](../CAPABILITIES.md) - Agent capabilities
- [packages/agent-core/](../packages/agent-core/) - Agent infrastructure
