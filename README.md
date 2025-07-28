# POVC Fund-Modeling Platform

## Overview

This repository contains the POVC Fund-Modeling Platform, a sophisticated application designed for venture capital fund modeling, scenario simulation, and decision analysis.

**Key objectives:**

* Time-travel analytics with snapshot and rollback capabilities.
* Interactive Monte-Carlo risk engine for real-time exploration.
* Construction vs. Current variance tracking to surface strategy drift.

## Core Technology Stack

* **Backend:** Node.js, Fastify, NATS
* **Database:** PostgreSQL with Drizzle ORM
* **Simulation Engine:** Rust compiled to WASM
* **CI/CD:** GitHub Actions
* **Testing:** Playwright (E2E), k6 (Performance)
* **Observability:** SigNoz, Prometheus

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone <repository_url>
   cd povc-platform
   ```
2. **Install dependencies:**

   ```bash
   npm install
   ```
3. **Configure environment:**

   ```bash
   cp .env.example .env
   # Edit .env with your local configuration details
   ```
4. **Run database migrations:**

   ```bash
   npm run db:migrate
   ```
5. **Start the development server:**

   ```bash
   npm run dev
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

## Documentation

- [Schema Reference](docs/schema.md)
- [Observability Guide](docs/observability.md)

## Utilities

- [Async Iteration Utilities](docs/dev/async-iteration.md) - Production-ready replacements for problematic `forEach` patterns

## Known Issues

Several React component tests are failing due to missing React imports in `.test.tsx` files. Please see the relevant ticket for more details before running tests.

## Contributing

Please file PRs against the `develop` branch.
Ensure all CI checks, including performance logging and linting, pass before requesting a review.
