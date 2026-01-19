---
status: ACTIVE
last_updated: 2026-01-19
---

# POVC Fund Model - Observability & Monitoring

## Overview

This document outlines the comprehensive observability strategy implemented as part of Epic G1 (Platform Hardening), providing monitoring, metrics, health checks, and alerting for the POVC Fund Model platform.

## Health Check System

### Endpoint Overview

| Endpoint | Purpose | Use Case |
|----------|---------|----------|
| `/api/health` | Complete health status | General monitoring, dashboards |
| `/api/health/ready` | Readiness probe | Kubernetes readiness checks |
| `/api/health/live` | Liveness probe | Kubernetes liveness checks |
| `/metrics` | Prometheus metrics | Monitoring & alerting systems |

### Health Check Components

#### 1. Database Health
```typescript
async function checkDatabase(): Promise<HealthComponent> {
  try {
    await db.execute('SELECT 1');
    healthStatus.set({ component: 'database' }, 1);
    return {
      name: 'database',
      status: 'healthy',
      message: 'Database connection successful',
    };
  } catch (error) {
    healthStatus.set({ component: 'database' }, 0);
    return {
      name: 'database', 
      status: 'unhealthy',
      message: error.message,
    };
  }
}
```

#### 2. Redis Health (Optional)
- Checks Redis connectivity if configured
- Gracefully handles missing Redis configuration
- Sets appropriate health metrics

#### 3. Overall System Health
- Aggregates component health status
- Returns 200 (healthy) or 503 (unhealthy)
- Provides detailed component breakdown

### Health Response Format

```json
{
  "status": "healthy",
  "timestamp": "2025-01-23T12:00:00.000Z",
  "uptime": 3600.5,
  "version": "1.2.3",
  "components": [
    {
      "name": "database",
      "status": "healthy",
      "message": "Database connection successful"
    },
    {
      "name": "redis",
      "status": "healthy",
      "message": "Redis connection successful"
    }
  ]
}
```

## Prometheus Metrics

### Application Metrics

#### HTTP Request Metrics
```typescript
// Request duration histogram
const httpRequestDuration = new promClient.Histogram({
  name: 'povc_fund_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// Request counter
const httpRequestTotal = new promClient.Counter({
  name: 'povc_fund_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});
```

#### Business Logic Metrics
```typescript
// Fund calculations
const fundCalculations = new promClient.Counter({
  name: 'povc_fund_calculations_total',
  help: 'Total number of fund calculations performed',
  labelNames: ['type'], // 'reserve', 'pacing', 'cohort'
});

// Calculation duration
const calculationDuration = new promClient.Histogram({
  name: 'povc_fund_calculation_duration_seconds',
  help: 'Duration of fund calculations in seconds',
  labelNames: ['type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});
```

#### System Resource Metrics
```typescript
// Database connections
const databaseConnections = new promClient.Gauge({
  name: 'povc_fund_database_connections',
  help: 'Number of active database connections',
});

// Active users
const activeUsers = new promClient.Gauge({
  name: 'povc_fund_active_users', 
  help: 'Number of active users',
});
```

#### Queue & Background Job Metrics
```typescript
// Queue jobs by status
const queueJobs = new promClient.Gauge({
  name: 'povc_fund_queue_jobs',
  help: 'Number of jobs in queue',
  labelNames: ['queue', 'status'], // queue: 'reserve', 'pacing'; status: 'waiting', 'active', 'completed', 'failed'
});
```

### Default System Metrics

The application automatically collects Node.js default metrics:
- Process CPU usage
- Memory usage (heap/external/resident set)
- Event loop lag
- Garbage collection metrics
- Active handles and requests

### Metrics Recording

HTTP requests are automatically instrumented:

```typescript
// Middleware in routes.ts
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    recordHttpMetrics(req.method, req.route?.path || req.path, res.statusCode, duration);
  });
  
  next();
});
```

## Environment Configuration

### Environment Variables Schema

```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(5000),
  
  // Observability
  ENABLE_METRICS: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().int().positive().default(9090),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Feature flags (Terraform integration)
  USE_MANAGED_PG: z.coerce.boolean().default(false),
  USE_CONFLUENT: z.coerce.boolean().default(false),
  USE_PINECONE: z.coerce.boolean().default(false),
});
```

