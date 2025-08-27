# Release Checklist

## Pre-Release Validation
- [ ] All tests passing in CI
- [ ] Security scan clean (Trivy)
- [ ] Performance benchmarks within tolerance
- [ ] Database migrations tested on staging
- [ ] Feature flags configured for rollout
- [ ] Monitoring dashboards updated
- [ ] Runbooks updated for new features

## Code Quality Gates
- [ ] TypeScript strict mode passing
- [ ] ESLint rules passing (including RLS enforcement)
- [ ] Test coverage > 80% for critical paths
- [ ] Bundle size within budget (< 500KB gzipped)
- [ ] No console.log statements in production code
- [ ] API contracts validated against OpenAPI spec

## Integration Testing
- [ ] End-to-end tests passing
- [ ] Reserve calculation regression tests passing
- [ ] Canary diff validation < 0.5% tolerance
- [ ] Load test completed (1000 concurrent users)
- [ ] Chaos engineering scenarios validated
- [ ] Rollback procedure tested

## Security Review
- [ ] No secrets in code or configs
- [ ] RLS policies enforced on all tables
- [ ] JWT validation working correctly
- [ ] Rate limiting configured
- [ ] CORS origins validated
- [ ] CSP headers configured

## Documentation
- [ ] CHANGELOG.md updated
- [ ] API documentation regenerated
- [ ] User-facing changes documented
- [ ] Migration guide written (if breaking changes)
- [ ] Support team briefed

## Final Go/No-Go Gates
- [ ] **Product Owner sign-off**: canary user feedback reviewed; acceptance criteria met
- [ ] **Engineering sign-off**: all technical gates passed; no critical issues
- [ ] **Security sign-off**: security scan clean; no new vulnerabilities
- [ ] **Support sign-off**: training complete; runbooks rehearsed; escalation matrix posted
- [ ] **Legal/Compliance sign-off**: data handling and logs for new flows reviewed
- [ ] **RTO/RPO committed**: on-call briefed on rollback & DR playbook

## Release Execution
- [ ] Tag release in git with semantic version
- [ ] Deploy to canary environment (5% traffic)
- [ ] Monitor metrics for 1 hour
- [ ] Gradual rollout: 5% → 25% → 50% → 100%
- [ ] Post-release smoke tests passing
- [ ] Announcement sent to stakeholders

## Post-Release
- [ ] Monitor error rates for 24 hours
- [ ] Collect user feedback
- [ ] Document any issues encountered
- [ ] Schedule retrospective
- [ ] Update roadmap with learnings

## Emergency Contacts
- **Release Manager**: [Name] - [Phone]
- **On-Call Engineer**: See PagerDuty
- **Product Owner**: [Name] - [Phone]
- **Support Lead**: [Name] - [Phone]

## Rollback Criteria
Immediate rollback if any of:
- Error rate > 1% for 5 minutes
- p99 latency > 5x baseline
- Data corruption detected
- Security vulnerability exploited
- Core functionality broken