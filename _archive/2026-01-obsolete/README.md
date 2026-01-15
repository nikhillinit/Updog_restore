# Archive: 2026-01 Obsolete Files

**Date Archived:** 2026-01-14 **Reason:** Codebase cleanup - removed obsolete
configurations and superseded infrastructure

## Contents

### CI Workflows (`ci-workflows/`)

**Files:**

- `ci.yml.disabled` (4.2 KB)
- `ci-gate-optimized.yml.disabled` (7.8 KB)

**Reason for Archival:**

- Both workflows have `.disabled` suffix indicating they were intentionally
  deactivated
- Superseded by active CI/CD workflows in `.github/workflows/`
- Old pipeline infrastructure no longer in use

### Deployment Configuration (`deployment/`)

**Files:**

- `replit-deployment.config.js` (1.2 KB)

**Reason for Archival:**

- Project no longer targets Replit platform
- Current deployment strategy uses Vercel/cloud infrastructure
- Configuration is platform-specific and no longer applicable

### Claude Backup (`claude-backup/`)

**Files:**

- `.claude.bak.20250812_212600/` (directory)

**Reason for Archival:**

- Stale backup from August 2025 (5+ months old)
- Single settings file backup
- No longer referenced in current workflows

### ML Service (`ml-service/`)

**Files:**

- `app.py` (14.8 KB) - FastAPI ML prediction service
- `Dockerfile` (776 bytes) - Python 3.11-slim container
- `docker-compose.yml` (626 bytes) - Service definition
- `requirements.txt` (134 bytes) - Python dependencies
- `RESTORATION_GUIDE.md` (9.4 KB) - Complete restoration instructions

**Reason for Archival:**

- ML service is scaffolding for future ML-enhanced reserve predictions
- **NOT currently deployed or used in production**
- Integration code exists (`server/core/reserves/mlClient.ts`, `adapter.ts`) but
  dormant
- Only `scripts/backtest.ts` (research script) uses ML infrastructure
- No production code instantiates ML client or adapter
- No environment variables configured (ML_RESERVE_URL, ML_TIMEOUT_MS)
- Not integrated into docker-compose.yml or npm scripts

**Technical Details:**

- Python 3.11-slim, FastAPI 0.115.0, scikit-learn 1.4.2
- Gradient Boosting Regressor for reserve predictions
- Endpoints: /health, /train, /predict, /model/info
- Port 8088, 1.0 CPU / 512MB memory limits
- Explainable AI (SHAP, feature importance)

**Restoration Complexity:** **LOW** (1-2 hours)

- Zero breaking changes - type imports only
- Clean architectural separation
- Comprehensive restoration guide included
- See `RESTORATION_GUIDE.md` for step-by-step instructions

### Local Observability Stack (`monitoring/`, `observability/`, `docker-compose.observability.yml`)

**Files:**

- `monitoring/` - Prometheus, Grafana, AlertManager configurations
  - `alert-rules.yml`, `alertmanager.yml`, `prometheus.yml`
  - `grafana/lp-dashboard.json`, `grafana-dashboards/fund-operations.json`
  - `alerts/rum-alerts.yml`, `lp-alerts.yml`, `prometheus-rules.yaml`
- `observability/` - AI agent observability stack
  - `README.md` - Observability stack documentation
  - `alertmanager/alertmanager.yml`
  - `grafana/dashboards/agent-dashboard.json`
  - `prometheus/alerts.yml`, `prometheus/prometheus.yml`
  - `prometheus/rules/stage-validation.yml`
- `docker-compose.observability.yml` - Docker Compose for local monitoring stack

**Reason for Archival:**

- Project moved to cloud-native development (Neon + Upstash + memory://)
- Local Docker infrastructure no longer needed for daily development
- Production monitoring code preserved in `server/observability/*` (NOT
  archived)
- Observability stack was for local AI agent metrics, now using cloud solutions
- References updated in 3 files: `docs/INFRASTRUCTURE_REMEDIATION.md`,
  `observability/README.md`, `scripts/ai-tools/index.js`

**Restoration Complexity:** **MEDIUM** (2-4 hours)

- Requires Docker Compose installed locally
- Need to configure Prometheus scrape targets
- Need to set up Grafana data sources and dashboards
- May require adjusting ports if conflicts exist
- See `docker-compose.observability.yml` for service definitions

**When to Restore:**

- If returning to local Docker-based development
- If needing local Prometheus/Grafana stack for debugging
- If implementing new AI agent metrics requiring local testing

**Production Status:**

- `server/observability/*` remains in codebase (production metrics endpoints)
- Cloud monitoring via Vercel, Neon, and Upstash dashboards
- Sentry for error tracking (when enabled)

## Restoration

If any of these files need to be restored:

```bash
# Restore CI workflows
cp _archive/2026-01-obsolete/ci-workflows/*.disabled .github/workflows/

# Restore Replit config
cp _archive/2026-01-obsolete/deployment/replit-deployment.config.js .

# Restore Claude backup
cp -r _archive/2026-01-obsolete/claude-backup/.claude.bak.20250812_212600 .

# Restore ML service (see RESTORATION_GUIDE.md for full instructions)
cp -r _archive/2026-01-obsolete/ml-service ./
# Then follow ml-service/RESTORATION_GUIDE.md for integration steps

# Restore observability stack
cp -r _archive/2026-01-obsolete/monitoring _archive/2026-01-obsolete/observability ./
cp _archive/2026-01-obsolete/docker-compose.observability.yml ./
# Start stack: docker-compose -f docker-compose.observability.yml up -d
```

## Related Investigation

**Items requiring verification before archival:**

- `playwright.config.simple.ts` - Variant E2E config (verify usage)
- `vitest.minimal.config.ts` - Minimal test runner variant (verify usage)
- `vitest.time-travel.config.ts` - Database debugging config (verify usage)

## Active Infrastructure (NOT Archived)

**Promptfoo:** ACTIVE - 10 YAML validation configs, custom domain scorers,
documented workflows **Docker:** ACTIVE - 5 docker-compose files, 4 Dockerfiles,
npm scripts for dev/chaos/observability **Vitest:** ACTIVE - Main test framework
with base, integration, and quarantine configs **Playwright:** ACTIVE - E2E
testing framework with main config **TypeScript:** ACTIVE - Comprehensive
tsconfig setup for client/server/shared **ESLint:** ACTIVE - Code quality and
security linting
