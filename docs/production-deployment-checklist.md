---
status: ACTIVE
last_updated: 2026-01-19
---

# Production Deployment Checklist

## Pre-Deployment Verification

### Configuration
- [ ] Set `RUM_ORIGIN_ALLOWLIST` with production domains
- [ ] Set `RUM_SAMPLE_RATE` (recommended: 0.05 for high traffic)
- [ ] Set `VITE_SENTRY_DSN` for frontend monitoring
- [ ] Set `VITE_GIT_SHA` to current commit hash
- [ ] Set `VITE_SENTRY_TRACES_RATE` (recommended: 0.05)
- [ ] Set `VITE_SENTRY_ERROR_RATE` (recommended: 1.0)
- [ ] Verify JWT secrets and issuer configuration
- [ ] Configure `TRUST_PROXY` for your infrastructure
- [ ] Set production `DATABASE_URL` with connection pooling
- [ ] Configure Redis with persistence for production

### Security Verification
- [ ] ESLint RLS rule passing (no direct DB access)
- [ ] All routes protected by authentication middleware
- [ ] RLS policies applied to all tables
- [ ] Secrets rotated and stored in vault
- [ ] CORS origins restricted to production domains
- [ ] CSP headers configured for production
- [ ] Rate limiting configured on all endpoints
- [ ] Idempotency keys enabled for mutations

### Database Migrations
- [ ] Backup production database
- [ ] Test migrations on staging replica
- [ ] Verify rollback scripts ready
- [ ] Check for blocking migrations
- [ ] Plan maintenance window if needed
- [ ] Execute: `npm run db:migrate -- --production`
- [ ] Verify migration success
- [ ] Test key queries performance

### Performance Validation
- [ ] Lighthouse scores meet budgets:
  - [ ] Performance > 90
  - [ ] LCP < 2.5s
  - [ ] INP < 200ms
  - [ ] CLS < 0.1
- [ ] Bundle size < 500KB gzipped
- [ ] API p99 latency < 200ms
- [ ] Reserve calculation p99 < 5s

### Observability Setup
- [ ] Prometheus scraping `/metrics` endpoint
- [ ] Grafana dashboards imported
- [ ] Alert rules configured:
  - [ ] Error rate > 1%
  - [ ] p99 latency > 5x baseline
  - [ ] Memory > 90%
  - [ ] Canary health breaches
- [ ] Sentry projects created (frontend + backend)
- [ ] RUM metrics flowing to Prometheus
- [ ] Correlation IDs working end-to-end
- [ ] BMAD metrics collection configured

### Business Gates
- [ ] Product Owner sign-off received
- [ ] Support team trained on runbooks
- [ ] Security scan passed (Trivy)
- [ ] Legal/Compliance review completed
- [ ] RTO commitment: 30 minutes
- [ ] RPO commitment: 5 minutes
- [ ] Rollback procedure documented
- [ ] Communication plan ready

## Deployment Execution

### Stage 1: Internal Test (0.5% traffic)
- [ ] Deploy canary build
- [ ] Enable `internal_test` cohort flag
- [ ] Verify health checks passing
- [ ] Monitor metrics for 1 hour
- [ ] Check error rates < 0.1%
- [ ] Validate canary calculations < 0.5% diff
- [ ] Collect team feedback
- [ ] **Gate**: Proceed or rollback decision

### Stage 2: Friendly GP (5% traffic)
- [ ] Enable `friendly_gp` cohort flag
- [ ] Notify pilot partners
- [ ] Monitor for 24 hours:
  - [ ] Error rate < 0.5%
  - [ ] p75 latency < 110% baseline
  - [ ] Web Vitals within budget
- [ ] Run canary diff validation
- [ ] Collect user feedback
- [ ] **Gate**: Expand or hold decision

### Stage 3: Beta (25% traffic)
- [ ] Enable `beta` cohort flag
- [ ] Send beta announcement
- [ ] Monitor for 48-72 hours
- [ ] Daily health checks passing
- [ ] Feature adoption > 10%
- [ ] No Sev 1 bugs
- [ ] Support tickets normal volume
- [ ] **Gate**: GA decision

### Stage 4: General Availability (100%)
- [ ] Get final approvals:
  - [ ] Product Owner
  - [ ] Engineering Lead
  - [ ] Support Lead
- [ ] Enable GA (100% traffic)
- [ ] Send success announcement
- [ ] Continue monitoring for 24 hours
- [ ] Schedule retrospective

## Post-Deployment Verification

### Immediate (First Hour)
- [ ] All health checks green
- [ ] Error rate < 0.5%
- [ ] No memory leaks detected
- [ ] API response times normal
- [ ] Database connections stable
- [ ] Cache hit rates normal
- [ ] Worker queues processing

### First 24 Hours
- [ ] No Sev 1/2 incidents
- [ ] SLOs maintained:
  - [ ] Uptime > 99.9%
  - [ ] Error rate < 1%
  - [ ] p99 latency < 5x p50
- [ ] Web Vitals stable
- [ ] No security alerts
- [ ] User feedback positive
- [ ] Support tickets baseline

### First Week
- [ ] BMAD report shows positive ROI
- [ ] Feature adoption tracking
- [ ] Performance trends stable
- [ ] Cost within budget
- [ ] Security scan clean
- [ ] Retrospective completed
- [ ] Documentation updated

## Rollback Procedures

### Automatic Rollback Triggers
System automatically rolls back if:
- Error rate > 1% for 5 minutes
- p99 latency > 5x baseline for 10 minutes
- Memory usage > 90% sustained
- Database connections exhausted
- Canary health check fails

### Manual Rollback Steps
1. **Immediate Actions**
   ```bash
   # Stop traffic to new version
   npm run canary:halt
   
   # Revert deployment
   npm run deploy:rollback
   
   # Clear caches
   npm run cache:clear
   ```

2. **Database Rollback** (if migrations were run)
   ```bash
   # Stop write traffic
   npm run maintenance:on
   
   # Run rollback migrations
   npm run db:rollback --to=<previous_version>
   
   # Verify data integrity
   npm run db:verify
   
   # Resume traffic
   npm run maintenance:off
   ```

3. **Communication**
   - [ ] Update status page
   - [ ] Notify stakeholders via Slack
   - [ ] Send customer communication if impact > 15 minutes
   - [ ] Schedule post-mortem within 48 hours

## Emergency Contacts

| Role | Name | Contact | Escalation |
|------|------|---------|------------|
| On-Call Engineer | See PagerDuty | PagerDuty | Primary |
| Platform Lead | [Name] | [Phone/Slack] | Secondary |
| VP Engineering | [Name] | [Phone] | Sev 1 only |
| Product Owner | [Name] | [Slack] | User impact |
| Support Lead | [Name] | [Slack] | Customer comms |

## Quick Commands

```bash
# Check deployment status
npm run deploy:status

# View canary metrics
npm run canary:metrics

# Emergency rollback
npm run deploy:rollback --emergency

# Clear all caches
npm run cache:clear --all

# Run health checks
npm run health:check --detailed

# Generate deployment report
npm run deploy:report
```

## Success Criteria

Deployment is successful when:
- [ ] All stages completed without rollback
- [ ] SLOs maintained throughout
- [ ] No data loss or corruption
- [ ] User satisfaction maintained
- [ ] Support ticket volume normal
- [ ] Performance budgets met
- [ ] Security scans clean
- [ ] BMAD showing positive ROI

---

Last Updated: [Date]
Version: 2.0.0