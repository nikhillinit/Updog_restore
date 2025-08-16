# GCP Setup Instructions

## Quick Setup (Copy & Paste Commands)

Replace `YOUR_PROJECT_ID` with your actual project ID in all commands below.

### 1. Install gcloud CLI (if not installed)
- Windows: Download from https://cloud.google.com/sdk/docs/install
- Mac: `brew install google-cloud-sdk`
- Linux: `curl https://sdk.cloud.google.com | bash`

### 2. Initialize and Set Project
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 3. Enable Required APIs
```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

### 4. Create Service Account
```bash
# Create the service account
gcloud iam service-accounts create github-deploy \
  --display-name="GitHub Deploy Service Account"

# Get the service account email (save this!)
gcloud iam service-accounts list --filter="displayName:GitHub Deploy"
```

Your `GCP_SERVICE_ACCOUNT` will be: `github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com`

### 5. Grant Permissions
```bash
# Cloud Run Admin
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Artifact Registry Writer
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Service Account User
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Secret Manager Access
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 6. Set up Workload Identity Federation
```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
echo "Project Number: $PROJECT_NUMBER"

# Create workload identity pool
gcloud iam workload-identity-pools create github-pool \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --description="Pool for GitHub Actions"

# Create GitHub provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Allow your GitHub repo to use the service account
gcloud iam service-accounts add-iam-policy-binding \
  github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/nikhillinit/Updog_restore"
```

### 7. Create Artifact Registry
```bash
gcloud artifacts repositories create fund-calc \
  --repository-format=docker \
  --location=us-central1 \
  --description="Fund calculation container images"
```

### 8. Create Secrets
```bash
# Create secrets in Secret Manager
echo -n "27f3efc05f8feda4da2eede2331e130b6c4bf804c0757aff872a7b4a8ae9ac88" | \
  gcloud secrets create metrics-key --data-file=-

echo -n "c56d0dca2d9147256da1b0f5c6a7235085789ba222f69a7b45cb47cfafc0658f" | \
  gcloud secrets create health-key --data-file=-
```

### 9. Get Your Configuration Values

Run these commands to get your exact values:

```bash
# Get all your values
echo "GCP_PROJECT: YOUR_PROJECT_ID"
echo "GCP_REGION: us-central1"
echo "GCP_SERVICE_NAME: fund-calc-staging"
echo "GCP_SERVICE_ACCOUNT: github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com"

# Get Workload Identity Provider (this is the important one!)
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
echo "GCP_WORKLOAD_IDENTITY_PROVIDER: projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
```

## Summary of GitHub Secrets

After running the above commands, your GitHub secrets should be:

```
GCP_PROJECT: YOUR_PROJECT_ID
GCP_WORKLOAD_IDENTITY_PROVIDER: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
GCP_SERVICE_ACCOUNT: github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com
GCP_REGION: us-central1
GCP_SERVICE_NAME: fund-calc-staging
STAGING_URL: (will be generated after first deployment)
STAGING_REDIS_URL: (optional - use memory:// for testing)
METRICS_KEY: 27f3efc05f8feda4da2eede2331e130b6c4bf804c0757aff872a7b4a8ae9ac88
HEALTH_KEY: c56d0dca2d9147256da1b0f5c6a7235085789ba222f69a7b45cb47cfafc0658f
```

## Alternative: Use Local Development Only

If you don't want to set up GCP right now, you can:
1. Use the memory mode locally: `REDIS_URL=memory:// npm run dev`
2. Test with local k6: `npm run test:baseline`
3. The PR will still provide value with the resilience improvements

## Need a Redis Instance?

For `STAGING_REDIS_URL`, you have options:
1. **GCP Memorystore**: Create via console.cloud.google.com → Memorystore → Redis
2. **Redis Cloud**: Free tier at https://redis.com/try-free/
3. **Upstash**: Serverless Redis at https://upstash.com/
4. **Memory Mode**: Use `REDIS_URL=memory://` for testing without Redis