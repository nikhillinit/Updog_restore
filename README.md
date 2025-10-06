# POVC Fund-Modeling Platform

## Overview

This repository contains the POVC Fund-Modeling Platform, a sophisticated application designed for venture capital fund modeling, scenario simulation, and decision analysis.

**Key objectives:**

* Time-travel analytics with snapshot and rollback capabilities.
* Interactive Monte-Carlo risk engine for real-time exploration.
* Construction vs. Current variance tracking to surface strategy drift.

## Performance Status

[![Guardian](https://github.com/nikhillinit/Updog_restore/actions/workflows/guardian.yml/badge.svg)](https://github.com/nikhillinit/Updog_restore/actions/workflows/guardian.yml)
[![Async Migration](https://img.shields.io/badge/dynamic/json?url=https://gist.githubusercontent.com/raw/28e11ae43a0f276ed3f9e22c0202101e/progress.json&query=$.migration&label=async%20migration&color=blue)](./ASYNC_HARDENING_OPTIMIZATION_EVALUATION.md)
[![Performance Baseline](https://img.shields.io/badge/perf_baseline-automated-blue)](https://github.com/nikhillinit/Updog_restore/actions/workflows/perf-baseline.yml)
[![Benchmark Trend](https://img.shields.io/badge/benchmark_tracking-active-success)](https://github.com/nikhillinit/Updog_restore/tree/gh-pages/dev/bench)
[![ESLint Rules](https://img.shields.io/badge/eslint_async-enforced-orange)](./eslint-rules/no-async-array-methods.js)

### Performance Baselines
- **Fund Creation**: p95 < 500ms, p99 < 2s
- **API Response Times**: p95 < 200ms for reads, p95 < 500ms for writes
- **Availability SLO**: 99.9% uptime target
- **Idempotency**: Automatic duplicate request detection with 409 responses
- **Error Budget**: < 0.1% error rate over 30-day window

## Core Technology Stack

* **Backend:** Node.js, Fastify, NATS
* **Database:** PostgreSQL with Drizzle ORM
* **Simulation Engine:** Rust compiled to WASM
* **CI/CD:** GitHub Actions
* **Testing:** Playwright (E2E), k6 (Performance)
* **Observability:** SigNoz, Prometheus

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/nikhillinit/Updog_restore.git
cd Updog_restore
npm install

# 2. Database setup
npm run db:push        # Push schema to DB
npm run db:studio      # Optional: Browse data

# 3. Development
npm run dev            # Full stack (client + API)
npm run test           # Run test suite
```

**Single-command startup:**
```bash
./pilot.sh             # Zero-config development environment
```

## File Map - Key Components

```
server/
├── routes.ts          # API endpoints + new /healthz endpoint
├── health.ts          # Health check utilities
└── metrics.ts         # Prometheus metrics

client/src/
├── lib/fund-calc.ts   # Monte Carlo + IRR/MOIC calculations (NEW)
├── components/charts/ # Nivo chart components (async-hardened)
└── pages/fund-setup.tsx # Main fund configuration UI

scripts/
├── canary-check.sh    # Auto-promotion based on error rates
├── pilot.sh           # One-command dev environment
└── debug.sh           # Development debugging tools

tests/utils/
└── async-iteration.test.ts # 27 passing async hardening tests
```

## Usage

* **Run Monte-Carlo simulation:**

  ```bash
  npm run simulate
  ```
* **Check performance log:**

  ```bash
  cat perf-log.md
  ```

## Recent Updates (v1.2)

🚀 Automated Performance Logging is now integrated into our CI/CD pipeline. The `perf-log.md` file is automatically updated on every push to the main branch, removing the need for manual performance tracking.

* **Scripts:** `scripts/auto-perf-log.js` & `scripts/auto-perf-log.sh`
* **CI Workflow:** `.github/workflows/auto-perf-log.yml`
* **Documentation:** `docs/performance-logging-automation.md`

## Project Orchestration

This project follows the **Build → Measure → Analyze → Decide (BMAD)** workflow. The latest orchestration brief, including critical checkpoints and updated phases, can be found in `docs/bmad-brief.md`.

## Architecture Decisions

See [docs/adr/](docs/adr/) for architectural decision records covering:
- **Evaluator Metrics** (IRR/TVPI/MOIC) - How we measure AI agent quality with venture-specific KPIs ([detailed definitions](docs/metrics-meanings.md))
- **Token Budgeting** - Hard USD limits with graceful degradation for cost control
- **SSE Streaming** - Real-time progress updates for long-running operations

## Documentation

- [Schema Reference](docs/schema.md)
- [Observability Guide](docs/observability.md)
- [Metrics & Meanings](docs/metrics-meanings.md) - Fund performance metrics and AI evaluation KPIs

## Utilities

- [Async Iteration Utilities](docs/dev/async-iteration.md) - Production-ready replacements for problematic `forEach` patterns

## Known Issues

Several React component tests are failing due to missing React imports in `.test.tsx` files. Please see the relevant ticket for more details before running tests.

## Contributing

Please file PRs against the `develop` branch.
Ensure all CI checks, including performance logging and linting, pass before requesting a review.
