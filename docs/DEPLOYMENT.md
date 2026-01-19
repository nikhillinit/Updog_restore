---
status: ACTIVE
last_updated: 2026-01-19
---

# Deployment Guide

## Prerequisites

### 1. Local Validation
Before any deployment, run the validation script:
```bash
./scripts/validate-local.sh
```

All checks must pass before proceeding.

### 2. GitHub Secrets Configuration

Configure the following secrets in your GitHub repository (Settings → Secrets → Actions):

#### GCP Authentication
- `GCP_PROJECT`: Your Google Cloud project ID (e.g., `my-project-123`)
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: Workload Identity Federation provider
  - Format: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_NAME/providers/PROVIDER_NAME`
- `GCP_SERVICE_ACCOUNT`: Service account email for deployment
  - Format: `deploy-sa@PROJECT_ID.iam.gserviceaccount.com`
- `GCP_REGION`: Deployment region (e.g., `us-central1`)
- `GCP_SERVICE_NAME`: Cloud Run service name (e.g., `fund-calc-staging`)

#### Environment URLs
- `STAGING_URL`: Full staging URL (e.g., `https://fund-calc-staging-abc123.run.app`)
- `STAGING_REDIS_URL`: Redis connection string
  - Format: `rediss://username:password@redis-host:6379`

#### Security Keys
- `METRICS_KEY`: Bearer token for /metrics endpoint (generate with `openssl rand -hex 32`)
- `HEALTH_KEY`: Token for detailed health checks (generate with `openssl rand -hex 32`)

### 3. GCP Setup

#### Enable Required APIs
```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  redis.googleapis.com
```

#### Create Artifact Registry
```bash
gcloud artifacts repositories create fund-calc \
  --repository-format=docker \
  --location=us-central1 \
  --description="Fund calculation container images"
```

#### Create Secrets in Secret Manager
```bash
# Metrics key
echo -n "your-metrics-key" | gcloud secrets create metrics-key \
  --data-file=- \
  --replication-policy="automatic"

# Health key  
echo -n "your-health-key" | gcloud secrets create health-key \
  --data-file=- \
  --replication-policy="automatic"

# Redis password
echo -n "your-redis-password" | gcloud secrets create redis-password \
  --data-file=- \
  --replication-policy="automatic"
```

#### Set up Workload Identity Federation
```bash
# Create workload identity pool
gcloud iam workload-identity-pools create github-pool \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository"

# Grant permissions to service account
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:deploy-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:deploy-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

## Deployment Process

### Stage 1: Local Testing
```bash
# 1. Run validation
./scripts/validate-local.sh

# 2. Run baseline load test locally
npm run test:baseline

# 3. Test chaos scenarios
npm run chaos:start
npm run test:chaos
# In another terminal:
npm run chaos:break
# Wait 30s, then:
npm run chaos:heal
npm run chaos:stop
```

### Stage 2: Create PR
```bash
# 1. Ensure all changes are committed
git status

# 2. Push branch
git push origin chore/prod-readiness-fixes

# 3. Create PR via GitHub CLI
gh pr create --title "Production readiness improvements" \
  --body "Implements circuit breaker, metrics, monitoring, and chaos testing"
```

### Stage 3: Staging Deployment
After PR approval and merge:

1. **Automatic deployment** triggers via GitHub Actions
2. **Monitor deployment**:
   ```bash
   gh run watch
   ```

3. **Validate staging**:
   ```bash
   export BASE_URL=https://your-staging-url
   export METRICS_KEY=your-metrics-key
   export HEALTH_KEY=your-health-key
   
   # Smoke test
   ./scripts/smoke.sh
   
   # Load test
   k6 run -e BASE_URL=$BASE_URL -e METRICS_KEY=$METRICS_KEY \
     -e RATE=5 -e DURATION=2m tests/k6/k6-baseline.js
   ```

### Stage 4: Production Deployment

#### Pre-flight Checks
- [ ] Staging smoke tests pass
- [ ] Baseline load test meets SLOs
- [ ] Chaos testing validates circuit breaker
- [ ] Metrics endpoint accessible
- [ ] Health checks return 200
- [ ] No errors in logs

#### Deploy Command
```bash
# Tag for production
git tag -a v1.4.0 -m "Production ready with resilience features"
git push origin v1.4.0

# Trigger production deployment (if configured)
gh workflow run deploy-production.yml
```

## Monitoring Post-Deployment

### 1. Health Checks
```bash
# Liveness
curl -f $PROD_URL/healthz

# Readiness (detailed)
curl -f -H "X-Health-Key: $HEALTH_KEY" $PROD_URL/readyz
```

### 2. Metrics Validation
```bash
curl -H "Authorization: Bearer $METRICS_KEY" $PROD_URL/metrics | grep -E "(http_requests_total|redis_up|circuit_breaker_state)"
```

### 3. Performance Baseline
```bash
k6 run -e BASE_URL=$PROD_URL -e RATE=2 -e DURATION=5m tests/k6/k6-baseline.js
```

## Rollback Procedure

If issues occur:

1. **Immediate rollback**:
   ```bash
   gcloud run services update-traffic fund-calc \
     --to-revisions=PREVIOUS_REVISION=100 \
     --region=us-central1
   ```

2. **Verify rollback**:
   ```bash
   ./scripts/smoke.sh
   ```

3. **Investigate issues**:
   ```bash
   # Check logs
   gcloud logging read "resource.type=cloud_run_revision" --limit=50
   
   # Check metrics
   curl -H "Authorization: Bearer $METRICS_KEY" $PROD_URL/metrics
   ```

## Troubleshooting

### Common Issues

#### Circuit Breaker Not Opening
- Check `REDIS_URL` environment variable
- Verify Redis connectivity: `npm run debug:redis`
- Check circuit breaker configuration in `server/providers.ts`

#### High Error Rate
- Review recent deployments
- Check Redis connection pool settings
- Verify rate limiting configuration

#### Deployment Fails
- Check GitHub Actions logs: `gh run list --workflow=deploy-staging.yml`
- Verify all secrets are configured
- Ensure GCP permissions are correct

### Support Channels
- GitHub Issues: Report bugs or feature requests
- Slack: #fund-calc-support
- On-call: Check PagerDuty schedule