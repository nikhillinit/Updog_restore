# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview  
This is a web-based venture-capital fund modeling and reporting platform built as an internal tool for Press On Ventures for GPs to build, run, and compare "what-if" scenarios for portfolio construction, pacing, reserve allocation, and exit outcomes—all without leaving their browser. Under the hood it combines a TypeScript/Node API (with Express, BullMQ + Redis workers, and PostgreSQL) and a React / Tailwind frontend (powered by shadcn/ui) to support Monte Carlo simulations, strategic scenario planning, and interactive dashboards. It evolved from an Excel-first proof of concept into a code-centric, modular architecture—so you get the rigor and repeatability of programmatic models, plus easy-to-extend engines for new calculations. This single file points you at the CHANGELOG for "what changed," DECISIONS for "why we chose it," and focused cheatsheets for testing, APIs, and UI conventions.

## Essential Commands

### Development
- `npm run dev` - Start full development environment (frontend + backend on port 5000)
- `npm run dev:client` - Frontend only (Vite dev server)
- `npm run dev:api` - Backend API only (Express with hot reload)
- `npm run build` - Production build (frontend + backend)
- `npm run check` - TypeScript type checking

### Testing & Quality
- `npm test` - Run test suite with Vitest
- `npm run test:ui` - Tests with interactive dashboard  
- `npm run test:run` - Single test run (CI mode)
- `npm run test:quick` - Skip API tests for faster feedback
- `npm run lint` - ESLint code quality check
- `npm run lint:fix` - Auto-fix linting issues

### Database
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio for database management

### AI Tools
- `npm run ai` - Gateway to AI agent operations
- `npm run ai:metrics` - Start observability metrics server

## Context for Claude  
- See: CHANGELOG.md  
- See: DECISIONS.md  
- See: cheatsheets/

### Memory Management
- **CLAUDE.md**: Core architecture & conventions only (see `cheatsheets/claude-md-guidelines.md`)
- **CHANGELOG.md**: All changes with timestamps
- **DECISIONS.md**: Architectural decisions and rationale
- **cheatsheets/**: Detailed guides and workflows
- **Commands**: `/log-change`, `/log-decision`, `/create-cheatsheet [topic]`

### Claude Code Development Commands
- `/test-smart` - Intelligent test selection based on file changes
- `/fix-auto` - Automated repair of lint, format, and simple test failures
- `/deploy-check` - Pre-deployment validation (build, bundle, smoke, idempotency)
- `/perf-guard` - Performance regression detection with bundle analysis
- `/dev-start` - Optimized development environment setup

## Architecture
- **Frontend (`/client`)**: React SPA with feature-based component organization, custom hooks, and analytical engines (ReserveEngine, PacingEngine, CohortEngine)
- **Backend (`/server`)**: Express.js API with Zod validation, modular routes, and storage abstraction layer
- **Shared (`/shared`)**: Common TypeScript types, Drizzle ORM schemas, and Zod validation schemas
- **Data Flow**: React → TanStack Query → Express API → PostgreSQL/Redis → Worker processes for background calculations
- **Workers**: Background job processing with BullMQ for reserve calculations, pacing analysis, and Monte Carlo simulations

### Key Directories
- `client/src/components/` - Reusable UI components (feature-organized)
- `client/src/core/` - Analytics engines (reserves, pacing, cohorts)
- `client/src/pages/` - Application routes and page components
- `server/routes/` - API endpoint definitions
- `tests/` - Comprehensive test suite (API, performance, UI)
- `packages/` - AI agent system for autonomous development

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui, TanStack Query, Recharts/Nivo, React Hook Form
- **Backend**: Node.js, Express.js, TypeScript, PostgreSQL, Drizzle ORM, BullMQ + Redis, Zod validation
- **Testing**: Vitest, React Testing Library
- **Infrastructure**: Docker Compose, Prometheus monitoring, Winston logging
- **Dev Tools**: ESLint, TypeScript strict mode, concurrent dev servers

## Coding Conventions
- **Components**: PascalCase files (`DashboardCard.tsx`), functional components with hooks
- **Files**: kebab-case for multi-word files (`fund-setup.tsx`)
- **Hooks**: `use` prefix (`useFundData`)
- **API**: RESTful endpoints, Zod validation, consistent error responses
- **Imports**: Path aliases (`@/` for client, `@shared/` for shared types)
- **Testing**: Tests alongside source files, comprehensive coverage with Vitest
- **Patterns**: Composition over inheritance, custom hooks for business logic, error boundaries

### Path Aliases (vite.config.ts)
- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `assets/`

## AI-Augmented Development
- **Gateway Scripts**: `scripts/ai-tools/` - Structured interfaces for AI agents (test runner, patch applicator)
- **Agent Framework**: `packages/agent-core/` - BaseAgent class with retry logic, metrics, and health monitoring
- **Test Repair Agent**: `packages/test-repair-agent/` - Autonomous test failure detection and repair
- **CLI Interface**: `npm run ai` - Gateway for AI agent operations (test, patch, repair, status, metrics)
- **Observability**: Complete monitoring stack with Prometheus, Grafana, and Slack alerts
- **Logging**: Structured JSON logging with metrics collection and health tracking
- **Architecture**: Self-healing development workflows with progressive autonomy and comprehensive monitoring

### Code Quality Integration
- **Codacy**: Automated code analysis with MCP server integration
- **Repository**: `nikhillinit/Updog_restore` on GitHub
- **Auto-analysis**: Runs on all file edits and dependency changes
- **Security**: Trivy scanning for vulnerabilities in dependencies
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory
- memory