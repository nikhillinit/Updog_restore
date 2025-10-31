# Stage Normalization v3.4 — Solo‑Operator Plan (Final Review Draft)

**Purpose**  
Safely roll out Stage Normalization v3 across three API endpoints with strong technical guardrails, minimal ceremony, and solo‑operator execution.

**Scope & Assumptions**
- Internal‑only API for v3; validate via Consumer Audit before enforcement.
- Fail‑closed typed normalization at API boundaries.
- Observability = low‑cardinality Prometheus metrics + sampled structured logs for high‑cardinality offenders.
- Solo operator: no multi‑reviewer gates or broadcast comms; safety via automation + fast rollback.

## Week‑0 Pre‑Flight (Validation Before Build/Rollout)

**Consumer Audit (confirm internal‑only scope)**  
- Code grep for callers of `/api/monte-carlo/simulate`, `/api/portfolio/strategies`, `/api/funds/:id/companies`, `/api/deprecations`  
- Access‑log probe (7 days): IP frequency + UA fragments. If external consumers found → remain WARN longer and target them directly.

**Dependencies & Failure Modes**
- Redis reachable (staging/prod); TTL cache + 100 ms timeout + graceful fallback if not.
- Backups pass checksum **and** restore test (< 5 min) with smoke query.
- Test DB seeded (≥1k rows) for migration dry runs.

**Week‑0 Exit Criteria**
- [ ] 0 confirmed external consumers **or** mitigations documented.
- [ ] Redis GET p99 < 10 ms (staging); fallback verified.
- [ ] Backup restore test passes in < 5 min; checksum OK.
- [ ] Test DB has ≥1k rows; alias map reviewed.

## Timeline (≈3.5–4 weeks)

**Week 1 — Routes + Mode Store + Webhook + Micro‑Bench**
- Add boundary validators for 3 endpoints.
- Redis mode store with TTL cache & timeout; graceful fallback.
- Alertmanager webhook → auto‑downgrade to WARN (timingSafeEqual + replay guard).
- Micro‑bench only for validator path.

**Week 2 — Tests + Migration Hardening + Backup Validity**
- Unit/Integration (3 endpoints × 3 modes) + perf baseline in CI.
- Batched migration (5k rows, checkpoint/resume, dry‑run, backoff).
- Backup restore test to temp DB + smoke query.

**Week 3 — Observability & Docs**
- Prometheus alert rules; OpenAPI updates; ADR addendum.

**Week 4 — Controlled Rollout**
- Day 1–2: `off` to observe unknowns; collect ≥10k requests/endpoint.
- Day 3–5: `warn`, confirm unknowns < 0.5%.
- Day 5: backup → restore test → normalize → verify.
- Day 6: canary enforce 10% → 50% → 100% with auto‑downgrade on alert.

## Operational Safeguards (highlights)
- **Mode sync:** Redis with TTL cache + 100 ms timeout; fallback to cache/default; alerts on extended degradation.
- **Webhook security:** HMAC(sha256) constant‑time compare + 5‑minute replay guard.
- **Migration:** Batched with checkpoint/resume; per‑batch audit logs; dry‑run.
- **Backups:** Streaming checksum + restore test to temporary DB.
- **Alerts:** Auto‑downgrade enforce→warn in ~30 s; structured audit logs.
- **Logging:** Adaptive sampling — 100% if <10/min, else probabilistic (configurable).
- **SLO/SLI & Exit Criteria:** p99 validator < 1 ms, enforce‑error < 0.1%, unknown < 0.5%; Exit WARN after 7 consecutive days < 0.5% (cap 30 days).

## Canary & Rollback (summary)
- **Canary:** 10% (2 h) → 50% (4 h) → 100% if stable; any alert auto‑downgrades to WARN.
- **Rollback:** Canary fail → auto‑downgrade; inspect logs; extend WARN 7 days; adjust alias map; retry.  
  Migration fail → use checkpoint/resume; Backup fail → do not proceed; fix + retest.

## Success Metrics (“Done”)
- All tests green; validator micro‑bench within budget.
- Backup checksum + restore test OK (< 5 min).
- Redis mode store healthy (GET p99 < 10 ms).
- Alerts live; auto‑downgrade verified in staging.
- WARN exit criteria met; 100% enforce stable.

