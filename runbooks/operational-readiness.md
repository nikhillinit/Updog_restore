# Operational Readiness Runbook

## 1. System Overview
This runbook defines operational requirements and recovery objectives for the Fund Platform production environment.

## 2. Critical Services
- **API Server**: Stateless Express.js application
- **Worker Queues**: BullMQ job processors for async calculations
- **PostgreSQL**: Primary data store with RLS enforcement
- **Redis**: Cache layer and queue backend
- **Object Storage**: Document and report persistence

## 3. Monitoring & Alerting
- Prometheus metrics collection (`:3000/metrics`)
- Grafana dashboards for visualization
- PagerDuty integration for on-call rotation
- Slack alerts to `#platform-alerts` channel

## 4. Health Checks
- `/health` - Basic liveness check
- `/health/detailed` - Deep health with dependency checks
- `/readyz` - Readiness probe for load balancer

## 5. Performance Baselines
- API p99 latency: < 200ms
- Reserve calculation p99: < 5s
- Database connection pool: 20 connections
- Worker concurrency: 5 jobs per worker

## 6. Incident Response
- **Sev 1**: System down, data corruption → 15min response
- **Sev 2**: Degraded performance, partial outage → 30min response
- **Sev 3**: Non-critical bugs → next business day

## 6.5 Recovery Objectives (Business-approved)

| Subsystem         | RTO  | RPO  | Owner        | Notes                            |
|-------------------|------|------|--------------|----------------------------------|
| API (stateless)   | 30m  | 5m   | Platform     | Rollback via blue/green          |
| Workers (queues)  | 60m  | 5m   | Platform     | Safe reprocessing; idempotency   |
| PostgreSQL        | 60m  | 5m   | Data Eng     | PITR with WAL; cross-region snap |
| Redis             | 30m  | 0m   | Platform     | Ephemeral; reconstructable       |
| Object Storage    | 4h   | 1h   | Platform     | Versioned buckets                |

Validation: quarterly DR test proves meeting/beating above objectives.

## 7. Rollback Procedures
1. **API Rollback**: 
   - Revert container image tag in deployment
   - Run database rollback if schema changed
   - Clear Redis cache
   - Verify health checks pass

2. **Database Rollback**:
   - Stop write traffic
   - Run DOWN migrations in reverse order
   - Restore from PITR if needed
   - Validate data integrity

3. **Worker Rollback**:
   - Pause queue processing
   - Deploy previous worker version
   - Replay failed jobs with idempotency keys

## 8. Disaster Recovery
- **Data Loss**: Restore from PostgreSQL PITR within RPO
- **Region Failure**: Failover to DR region (60min RTO)
- **Corruption**: Restore from validated backups + audit log replay

## 9. Contacts
- **On-Call**: PagerDuty rotation `fund-platform`
- **Escalation**: Platform Lead → VP Engineering → CTO
- **External**: AWS Support (Business tier)

## 10. Validation
- [ ] All RTO/RPO objectives documented and approved
- [ ] Runbooks tested in staging environment
- [ ] Team trained on incident procedures
- [ ] DR drill scheduled quarterly