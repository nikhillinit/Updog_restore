# Project Overview  
This is a web-based venture-capital fund modeling and reporting platform built as an internal tool for Press On Ventures for GPs to build, run, and compare "what-if" scenarios for portfolio construction, pacing, reserve allocation, and exit outcomes—all without leaving their browser. Under the hood it combines a TypeScript/Node API (with Express, BullMQ + Redis workers, and PostgreSQL) and a React / Tailwind frontend (powered by shadcn/ui) to support Monte Carlo simulations, strategic scenario planning, and interactive dashboards. It evolved from an Excel-first proof of concept into a code-centric, modular architecture—so you get the rigor and repeatability of programmatic models, plus easy-to-extend engines for new calculations. This single file points you at the CHANGELOG for "what changed," DECISIONS for "why we chose it," and focused cheatsheets for testing, APIs, and UI conventions.

## Context for Claude  
- See: CHANGELOG.md  
- See: DECISIONS.md  
- See: cheatsheets/

### Quick Start
Use `/init CLAUDE.md` to load this context file and get started with the codebase.

### Memory Management
- **CLAUDE.md**: Core architecture & conventions only (see `cheatsheets/claude-md-guidelines.md`)
- **CHANGELOG.md**: All changes with timestamps
- **DECISIONS.md**: Architectural decisions and rationale
- **cheatsheets/**: Detailed guides and workflows
- **Commands**: `/log-change`, `/log-decision`, `/create-cheatsheet [topic]`

## Architecture
- **Frontend (`/client`)**: React SPA with feature-based component organization, custom hooks, and analytical engines (ReserveEngine, PacingEngine, CohortEngine)
- **Backend (`/server`)**: Express.js API with Zod validation, modular routes, and storage abstraction layer
- **Shared (`/shared`)**: Common TypeScript types, Drizzle ORM schemas, and Zod validation schemas
- **Data Flow**: React → TanStack Query → Express API → PostgreSQL/Redis → Worker processes for background calculations
- **Workers**: Background job processing with BullMQ for reserve calculations, pacing analysis, and Monte Carlo simulations

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
- **Imports**: Path aliases (`@/`, `@shared/`)
- **Testing**: Tests alongside source files, comprehensive coverage
- **Patterns**: Composition over inheritance, custom hooks for business logic, error boundaries

## AI-Augmented Development
- **Gateway Scripts**: `scripts/ai-tools/` - Structured interfaces for AI agents (test runner, patch applicator)
- **Agent Framework**: `packages/agent-core/` - BaseAgent class with retry logic, metrics, and health monitoring
- **Test Repair Agent**: `packages/test-repair-agent/` - Autonomous test failure detection and repair
- **CLI Interface**: `npm run ai` - Gateway for AI agent operations (test, patch, repair, status, metrics)
- **Observability**: Complete monitoring stack with Prometheus, Grafana, and Slack alerts
- **Logging**: Structured JSON logging with metrics collection and health tracking
- **Architecture**: Self-healing development workflows with progressive autonomy and comprehensive monitoring