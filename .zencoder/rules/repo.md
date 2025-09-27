---
description: Repository Information Overview
alwaysApply: true
---

# POVC Fund-Modeling Platform Information

## Summary
A sophisticated web-based venture-capital fund modeling and reporting platform built for Press On Ventures. It enables GPs to build, run, and compare "what-if" scenarios for portfolio construction, pacing, reserve allocation, and exit outcomes directly in the browser. The platform combines a TypeScript/Node API with a React frontend to support Monte Carlo simulations, strategic scenario planning, and interactive dashboards.

## Structure
- **client/**: React frontend application with components, hooks, and analytical engines
- **server/**: Node.js API with Express, routes, and middleware
- **shared/**: Common TypeScript types, schemas, and utilities
- **workers/**: Background job processing with BullMQ for calculations
- **tests/**: Comprehensive test suite (unit, integration, e2e, performance)
- **docker-compose.yml**: Development infrastructure setup

## Language & Runtime
**Language**: TypeScript
**Version**: ES2020 target
**Node.js**: v20.x
**Build System**: Vite
**Package Manager**: npm (v10.9.2+)

## Dependencies
**Main Dependencies**:
- React/Preact (switchable via build mode)
- Express.js for API
- Drizzle ORM for PostgreSQL
- TanStack Query for data fetching
- Radix UI components
- BullMQ + Redis for background jobs
- Zod for validation
- Nivo/Recharts for data visualization

**Development Dependencies**:
- Vitest for testing
- Playwright for E2E testing
- ESLint for code quality
- TypeScript with strict mode
- k6 for performance testing

## Build & Installation
```bash
# Install dependencies
npm install

# Development
npm run dev            # Full stack (client + API)
npm run dev:client     # Frontend only
npm run dev:api        # Backend only
npm run dev:parallel   # All services including workers

# Build
npm run build          # Production build
npm run check          # TypeScript type checking

# Testing
npm test               # Run test suite
npm run test:unit      # Unit tests only
npm run test:e2e       # End-to-end tests
```

## Docker
**Dockerfile**: Multi-stage build with deps, build, and runtime stages
**Base Image**: node:20-alpine
**Configuration**: Production-ready with security hardening
**Docker Compose**: PostgreSQL, Redis, and pgAdmin for development

## Testing
**Framework**: Vitest for unit/integration, Playwright for E2E
**Test Location**: tests/ directory with subdirectories for different test types
**Naming Convention**: *.test.ts, *.test.tsx, *.spec.ts
**Configuration**: vitest.config.ts, playwright.config.ts
**Run Command**:
```bash
npm test               # All tests
npm run test:unit      # Unit tests
npm run test:e2e       # E2E tests
npm run test:quick     # Fast tests (skips API)
```

## Database
**Type**: PostgreSQL 16
**ORM**: Drizzle
**Schema**: shared/schema.ts
**Migration**: drizzle-kit with SQL migrations
**Commands**:
```bash
npm run db:push        # Push schema to database
npm run db:studio      # Open Drizzle Studio
```

## Architecture
**Frontend**: React SPA with feature-based components, custom hooks, and analytical engines
**Backend**: Express.js API with modular routes and middleware
**Data Flow**: React → TanStack Query → Express API → PostgreSQL/Redis → Worker processes
**Workers**: Background job processing with BullMQ for calculations
**Observability**: Prometheus metrics, OpenTelemetry, Sentry