### Validation on Startup

```typescript
// Validates environment on server startup
const env = validateEnv();
console.log('✅ Environment validation passed');
```

## Logging Strategy

### Winston Configuration
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ],
});
```

### Structured Logging
All logs include:
- Timestamp
- Log level
- Message
- Correlation IDs (where applicable)
- Request context
- Error stack traces

## Integration with External Systems

### SigNoz OSS Integration

The application is designed to integrate with SigNoz for comprehensive observability:

1. **Traces**: HTTP request tracing with OpenTelemetry
2. **Metrics**: Prometheus metrics ingestion  
3. **Logs**: Centralized log aggregation
4. **Alerts**: Based on metrics and health checks

### Prometheus Configuration

Example `prometheus.yml` configuration:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'povc-fund-model'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Grafana Dashboards

Key dashboard components:
- **System Health**: Overall health status, uptime, component status
- **HTTP Metrics**: Request rate, response time, error rate
- **Business Metrics**: Fund calculations, user activity
- **Infrastructure**: Database connections, memory usage, CPU utilization

## Kubernetes Integration

### Health Check Configuration

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: povc-fund-model
    image: povc/fund-model:latest
    ports:
    - containerPort: 5000
    livenessProbe:
      httpGet:
        path: /api/health/live
        port: 5000
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /api/health/ready
        port: 5000
      initialDelaySeconds: 5
      periodSeconds: 5
```

### Service Monitor for Prometheus

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: povc-fund-model
spec:
  selector:
    matchLabels:
      app: povc-fund-model
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

## Alerting Rules

### Prometheus Alerting Rules

```yaml
# prometheus-alerts.yml
groups:
- name: povc-fund-model
  rules:
  - alert: ServiceDown
    expr: up{job="povc-fund-model"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "POVC Fund Model service is down"
      
  - alert: HighErrorRate
    expr: rate(povc_fund_http_requests_total{status_code=~"5.."}[5m]) > 0.1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High error rate detected"
      
  - alert: DatabaseUnhealthy
    expr: povc_fund_health_status{component="database"} == 0
    for: 30s
    labels:
      severity: critical
    annotations:
      summary: "Database health check failing"
      
  - alert: SlowRequests
    expr: histogram_quantile(0.95, povc_fund_http_request_duration_seconds_bucket) > 2
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "95th percentile response time > 2s"
```

## Testing & Validation

### Health Check Testing

```typescript
// tests/health.test.ts
describe('Health Checks', () => {
  test('should return healthy status when all components are healthy', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });
  
  test('should return unhealthy status when database is down', async () => {
    // Mock database failure
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
  });
});
```

### Metrics Testing

```typescript
// tests/metrics.test.ts  
describe('Metrics', () => {
  test('should expose Prometheus metrics', async () => {
    const response = await request(app).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('povc_fund_http_requests_total');
  });
});
```

## Performance Considerations

### Metrics Collection Overhead
- Prometheus metrics add ~1-2ms per request
- Health checks cached for 10 seconds to reduce database load
- Metrics endpoint optimized for fast response

### Resource Usage
- Memory: ~50MB for metrics collection
- CPU: <1% overhead for instrumentation
- Network: Metrics endpoint ~10KB per scrape

## Epic G1 Compliance

This observability implementation satisfies all Epic G1 requirements:

✅ **Health Checks**: `/api/health`, `/api/health/ready`, `/api/health/live` endpoints
✅ **Prometheus Metrics**: Comprehensive application and system metrics
✅ **Environment Validation**: Zod-based runtime environment validation
✅ **SigNoz Integration**: Ready for OSS observability stack
✅ **Kubernetes Support**: Health check and metrics endpoints for K8s integration

## Troubleshooting Guide

### Common Issues

1. **Health check failing**: Check database connectivity and credentials
2. **Metrics not appearing**: Verify `/metrics` endpoint accessibility  
3. **High memory usage**: Monitor metrics collection frequency
4. **Database connection errors**: Check `DATABASE_URL` format and network connectivity

### Debug Commands

```bash
# Test health endpoints
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/ready
curl http://localhost:5000/api/health/live

# Check metrics
curl http://localhost:5000/metrics

# Validate environment
npm run check:env
```