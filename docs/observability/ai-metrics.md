# AI Agent Prometheus Metrics

## Naming Conventions

- **Units in names**: Always suffix with units (`_seconds`, `_bytes`, `_total`)
- **Cardinality guards**: NEVER use `runId`, `userId`, or raw `scenario_id` in labels
- **Bucketing strategy**: Hash high-cardinality IDs into fixed buckets (0-63)

## SSE Streaming

- `ai_stream_connections_active` (gauge) - Current open SSE connections
- `ai_stream_ttfb_seconds` (histogram) - Time to first byte (p50/p95/p99)
- `ai_stream_duration_seconds` (histogram) - Full stream duration
- `ai_stream_bytes_sent_total` (counter) - Total bytes streamed
- `ai_stream_errors_total{reason}` (counter) - Stream failures by reason

## Token Budgeting

- `ai_token_budget_used_total{operation}` (counter) - Tokens consumed per operation type
- `ai_token_budget_limit{operation}` (gauge) - Budget ceiling
- `ai_token_cost_usd{operation}` (histogram) - Cost per operation in USD

## Circuit Breaker

- `ai_circuit_breaker_state{service}` (gauge) - 0=CLOSED, 1=OPEN, 2=HALF_OPEN
- `ai_circuit_breaker_trips_total{service}` (counter) - Total trips to OPEN state
- `ai_circuit_breaker_half_open_probes_total{service}` (counter) - Recovery probe attempts

## Dead Letter Queue

- `ai_dlq_enqueued_total{reason}` (counter) - Jobs sent to DLQ by failure reason
- `ai_dlq_replayed_total{success}` (counter) - Replay attempts (success=true/false)
- `ai_dlq_dead_total` (gauge) - Poison messages in `ai:dead` queue

## Evaluator Performance

- `ai_evaluator_runs_total{scenario_bucket,success}` (counter) - Evaluation runs
- `ai_evaluator_latency_milliseconds{scenario_bucket}` (histogram) - Evaluation duration
- `ai_evaluator_irr_delta{scenario_bucket}` (histogram) - Construction vs Current IRR delta
- `ai_evaluator_tvpi_delta{scenario_bucket}` (histogram) - Construction vs Current TVPI delta

### Label Cardinality Example

**GOOD (bounded):**
```javascript
{
  scenario_bucket: crypto.createHash('sha256')
    .update(scenarioId)
    .digest('hex')
    .slice(0, 2)
}
// Buckets: 00-ff (256 buckets)
```

**BAD (unbounded):**
```javascript
{scenario_id: "abc-123-def-456"}  // ❌ Unbounded cardinality
```

## Grafana Quick-Win Dashboard

**Row 1: SSE Performance**
- SSE p95 TTFB (target: <200ms)
- SSE p95 duration (target: <5s)

**Row 2: Reliability**
- Circuit breaker open count (24h)
- DLQ backlog size

**Row 3: Quality**
- Evaluator success ratio (1h, 24h)
- IRR/TVPI delta distribution

## Sample PromQL Queries

### SSE Health
```promql
# P95 Time to First Byte
histogram_quantile(0.95, rate(ai_stream_ttfb_seconds_bucket[5m]))

# Active connections
ai_stream_connections_active

# Error rate by reason
sum(rate(ai_stream_errors_total[5m])) by (reason)
```

### Token Budget Tracking
```promql
# Budget utilization (%)
100 * ai_token_budget_used_total / ai_token_budget_limit

# Cost per operation (p95)
histogram_quantile(0.95, rate(ai_token_cost_usd_bucket[1h]))
```

### Circuit Breaker Alerts
```promql
# Alert when circuit breaker trips
ai_circuit_breaker_state{service="anthropic"} == 1

# Trip frequency (last 24h)
increase(ai_circuit_breaker_trips_total[24h])
```

### Evaluator Quality
```promql
# Success ratio (1h window)
sum(rate(ai_evaluator_runs_total{success="true"}[1h]))
/
sum(rate(ai_evaluator_runs_total[1h]))

# IRR delta distribution
histogram_quantile(0.50, rate(ai_evaluator_irr_delta_bucket[1h]))
histogram_quantile(0.95, rate(ai_evaluator_irr_delta_bucket[1h]))
```

## Alert Rules

### Critical Alerts

```yaml
groups:
  - name: ai_agent_critical
    interval: 30s
    rules:
      - alert: AICircuitBreakerOpen
        expr: ai_circuit_breaker_state{service="anthropic"} == 1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "AI circuit breaker OPEN for {{ $labels.service }}"

      - alert: AITokenBudgetExceeded
        expr: ai_token_budget_used_total > ai_token_budget_limit
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Token budget exceeded for {{ $labels.operation }}"

      - alert: AIDLQBacklogHigh
        expr: ai_dlq_dead_total > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "DLQ has {{ $value }} poison messages"
```

### Warning Alerts

```yaml
  - name: ai_agent_warnings
    interval: 1m
    rules:
      - alert: AISSEHighLatency
        expr: histogram_quantile(0.95, rate(ai_stream_ttfb_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "SSE p95 TTFB {{ $value }}s (target: <200ms)"

      - alert: AIEvaluatorLowSuccessRate
        expr: |
          sum(rate(ai_evaluator_runs_total{success="true"}[1h]))
          /
          sum(rate(ai_evaluator_runs_total[1h]))
          < 0.95
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Evaluator success rate {{ $value | humanizePercentage }}"
```

## Cardinality Budget

| Metric | Labels | Max Cardinality | Notes |
|--------|--------|-----------------|-------|
| `ai_stream_*` | `reason` | 10 | Predefined error reasons |
| `ai_token_*` | `operation` | 20 | Known operation types |
| `ai_circuit_breaker_*` | `service` | 5 | LLM providers |
| `ai_dlq_*` | `reason`, `success` | 20 | Failure categories |
| `ai_evaluator_*` | `scenario_bucket`, `success` | 512 | 256 buckets × 2 states |

**Total estimated series:** ~1,000 (well below Prometheus default 1M limit)

## Best Practices

1. **Always use histograms for latencies** - Enables percentile queries without cardinality explosion
2. **Bucket scenario IDs** - Hash to fixed buckets (0-255) for attribution without unbounded labels
3. **Emit rates as counters** - Let Prometheus compute rates with `rate()` or `irate()`
4. **Label values must be bounded** - Whitelist allowed values, reject dynamic strings
5. **Units in metric names** - `_seconds`, `_bytes`, `_total` (never in labels)
