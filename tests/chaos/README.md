# Chaos Engineering Tests

Chaos testing validates system resilience under failure conditions using Toxiproxy to inject faults.

## Overview

These tests simulate various failure scenarios:
- Network latency (500ms+ delays)
- Connection failures
- Network partitions
- Packet loss
- Bandwidth limitations
- Service degradation

## Setup

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- Application running on port 5000

### Start Chaos Infrastructure
```bash
# Start Toxiproxy and services
docker-compose -f docker-compose.chaos.yml up -d

# Wait for services to be ready
docker-compose -f docker-compose.chaos.yml ps

# View Toxiproxy UI (optional)
open http://localhost:8474
```

## Running Tests

### All Chaos Tests
```bash
# Start infrastructure and run tests
npm run test:chaos

# Run specific test file
npm run test:chaos -- tests/chaos/postgres-latency.test.ts
```

### Individual Scenarios
```bash
# Test PostgreSQL latency
npm test -- --grep "500ms PostgreSQL latency"

# Test connection failures
npm test -- --grep "connection failures"

# Test network partitions
npm test -- --grep "network partition"
```

## Test Scenarios

### PostgreSQL Tests

#### 1. Latency Injection (500ms)
- Adds 500ms latency to all PG queries
- Verifies P95 remains < 2 seconds
- Confirms circuit breaker opens
- Validates error rate < 5%

#### 2. Connection Failures
- Disables PostgreSQL proxy
- Verifies circuit breaker opens quickly
- Tests recovery after re-enabling

#### 3. Network Partition
- Simulates complete network timeout
- Validates fast failure (< 3.5s)
- Tests timeout handling

#### 4. Gradual Degradation
- Progressively increases latency (0-2000ms)
- Measures response time impact
- Validates circuit breaker effectiveness

#### 5. Recovery Testing
- Starts with high latency
- Removes fault conditions
- Measures recovery time (< 15s)

### Redis Tests

#### 1. Cache Latency
- Adds 200ms Redis latency
- Verifies operations continue
- Tests graceful degradation

#### 2. Cache Unavailability
- Disables Redis completely
- Validates fallback behavior
- Tests memory store activation

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   App       │────▶│  Toxiproxy   │────▶│  PostgreSQL│
│  (Port 5000)│     │  (Port 5433) │     │ (Port 5432)│
└─────────────┘     └──────────────┘     └────────────┘
                           │
                    ┌──────▼──────┐
                    │  Toxiproxy  │
                    │     API     │
                    │ (Port 8474) │
                    └─────────────┘
```

## Toxiproxy Configuration

### Available Proxies
- `postgres-proxy`: PostgreSQL on port 5433
- `redis-proxy`: Redis on port 6380

### Fault Types
- **Latency**: Adds delay to responses
- **Timeout**: Causes connection timeouts  
- **Bandwidth**: Limits transfer speed
- **Packet Loss**: Drops packets randomly
- **Down**: Completely blocks connections

## Manual Testing

### Add Latency
```bash
# Add 500ms latency to PostgreSQL
curl -X POST http://localhost:8474/proxies/postgres-proxy/toxics \
  -H "Content-Type: application/json" \
  -d '{
    "type": "latency",
    "name": "pg_latency",
    "stream": "downstream",
    "toxicity": 1.0,
    "attributes": {
      "latency": 500,
      "jitter": 100
    }
  }'
```

### Simulate Partition
```bash
# Block PostgreSQL connections
curl -X POST http://localhost:8474/proxies/postgres-proxy \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Remove Faults
```bash
# Reset all toxics
curl -X POST http://localhost:8474/reset

# Remove specific toxic
curl -X DELETE http://localhost:8474/proxies/postgres-proxy/toxics/pg_latency
```

## Acceptance Criteria

✅ **Circuit Breaker Activation**
- Opens under sustained failures
- Provides fast failure responses
- Recovers after fault resolution

✅ **SLO Compliance**
- P95 latency < 2 seconds under 500ms PG latency
- Error rate < 5% during degradation
- Recovery time < 15 seconds

✅ **Graceful Degradation**
- Cached reads continue during PG issues
- Fallback to memory store without Redis
- No cascading failures

## Monitoring During Tests

### Application Metrics
```bash
# Check circuit breaker status
curl http://localhost:5000/api/circuit-breaker/status

# View health status
curl http://localhost:5000/health

# Check readiness
curl http://localhost:5000/ready
```

### Database Metrics
```bash
# PostgreSQL connections
docker exec -it postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Redis info
docker exec -it redis redis-cli INFO stats
```

## Troubleshooting

### Common Issues

1. **Toxiproxy not starting**
   ```bash
   # Check logs
   docker-compose -f docker-compose.chaos.yml logs toxiproxy
   
   # Restart services
   docker-compose -f docker-compose.chaos.yml restart
   ```

2. **Connection refused on port 5433**
   ```bash
   # Verify proxy is created
   curl http://localhost:8474/proxies
   
   # Recreate proxy
   curl -X POST http://localhost:8474/proxies \
     -d '{"name":"postgres-proxy","listen":"0.0.0.0:5433","upstream":"postgres:5432"}'
   ```

3. **Tests timing out**
   - Increase test timeout in test file
   - Check Docker resources (CPU/memory)
   - Verify services are healthy

### Cleanup
```bash
# Stop and remove all chaos containers
docker-compose -f docker-compose.chaos.yml down -v

# Remove test data
rm -rf postgres-chaos-data/
```

## Best Practices

1. **Isolation**: Run chaos tests separately from regular tests
2. **Monitoring**: Watch metrics during test execution
3. **Documentation**: Record observed behavior and thresholds
4. **Progressive**: Start with small faults, increase gradually
5. **Recovery**: Always test recovery after fault injection

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Start chaos infrastructure
  run: docker-compose -f docker-compose.chaos.yml up -d
  
- name: Wait for services
  run: sleep 10
  
- name: Run chaos tests
  run: npm run test:chaos
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5433/updog_test
    
- name: Cleanup
  if: always()
  run: docker-compose -f docker-compose.chaos.yml down -v
```

## Related Documentation
- [Circuit Breaker Configuration](../../server/infra/circuit-breaker/README.md)
- [Database Monitoring](../../docs/runbooks/database.md)
- [Rollback Procedures](../../docs/runbooks/rollback.md)