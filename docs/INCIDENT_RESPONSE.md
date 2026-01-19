---
status: ACTIVE
last_updated: 2026-01-19
---

# Incident Response Runbook - Reserves v1.1

## Quick Reference

**Kill Switch**: `killSwitch('reserves_v11')`  
**Status Page**: https://status.example.com  
**Metrics Dashboard**: https://metrics.example.com/reserves  
**On-Call**: See PagerDuty  

## Incident Severity Levels

### SEV-1 (Critical)
- Complete reserves calculation failure affecting all users
- Data corruption or incorrect financial calculations
- Security breach involving financial data

### SEV-2 (High)
- Reserves calculation failing for > 10% of users
- Performance degradation > 5x normal
- Conservation invariant violations

### SEV-3 (Medium)
- Intermittent failures < 10% of users
- Performance degradation 2-5x normal
- UI/UX issues with reserves display

### SEV-4 (Low)
- Minor UI glitches
- Performance slightly above target
- Non-critical warnings in logs

## Initial Response (First 5 Minutes)

### 1. Assess Impact
```bash
# Check current error rate
curl https://api.example.com/api/metrics/reserves/errors

# Check current latency
curl https://api.example.com/api/metrics/reserves/latency

# Check affected users
curl https://api.example.com/api/metrics/reserves/users
```

### 2. Immediate Mitigation

**For calculation errors:**
```javascript
// Browser console or admin panel
killSwitch('reserves_v11');
setFlag('ts_reserves', false);
setFlag('wasm_reserves', false);
```

**For performance issues:**
```javascript
// Reduce load by disabling shadow compare
setFlag('shadow_compare', false);
```

**For UI issues:**
```javascript
// Force legacy UI
setFlag('reserves_ui_v11', false);
```

### 3. Notify Stakeholders

**Template:**
```
INCIDENT: Reserves Calculation Issue
Severity: [SEV-X]
Impact: [X]% of users affected
Status: Investigating | Mitigating | Resolved
Action: Feature disabled, investigating root cause
ETA: [Time] for update
```

## Diagnosis Steps

### Check Logs
```bash
# Application logs
tail -f /var/log/app/reserves.log | grep -E "ERROR|WARN"

# Audit logs
tail -f /var/log/app/audit.log | grep reserves

# Performance logs
tail -f /var/log/app/perf.log | grep reserves
```

### Check Metrics
```sql
-- Recent error spike
SELECT 
  date_trunc('minute', created_at) as minute,
  COUNT(*) as errors,
  error_type
FROM reserves_errors
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY 1, 3
ORDER BY 1 DESC;

-- Performance degradation
SELECT 
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99,
  AVG(duration_ms) as avg
FROM reserves_metrics
WHERE created_at > NOW() - INTERVAL '1 hour';
```

### Common Issues & Solutions

#### Issue: Conservation Violation
**Symptoms**: Warnings about allocated + remaining ≠ available  
**Check**:
```javascript
// In browser console
const result = await calculateReserves(testCompanies, 0.15, true);
console.log('Conservation:', result.data.metadata.conservation_check);
```
**Fix**: Enable normalization in calculation engine

#### Issue: Memory Leak in Worker
**Symptoms**: Gradually increasing memory usage, eventual crash  
**Check**:
```bash
ps aux | grep worker
```
**Fix**: Restart workers, implement worker recycling

#### Issue: WASM Module Load Failure
**Symptoms**: Fallback to TS engine, performance degradation  
**Check**:
```javascript
// Browser console
console.log(window.wasmModule);
```
**Fix**: Clear CDN cache, verify WASM file integrity

## Recovery Procedures

### After Error Rate Spike

1. **Verify Fix**
   ```bash
   # Run test calculation
   curl -X POST https://api.example.com/api/reserves/calculate \
     -H "Content-Type: application/json" \
     -d @test-payload.json
   ```

2. **Gradual Re-enable**
   ```javascript
   // Start with 1% of users
   setFlag('reserves_v11', true, { rolloutPercent: 1 });
   
   // Monitor for 15 minutes, then increase
   setFlag('reserves_v11', true, { rolloutPercent: 10 });
   ```

3. **Full Re-enable**
   ```javascript
   // After successful monitoring
   setFlag('reserves_v11', true, { rolloutPercent: 100 });
   ```

### After Performance Degradation

1. **Clear Caches**
   ```bash
   redis-cli FLUSHDB
   ```

2. **Restart Services**
   ```bash
   systemctl restart app-server
   systemctl restart worker-pool
   ```

3. **Verify Performance**
   ```bash
   npm run test:perf
   ```

## Monitoring Post-Incident

### Key Metrics (First 24 Hours)

- Error rate: Must stay < 0.01%
- P95 latency: Must stay < 300ms
- Conservation violations: Must be 0
- User complaints: Monitor support channels

### Automated Alerts

```yaml
# Alert configuration
- name: reserves_error_rate_high
  expr: rate(reserves_errors[5m]) > 0.001
  severity: warning
  
- name: reserves_latency_high
  expr: reserves_p95_latency > 300
  severity: warning
  
- name: reserves_conservation_violation
  expr: reserves_conservation_failures > 0
  severity: critical
```

## Post-Incident Process

### Immediate (Within 2 Hours)
- [ ] Create incident ticket
- [ ] Document timeline
- [ ] Capture logs and metrics
- [ ] Notify affected users

### Short-term (Within 24 Hours)
- [ ] Root cause analysis meeting
- [ ] Create fix PR
- [ ] Update monitoring
- [ ] Test fix in staging

### Long-term (Within 1 Week)
- [ ] Post-mortem document
- [ ] Update runbooks
- [ ] Implement prevention measures
- [ ] Share learnings with team

## Contact Information

### Engineering Team
- **Primary On-Call**: Check PagerDuty
- **Reserves Team Lead**: [Name] - [Phone]
- **Platform Team**: [Team Email]

### Business Stakeholders
- **Product Owner**: [Name] - [Email]
- **Customer Success**: [Team Email]
- **Legal/Compliance**: [Contact] (for financial calculation errors)

## Appendix

### Test Payloads

**Minimal Test**:
```json
{
  "input": {
    "companies": [
      {
        "id": "test-1",
        "name": "Test Co",
        "invested_cents": 1000000,
        "exit_moic_bps": 30000
      }
    ],
    "fund_size_cents": 10000000,
    "quarter_index": 8098
  },
  "config": {
    "reserve_bps": 1500,
    "remain_passes": 0,
    "cap_policy": {
      "kind": "fixed_percent",
      "default_percent": 0.5
    },
    "audit_level": "basic"
  }
}
```

### Useful Commands

```bash
# Check feature flag status
curl https://api.example.com/api/features/reserves_v11

# Force recalculation
curl -X POST https://api.example.com/api/reserves/recalculate

# Export audit log
curl https://api.example.com/api/reserves/audit > audit.json

# Health check
curl https://api.example.com/api/reserves/health
```