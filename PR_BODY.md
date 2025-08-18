# chore(rollout): merge-queue, OpenAPI diff, alerts, OTel sampling, k6, docs skeleton

This scaffolding sets up Week‑0 quality gates and observability:
- Merge Queue + required checks
- OpenAPI backward-compatibility gate
- Readiness + synthetics checks
- Prometheus alerts (breaker + error-budget)
- OTel Collector (tail sampling)
- k6 baseline/stress/soak
- Docs: perf baseline, rollout stages, compatibility matrix, runbooks

Follow-up: add secrets (`READINESS_URL`, `SYNTHETIC_URL`) and ensure `npm run generate-spec` exists.
