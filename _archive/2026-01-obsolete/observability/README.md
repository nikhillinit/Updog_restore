# AI Agent Observability Stack

**HISTORICAL REFERENCE:** This local observability infrastructure has been
archived to `_archive/2026-01-obsolete/observability/`. The project now uses
cloud-native development (Neon + Upstash) with production monitoring code in
`server/observability/*`.

Complete monitoring, alerting, and observability for AI-augmented development
agents.

## Components

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization dashboards
- **AlertManager**: Alert routing and notifications
- **Slack Integration**: Real-time crash alerts
- **Health Monitoring**: Agent status tracking

## Quick Start

```bash
# Start observability stack
docker-compose -f docker-compose.observability.yml up -d

# Start metrics server
npm run ai:metrics

# View metrics
npm run ai metrics
```

## Endpoints

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **AlertManager**: http://localhost:9093
- **Metrics Server**: http://localhost:3000/metrics
- **Health Check**: http://localhost:3000/health

## Metrics Collected

### Agent Execution Metrics

- `agent_executions_total` - Total executions by agent/operation/status
- `agent_execution_duration_ms` - Execution duration histogram
- `agent_execution_failures_total` - Failure count by agent/operation/error_type
- `agent_active_count` - Currently active agents
- `agent_last_execution_timestamp` - Last execution time
- `agent_retries_total` - Retry count by agent/operation

### System Metrics (via node-exporter)

- CPU usage, memory usage, disk space
- Network I/O, file system metrics
- Process and system load metrics

## Alerts Configured

### Agent Alerts

- **High Failure Rate**: >10% failure rate for 2 minutes
- **Agent Down**: Monitoring endpoint unavailable for 1 minute
- **Long Execution Time**: 95th percentile >60 seconds for 3 minutes
- **No Recent Executions**: No activity for 30 minutes
- **High Retry Rate**: >5% retry rate for 2 minutes

### System Alerts

- **High CPU Usage**: >80% for 5 minutes
- **High Memory Usage**: >85% for 5 minutes
- **Disk Space Low**: >90% usage for 5 minutes

## Slack Integration

Configure Slack webhook for real-time alerts:

```typescript
const agent = new TestRepairAgent({
  name: 'test-repair-agent',
  slack: {
    webhookUrl: 'https://hooks.slack.com/services/...',
    channel: '#ai-agents',
    enabled: true,
  },
});
```

Alert types:

- [CRITICAL] Agent crashes, system down
- [WARNING] High failure rates, performance issues
- [INFO] Agent recovery notifications

## Dashboard Features

### Agent Overview

- Real-time execution rate
- Success rate percentage with thresholds
- Active agent count
- P50/P90/P99 execution duration

### Performance Monitoring

- Execution duration trends
- Failure rate by agent and error type
- Retry patterns and frequency
- Agent activity timeline

### Health Status

- Agent status table (healthy/degraded/unhealthy)
- Last execution times
- Consecutive failure tracking
- Recovery notifications

## Configuration

### Environment Variables

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
METRICS_PORT=3000
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
```

### Custom Alerts

Edit `observability/prometheus/alerts.yml` to add custom alert rules.

### Dashboard Customization

Modify `observability/grafana/dashboards/agent-dashboard.json` for custom
visualizations.

## Usage Examples

### Starting the Stack

```bash
# Full observability stack
docker-compose -f docker-compose.observability.yml up -d

# Just metrics server
npm run ai:metrics &

# Run agents with metrics
npm run ai test --verbose
npm run ai repair --draft-pr
```

### Viewing Metrics

```bash
# Command line metrics
curl http://localhost:3000/metrics

# Health check
curl http://localhost:3000/health

# Grafana dashboard
open http://localhost:3001
```

### Triggering Alerts

```bash
# Create test failures to trigger alerts
npm run ai repair "nonexistent-pattern"

# View alerts in AlertManager
open http://localhost:9093
```

## Architecture

```
AI Agents → MetricsCollector → Prometheus → AlertManager → Slack
    ↓              ↓               ↓
HealthMonitor  Metrics Server  Grafana Dashboard
```

The observability stack provides comprehensive monitoring for AI agent
operations, enabling proactive issue detection and rapid incident response.
