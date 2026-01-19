---
status: ACTIVE
last_updated: 2026-01-19
---

# Multi-Tenant RLS Monitoring & Alerting Specifications

**Status**: Production-Ready
**Last Updated**: 2025-11-11
**Owner**: Platform Engineering

## Table of Contents

1. [Critical Alerts (Immediate Action Required)](#critical-alerts)
2. [Warning Alerts (Investigate Within 1 Hour)](#warning-alerts)
3. [Informational Metrics (Trend Tracking)](#informational-metrics)
4. [Alert Fatigue Prevention](#alert-fatigue-prevention)
5. [Grafana Dashboard Configuration](#grafana-dashboard-configuration)
6. [Prometheus Exporters Setup](#prometheus-exporters-setup)
7. [Alert Routing & Escalation](#alert-routing--escalation)

---

## Critical Alerts (Immediate Action Required)

### CRITICAL-1: Cross-Tenant Data Leakage Detected

**Description**: RLS policy violation allowing data access across tenant boundaries.

**Prometheus Query**:
```promql
# Detect queries returning data from wrong organization
increase(rls_policy_violation_total[5m]) > 0
```

**Alert Configuration** (`alerts/rls-critical.yml`):
```yaml
groups:
  - name: rls_security_critical
    interval: 10s  # Check every 10 seconds
    rules:
      - alert: CrossTenantDataLeakage
        expr: increase(rls_policy_violation_total[5m]) > 0
        for: 30s
        labels:
          severity: critical
          team: security
          priority: P0
        annotations:
          summary: "CRITICAL: Cross-tenant data leakage detected"
          description: |
            RLS policy violation detected in last 5 minutes.
            Organization: {{ $labels.organization_id }}
            User: {{ $labels.user_id }}
            Table: {{ $labels.table_name }}

            IMMEDIATE ACTIONS:
            1. Revoke application database access
            2. Page on-call engineer
            3. Initiate security incident response
          runbook_url: "https://wiki.updog.com/runbooks/rls-data-leak"
```

**Detection Method** (SQL Trigger):
```sql
-- Audit table for RLS violations
CREATE TABLE rls_violations (
  id BIGSERIAL PRIMARY KEY,
  detected_at TIMESTAMP DEFAULT NOW(),
  session_user TEXT,
  organization_id UUID,
  table_name TEXT,
  query TEXT,
  row_count INTEGER
);

-- Example detection: Query returns rows from different org
-- This would be implemented in application code with post-query validation
```

**Response Procedure**:
1. **Immediate**: Revoke `updog_app` database access
   ```sql
   REVOKE ALL ON ALL TABLES IN SCHEMA app FROM updog_app;
   ```
2. **Within 2min**: Page on-call security engineer
3. **Within 5min**: Isolate affected customer data
4. **Within 15min**: Root cause analysis begins
5. **Within 1hr**: Customer notification (if confirmed breach)

**SLO**: Zero tolerance - Any violation is a P0 incident

---

### CRITICAL-2: Queries Executed Without RLS Context

**Description**: Application queries running without `app.current_org` set.

**Prometheus Query**:
```promql
# Queries with missing RLS context
rate(http_requests_total{status="200", rls_context="missing"}[5m]) > 0.01
```

**Alert Configuration**:
```yaml
- alert: QueriesWithoutRLSContext
  expr: rate(http_requests_total{status="200", rls_context="missing"}[5m]) > 0.01
  for: 2m
  labels:
    severity: critical
    team: platform
    priority: P0
  annotations:
    summary: "CRITICAL: Queries without RLS context"
    description: |
      {{ $value | humanizePercentage }} of queries missing RLS context.

      This indicates middleware bypass or misconfiguration.

      IMMEDIATE ACTIONS:
      1. Check middleware execution order
      2. Review recent deployments
      3. Verify all routes use withRLSTransaction()
    runbook_url: "https://wiki.updog.com/runbooks/missing-rls-context"
```

**Instrumentation** (Application Code):
```typescript
// Middleware to track RLS context
app.use(async (req: RLSRequest, res: Response, next: NextFunction) => {
  if (!req.context) {
    rlsContextMissing.inc({ path: req.path });
    logger.error('Missing RLS context', {
      path: req.path,
      method: req.method,
      headers: req.headers,
    });
    return res.status(401).json({ error: 'unauthorized' });
  }

  rlsContextPresent.inc({ path: req.path });
  next();
});

// Prometheus metrics
const rlsContextMissing = new promClient.Counter({
  name: 'rls_context_missing_total',
  help: 'Number of requests without RLS context',
  labelNames: ['path'],
});

const rlsContextPresent = new promClient.Counter({
  name: 'rls_context_present_total',
  help: 'Number of requests with RLS context',
  labelNames: ['path'],
});
```

**Response Procedure**:
1. **Immediate**: Trigger circuit breaker (block affected routes)
2. **Within 1min**: Rollback recent deployment
3. **Within 5min**: Verify middleware chain
4. **Within 15min**: Audit all recent requests for data leakage

---

### CRITICAL-3: Stale RLS Context Detected

**Description**: Connection pool returned to app with RLS context still set.

**Prometheus Query**:
```promql
# Idle connections with RLS context
pg_stat_activity_count{state="idle", has_rls_context="true"} > 0
```

**Alert Configuration**:
```yaml
- alert: StaleRLSContext
  expr: pg_stat_activity_count{state="idle", has_rls_context="true"} > 0
  for: 30s
  labels:
    severity: critical
    team: database
    priority: P0
  annotations:
    summary: "CRITICAL: Stale RLS context in connection pool"
    description: |
      {{ $value }} idle connections have RLS context set.

      This indicates PgBouncer server_reset_query is not working.

      IMMEDIATE ACTIONS:
      1. Verify PgBouncer config: server_reset_query = DISCARD ALL
      2. Reload PgBouncer: systemctl reload pgbouncer
      3. Kill stale connections: SELECT pg_terminate_backend(pid)...
    runbook_url: "https://wiki.updog.com/runbooks/stale-rls-context"
```

**Detection Method** (Custom Exporter):
```python
# prometheus_pg_exporter_custom.py
import psycopg2
from prometheus_client import Gauge

stale_context_gauge = Gauge(
    'pg_stat_activity_stale_rls_context',
    'Number of idle connections with RLS context',
)

def check_stale_context():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("""
        SELECT COUNT(*)
        FROM pg_stat_activity
        WHERE state = 'idle'
        AND current_setting('app.current_org', true) IS NOT NULL
        AND current_setting('app.current_org', true) != ''
    """)

    count = cur.fetchone()[0]
    stale_context_gauge.set(count)

    conn.close()
```

**Response Procedure**:
1. **Immediate**: Reload PgBouncer config
2. **Within 30s**: Kill stale connections
3. **Within 2min**: Verify `DISCARD ALL` is executing
4. **Within 5min**: Test connection reuse isolation

---

### CRITICAL-4: RLS Policy Missing or Disabled

**Description**: RLS accidentally disabled on critical table.

**Prometheus Query**:
```promql
# RLS enabled status (0 = disabled, 1 = enabled)
pg_table_rls_enabled{table=~"funds|portfoliocompanies|investments"} == 0
```

**Alert Configuration**:
```yaml
- alert: RLSDisabledOnTable
  expr: pg_table_rls_enabled{table=~"funds|portfoliocompanies|investments"} == 0
  for: 10s  # Near-instant alert
  labels:
    severity: critical
    team: database
    priority: P0
  annotations:
    summary: "CRITICAL: RLS disabled on {{ $labels.table }}"
    description: |
      Row-level security is disabled on critical table: {{ $labels.table }}

      This exposes ALL tenant data across organizations.

      IMMEDIATE ACTIONS:
      1. Enable RLS: ALTER TABLE {{ $labels.table }} ENABLE ROW LEVEL SECURITY;
      2. Force RLS: ALTER TABLE {{ $labels.table }} FORCE ROW LEVEL SECURITY;
      3. Verify policies exist: SELECT * FROM pg_policies WHERE tablename = '{{ $labels.table }}';
    runbook_url: "https://wiki.updog.com/runbooks/rls-disabled"
```

**Detection Method** (Custom Exporter):
```sql
-- Monitoring query
SELECT
  c.relname as table_name,
  CASE WHEN c.relrowsecurity THEN 1 ELSE 0 END as rls_enabled,
  CASE WHEN c.relforcerowsecurity THEN 1 ELSE 0 END as rls_forced,
  COUNT(p.policyname) as policy_count
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname
WHERE c.relname IN ('funds', 'portfoliocompanies', 'investments', 'investment_lots')
AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity;
```

**Response Procedure**:
1. **Immediate**: Re-enable RLS on affected table
2. **Within 1min**: Verify policies exist and are correct
3. **Within 5min**: Audit recent queries for data exposure
4. **Within 15min**: Root cause analysis (who disabled? why?)

---

## Warning Alerts (Investigate Within 1 Hour)

### WARNING-1: Slow RLS Query Performance

**Description**: RLS-filtered queries exceeding performance targets.

**Prometheus Query**:
```promql
# p95 query time > 10ms
histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket{query_type="rls_filtered"}[5m])) > 0.010
```

**Alert Configuration**:
```yaml
- alert: SlowRLSQueries
  expr: histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket{query_type="rls_filtered"}[5m])) > 0.010
  for: 10m
  labels:
    severity: warning
    team: database
    priority: P2
  annotations:
    summary: "WARNING: Slow RLS queries detected"
    description: |
      p95 query latency is {{ $value }}s (target: < 0.010s)
      Organization: {{ $labels.organization_id }}
      Table: {{ $labels.table_name }}

      INVESTIGATION:
      1. Run EXPLAIN ANALYZE on slow queries
      2. Check for missing indexes
      3. Verify ANALYZE stats are current
      4. Review query patterns for optimization
    runbook_url: "https://wiki.updog.com/runbooks/slow-rls-queries"
```

**Response Procedure**:
1. **Within 15min**: Identify slow queries from `pg_stat_statements`
2. **Within 30min**: Run EXPLAIN ANALYZE
3. **Within 1hr**: Create index if needed, or optimize query
4. **Follow-up**: Add to index monitoring checklist

---

### WARNING-2: High Sequential Scan Rate

**Description**: Tables being scanned sequentially instead of using indexes.

**Prometheus Query**:
```promql
# Sequential scans per second
rate(pg_stat_user_tables_seq_scan{table=~"funds|portfoliocompanies"}[5m]) > 10
```

**Alert Configuration**:
```yaml
- alert: HighSequentialScans
  expr: rate(pg_stat_user_tables_seq_scan{table=~"funds|portfoliocompanies"}[5m]) > 10
  for: 15m
  labels:
    severity: warning
    team: database
    priority: P2
  annotations:
    summary: "WARNING: High sequential scan rate on {{ $labels.table }}"
    description: |
      {{ $value }} sequential scans/sec on {{ $labels.table }}

      Indicates missing or unused indexes.

      INVESTIGATION:
      1. Check index usage: SELECT * FROM pg_stat_user_indexes WHERE tablename = '{{ $labels.table }}';
      2. Review recent queries for patterns
      3. Consider compound indexes
    runbook_url: "https://wiki.updog.com/runbooks/sequential-scans"
```

---

### WARNING-3: Connection Pool Saturation

**Description**: PgBouncer pool nearing capacity.

**Prometheus Query**:
```promql
# Pool utilization > 80%
pgbouncer_pools_client_active / pgbouncer_pools_client_maxwait > 0.8
```

**Alert Configuration**:
```yaml
- alert: ConnectionPoolSaturation
  expr: pgbouncer_pools_client_active / pgbouncer_pools_client_maxwait > 0.8
  for: 5m
  labels:
    severity: warning
    team: platform
    priority: P2
  annotations:
    summary: "WARNING: Connection pool {{ $labels.database }} at {{ $value | humanizePercentage }} capacity"
    description: |
      PgBouncer pool saturation: {{ $value | humanizePercentage }}

      ACTIONS:
      1. Scale application horizontally (add instances)
      2. Review long-running queries
      3. Consider increasing pool size
    runbook_url: "https://wiki.updog.com/runbooks/pool-saturation"
```

---

### WARNING-4: High Transaction Rollback Rate

**Description**: Elevated rollback rate indicates errors in application code.

**Prometheus Query**:
```promql
# Rollback ratio > 10%
rate(pg_stat_database_xact_rollback[5m]) / rate(pg_stat_database_xact_commit[5m]) > 0.1
```

**Alert Configuration**:
```yaml
- alert: HighRollbackRate
  expr: rate(pg_stat_database_xact_rollback[5m]) / rate(pg_stat_database_xact_commit[5m]) > 0.1
  for: 10m
  labels:
    severity: warning
    team: platform
    priority: P2
  annotations:
    summary: "WARNING: High transaction rollback rate: {{ $value | humanizePercentage }}"
    description: |
      Rollback rate: {{ $value | humanizePercentage }} (threshold: 10%)

      INVESTIGATION:
      1. Check application logs for errors
      2. Review recent deployments
      3. Check for constraint violations
    runbook_url: "https://wiki.updog.com/runbooks/high-rollbacks"
```

---

### WARNING-5: Missing RLS Indexes

**Description**: organization_id column not indexed on RLS-enabled table.

**Prometheus Query**:
```promql
# Index exists = 1, missing = 0
pg_table_has_org_index{table=~"funds|portfoliocompanies"} == 0
```

**Alert Configuration**:
```yaml
- alert: MissingRLSIndex
  expr: pg_table_has_org_index{table=~"funds|portfoliocompanies"} == 0
  for: 1h  # Allow time for index creation
  labels:
    severity: warning
    team: database
    priority: P2
  annotations:
    summary: "WARNING: Missing organization_id index on {{ $labels.table }}"
    description: |
      Table {{ $labels.table }} has RLS enabled but no index on organization_id.

      ACTIONS:
      1. Create index: CREATE INDEX CONCURRENTLY idx_{{ $labels.table }}_org_id ON {{ $labels.table }}(organization_id);
      2. Monitor index creation progress
      3. Update table documentation
    runbook_url: "https://wiki.updog.com/runbooks/missing-index"
```

---

## Informational Metrics (Trend Tracking)

### INFO-1: RLS Query Performance Trends

**Prometheus Query**:
```promql
# Track p50, p95, p99 over time
histogram_quantile(0.50, rate(pg_query_duration_seconds_bucket{query_type="rls_filtered"}[5m]))
histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket{query_type="rls_filtered"}[5m]))
histogram_quantile(0.99, rate(pg_query_duration_seconds_bucket{query_type="rls_filtered"}[5m]))
```

**Grafana Panel**:
- Time series chart
- 7-day lookback
- Annotations for deployments and incidents

---

### INFO-2: Organization Growth Tracking

**Prometheus Query**:
```promql
# Total organizations
pg_table_row_count{table="organizations"}

# Active organizations (with recent queries)
count(rate(http_requests_total{rls_context="present"}[1h]) > 0) by (organization_id)
```

---

### INFO-3: Per-Tenant Query Volume

**Prometheus Query**:
```promql
# Queries per second by organization
rate(http_requests_total{rls_context="present"}[5m]) by (organization_id)
```

**Use Cases**:
- Identify noisy neighbors
- Plan capacity scaling
- Detect unusual activity patterns

---

### INFO-4: Index Usage Statistics

**Prometheus Query**:
```promql
# Index scan ratio
pg_stat_user_indexes_idx_scan / (pg_stat_user_indexes_idx_scan + pg_stat_user_tables_seq_scan)
```

---

### INFO-5: RLS Policy Evaluation Count

**Prometheus Query**:
```promql
# How often RLS policies are evaluated
rate(pg_stat_user_tables_n_tup_fetch[5m]) by (table_name)
```

---

## Alert Fatigue Prevention

### Strategy 1: Intelligent Thresholds

Use dynamic thresholds based on historical data:

```promql
# Alert if current value deviates > 3 standard deviations from 1-week average
abs(
  histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket[5m]))
  -
  avg_over_time(histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket[5m]))[7d])
) > (
  3 * stddev_over_time(histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket[5m]))[7d])
)
```

---

### Strategy 2: Alert Grouping

Group related alerts to reduce noise:

```yaml
# alertmanager.yml
route:
  group_by: ['alertname', 'organization_id', 'table_name']
  group_wait: 30s  # Wait 30s before sending
  group_interval: 5m  # Group alerts within 5min window
  repeat_interval: 4h  # Re-alert every 4 hours if unresolved
```

---

### Strategy 3: Time-Based Routing

Different severity during business hours vs. off-hours:

```yaml
routes:
  - match:
      severity: warning
    receiver: slack-warnings
    continue: true

  - match:
      severity: critical
      time_range: ["09:00", "18:00"]  # Business hours
    receiver: pagerduty-immediate

  - match:
      severity: critical
    receiver: pagerduty-oncall
```

---

### Strategy 4: Auto-Resolution

Automatically resolve alerts when conditions normalize:

```yaml
- alert: SlowRLSQueries
  expr: histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket[5m])) > 0.010
  for: 10m
  annotations:
    summary: "Slow RLS queries"

  # Auto-resolve when below threshold for 5min
  resolve_timeout: 5m
```

---

### Strategy 5: Alert Suppression Windows

Suppress known noisy alerts during maintenance:

```yaml
inhibit_rules:
  - source_match:
      alertname: 'MaintenanceMode'
    target_match_re:
      alertname: '(SlowRLSQueries|HighSequentialScans)'
    equal: ['database']
```

---

## Grafana Dashboard Configuration

### Dashboard: Multi-Tenant RLS Monitoring

**Dashboard JSON**: `dashboards/rls-monitoring.json`

#### Panel 1: RLS Context Health

```json
{
  "title": "RLS Context Health",
  "targets": [
    {
      "expr": "rate(rls_context_present_total[5m])",
      "legendFormat": "Requests with context"
    },
    {
      "expr": "rate(rls_context_missing_total[5m])",
      "legendFormat": "Requests missing context (CRITICAL)"
    }
  ],
  "type": "graph",
  "yaxis": {
    "label": "Requests/sec"
  }
}
```

#### Panel 2: Query Performance by Organization

```json
{
  "title": "Query Latency by Organization (p95)",
  "targets": [
    {
      "expr": "histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket[5m])) by (organization_id)",
      "legendFormat": "{{ organization_id }}"
    }
  ],
  "type": "graph",
  "yaxis": {
    "label": "Latency (seconds)",
    "format": "s"
  },
  "thresholds": [
    { "value": 0.010, "color": "yellow", "label": "Target" },
    { "value": 0.050, "color": "red", "label": "Critical" }
  ]
}
```

#### Panel 3: RLS Policy Violations (Heatmap)

```json
{
  "title": "RLS Policy Violations Heatmap",
  "targets": [
    {
      "expr": "increase(rls_policy_violation_total[5m])",
      "legendFormat": "{{ table_name }} - {{ organization_id }}"
    }
  ],
  "type": "heatmap",
  "dataFormat": "tsbuckets",
  "color": {
    "mode": "spectrum",
    "colorScheme": "interpolateReds"
  }
}
```

#### Panel 4: Connection Pool Utilization

```json
{
  "title": "PgBouncer Connection Pool",
  "targets": [
    {
      "expr": "pgbouncer_pools_client_active",
      "legendFormat": "Active"
    },
    {
      "expr": "pgbouncer_pools_client_waiting",
      "legendFormat": "Waiting (queue)"
    },
    {
      "expr": "pgbouncer_pools_client_maxwait",
      "legendFormat": "Max capacity"
    }
  ],
  "type": "graph"
}
```

#### Panel 5: Index Usage Ratio

```json
{
  "title": "Index Usage vs Sequential Scans",
  "targets": [
    {
      "expr": "rate(pg_stat_user_indexes_idx_scan[5m]) by (table_name)",
      "legendFormat": "{{ table_name }} - Index Scan"
    },
    {
      "expr": "rate(pg_stat_user_tables_seq_scan[5m]) by (table_name)",
      "legendFormat": "{{ table_name }} - Seq Scan"
    }
  ],
  "type": "graph",
  "stack": true
}
```

---

## Prometheus Exporters Setup

### Custom RLS Metrics Exporter

**File**: `scripts/exporters/rls-exporter.py`

```python
#!/usr/bin/env python3
"""
Custom Prometheus exporter for RLS-specific metrics
Run as systemd service: rls-exporter.service
"""

import time
import psycopg2
from prometheus_client import start_http_server, Gauge, Counter
import os

# Metrics
rls_enabled_gauge = Gauge('pg_table_rls_enabled', 'RLS enabled status', ['table'])
rls_forced_gauge = Gauge('pg_table_rls_forced', 'RLS forced status', ['table'])
policy_count_gauge = Gauge('pg_table_policy_count', 'Number of RLS policies', ['table'])
org_index_gauge = Gauge('pg_table_has_org_index', 'Has organization_id index', ['table'])

stale_context_gauge = Gauge('pg_stat_activity_stale_rls_context', 'Idle connections with RLS context')

DATABASE_URL = os.environ['DATABASE_URL']
TABLES = ['funds', 'portfoliocompanies', 'investments', 'investment_lots']

def collect_rls_status():
    """Collect RLS configuration status"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Check RLS enabled status
    cur.execute("""
        SELECT
          c.relname,
          c.relrowsecurity,
          c.relforcerowsecurity,
          COUNT(p.policyname) as policy_count
        FROM pg_class c
        LEFT JOIN pg_policies p ON p.tablename = c.relname
        WHERE c.relname = ANY(%s)
        AND c.relkind = 'r'
        GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    """, (TABLES,))

    for row in cur.fetchall():
        table, enabled, forced, policy_count = row
        rls_enabled_gauge.labels(table=table).set(1 if enabled else 0)
        rls_forced_gauge.labels(table=table).set(1 if forced else 0)
        policy_count_gauge.labels(table=table).set(policy_count)

    # Check for organization_id indexes
    cur.execute("""
        SELECT
          t.relname as table_name,
          CASE WHEN COUNT(i.indexrelid) > 0 THEN 1 ELSE 0 END as has_index
        FROM pg_class t
        LEFT JOIN pg_index i ON i.indrelid = t.oid
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
        WHERE t.relname = ANY(%s)
        AND t.relkind = 'r'
        AND (a.attname = 'organization_id' OR a.attname IS NULL)
        GROUP BY t.relname
    """, (TABLES,))

    for row in cur.fetchall():
        table, has_index = row
        org_index_gauge.labels(table=table).set(has_index)

    # Check for stale RLS context
    cur.execute("""
        SELECT COUNT(*)
        FROM pg_stat_activity
        WHERE state = 'idle'
        AND current_setting('app.current_org', true) IS NOT NULL
        AND current_setting('app.current_org', true) != ''
    """)

    stale_count = cur.fetchone()[0]
    stale_context_gauge.set(stale_count)

    conn.close()

def main():
    # Start Prometheus HTTP server on port 9200
    start_http_server(9200)

    print("RLS Exporter started on :9200")

    while True:
        try:
            collect_rls_status()
        except Exception as e:
            print(f"Error collecting metrics: {e}")

        time.sleep(15)  # Collect every 15 seconds

if __name__ == '__main__':
    main()
```

**Systemd Service** (`/etc/systemd/system/rls-exporter.service`):
```ini
[Unit]
Description=RLS Prometheus Exporter
After=network.target postgresql.service

[Service]
Type=simple
User=prometheus
Environment="DATABASE_URL=postgresql://updog_monitor:password@localhost:5432/updog"
ExecStart=/usr/bin/python3 /opt/updog/scripts/exporters/rls-exporter.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Prometheus Scrape Config** (`prometheus.yml`):
```yaml
scrape_configs:
  - job_name: 'rls-exporter'
    static_configs:
      - targets: ['localhost:9200']
    scrape_interval: 15s
```

---

## Alert Routing & Escalation

### Notification Channels

#### Slack Integration

**Alertmanager Config** (`alertmanager.yml`):
```yaml
receivers:
  - name: 'slack-critical'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ'
        channel: '#alerts-critical'
        title: '{{ .GroupLabels.alertname }}'
        text: |
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Severity:* {{ .Labels.severity }}
          *Runbook:* {{ .Annotations.runbook_url }}
          {{ end }}
        send_resolved: true

  - name: 'slack-warnings'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ'
        channel: '#alerts-warnings'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

#### PagerDuty Integration

```yaml
receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: 'YOUR_SERVICE_KEY'
        severity: '{{ .CommonLabels.severity }}'
        description: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ .Alerts.Firing | len }}'
          resolved: '{{ .Alerts.Resolved | len }}'
```

#### Email Escalation

```yaml
receivers:
  - name: 'email-escalation'
    email_configs:
      - to: 'oncall@updog.com'
        from: 'alerts@updog.com'
        smarthost: 'smtp.updog.com:587'
        auth_username: 'alerts@updog.com'
        auth_password: '$SMTP_PASSWORD'
        headers:
          Subject: '[{{ .Status }}] {{ .GroupLabels.alertname }}'
        html: |
          <h2>{{ .GroupLabels.alertname }}</h2>
          <ul>
          {{ range .Alerts }}
            <li>{{ .Annotations.description }}</li>
          {{ end }}
          </ul>
```

### Escalation Policy

```yaml
route:
  receiver: 'slack-warnings'
  group_by: ['alertname', 'severity']

  routes:
    # Critical alerts
    - match:
        severity: critical
      receiver: 'slack-critical'
      continue: true
      group_wait: 10s
      group_interval: 30s
      repeat_interval: 30m

      routes:
        # Page oncall after 5min if unacknowledged
        - match:
            priority: P0
          receiver: 'pagerduty-critical'
          group_wait: 5m
          continue: true

        # Email escalation after 15min
        - match:
            priority: P0
          receiver: 'email-escalation'
          group_wait: 15m

    # Warnings
    - match:
        severity: warning
      receiver: 'slack-warnings'
      group_wait: 5m
      group_interval: 10m
      repeat_interval: 4h
```

---

## Summary: Alert Priority Matrix

| Alert Name | Severity | Response Time | Escalation | Auto-Resolve |
|------------|----------|---------------|------------|--------------|
| CrossTenantDataLeakage | CRITICAL | Immediate | Page → Email | No |
| QueriesWithoutRLSContext | CRITICAL | < 2min | Page → Email | No |
| StaleRLSContext | CRITICAL | < 30s | Page | Yes |
| RLSDisabledOnTable | CRITICAL | < 10s | Page | No |
| SlowRLSQueries | WARNING | < 1hr | Slack | Yes |
| HighSequentialScans | WARNING | < 1hr | Slack | Yes |
| ConnectionPoolSaturation | WARNING | < 5min | Slack | Yes |
| HighRollbackRate | WARNING | < 15min | Slack | Yes |
| MissingRLSIndex | WARNING | < 1hr | Slack | Yes |

---

## Next Steps

1. Deploy custom RLS exporter: `systemctl start rls-exporter`
2. Import Grafana dashboards: `dashboards/rls-monitoring.json`
3. Configure Alertmanager routing: `alertmanager.yml`
4. Test alert delivery: `amtool alert add test severity=critical`
5. Schedule Game Day to validate alerts fire correctly
