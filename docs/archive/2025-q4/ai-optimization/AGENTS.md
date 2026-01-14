# AGENTS.md

This file provides context and instructions for AI coding agents working on this
project.

---

## 1. Project Overview

**Purpose**: Web-based venture capital fund modeling and reporting platform

**Business Domain**: Private equity / venture capital portfolio management

**Primary Goal**: Enable GPs to build, run, and compare "what-if" scenarios for
portfolio construction, pacing, reserve allocation, and exit outcomes

**Key Features**:

- Monte Carlo simulations for portfolio outcomes
- Strategic scenario planning with interactive dashboards
- Reserve allocation and pacing analysis engines

---

## 2. Technology Stack

**Languages**: TypeScript (strict mode with baseline system)

**Frontend**:

- React 18 + TypeScript
- Vite 5.4.20 (via Windows sidecar architecture)
- TanStack Query (server state)
- Zustand (client state)
- Shadcn/ui components
- Tailwind CSS

**Backend**:

- Node.js 20.19.x
- Express.js API
- PostgreSQL (Drizzle ORM)
- Redis (BullMQ workers)
- Zod validation

**Shared**:

- TypeScript types
- Zod schemas
- Database schema (Drizzle)

**Package Manager**: npm 10.9.0 (NOT yarn/pnpm)

**Platform**: Cross-platform (Windows/Linux/Mac with special Windows sidecar)

---

## 3. Architecture

**Type**: Monorepo (client/server/shared)

**Directory Structure**:

```
client/           # React SPA frontend
  src/
    components/   # Feature-based organization
    core/         # Analytical engines (reserves, pacing, cohorts)
    pages/        # Route components
    lib/          # Utilities and helpers
server/           # Express.js backend
  routes/         # API endpoints
  services/       # Business logic
  middleware/     # Express middleware
shared/           # Common TypeScript types and schemas
tests/            # Comprehensive test suite
tools_local/      # Windows sidecar workspace (DO NOT MODIFY)
```

**Module Organization**:

- Feature-based component structure
- Shared business logic in `core/` engines
- API routes mirror frontend feature structure

---

## 4. TypeScript Baseline System WARNING: CRITICAL

**Status**: 500 TypeScript errors baselined (gradual reduction in progress)

**Implementation**: Custom script (`scripts/typescript-baseline.cjs`)

- **DO NOT** use `tsc-baseline` npm package (incompatible with monorepo)
- Context-aware hashing (stable across line number changes)
- Per-project tracking (client: 53, server: 434, shared: 1 errors)

**Agent Workflow**:

### Before Making Changes

```bash
npm run baseline:check  # Verify no new errors
git status              # Check current branch
```

### After Making Changes

```bash
# If you FIXED errors:
npm run baseline:save
git add . .tsc-baseline.json
git commit -m "fix(types): <description>"

# If you INTRODUCED errors (discouraged, document why):
npm run baseline:save
git add . .tsc-baseline.json
git commit -m "feat: <feature> (baseline updated: <reason>)"
```

### Common Error Patterns

- **TS4111**: Use bracket notation `process.env['VAR']` not `process.env.VAR`
- **TS2532**: Use optional chaining `obj?.prop` or null checks
- **TS2322**: Check type definitions, may need type assertion or interface
  update

**Documentation**: See
[docs/TYPESCRIPT_BASELINE.md](docs/TYPESCRIPT_BASELINE.md) for complete guide

**DO NOT**:

- [ ] Introduce new TypeScript errors without updating baseline
- [ ] Modify `.tsc-baseline.json` manually
- [ ] Skip `baseline:save` after fixing errors
- [ ] Use `tsc-baseline` package

---

## 5. Windows Sidecar Architecture WARNING: IMPORTANT

**Problem**: Windows has module resolution issues with Vite and related plugins

**Solution**: Isolated sidecar workspace (`tools_local/`) with junction links

**Agent Instructions**:

**DO NOT**:

- [ ] Install Vite or plugins directly (`npm install vite`)
- [ ] Modify `tools_local/` directory
- [ ] Run commands from Git Bash on Windows

**DO**:

- [x] Use PowerShell or CMD on Windows
- [x] Run `npm run doctor` if module resolution fails
- [x] Use `npm run doctor:links` to verify junctions

**Recovery**:

```bash
npm run reset:local-tools  # Rebuild sidecar if broken
```

**Documentation**: See [SIDECAR_GUIDE.md](SIDECAR_GUIDE.md) for troubleshooting

---

## 6. Development Workflow

### Local Development

**Start dev environment**:

```bash
npm run dev           # Frontend + backend (port 5000)
npm run dev:client    # Frontend only (Vite dev server)
npm run dev:api       # Backend only (Express)
```

**Quality checks**:

```bash
npm run baseline:check  # TypeScript baseline (REQUIRED pre-push)
npm run lint            # ESLint
npm run test            # Test suite
npm run build           # Production build
```

### Testing

**Unit tests**: `npm test` (Vitest)

```bash
npm run test:unit       # All unit tests
npm run test:quick      # Skip API tests (faster)
npm run test:watch      # Watch mode
```

**E2E tests**: `npm run test:e2e` (Playwright) **Smart testing**:
`npm run test:smart` (Changed files only)

### CI/CD Process

**Git hooks** (Husky):

- **Pre-commit**: Lint-staged (formatting + linting, <5s)
- **Pre-push**: Baseline check + build + tests (30-40s)

**IMPORTANT**: Pre-push hook will FAIL if new TypeScript errors detected

---

## 7. Coding Conventions

### Naming

- **Components**: PascalCase files (`DashboardCard.tsx`)
- **Files**: kebab-case for multi-word (`fund-setup.tsx`)
- **Hooks**: `use` prefix (`useFundData`)
- **API**: RESTful endpoints, Zod validation

### Import Aliases

```typescript
import { Component } from '@/components/Component'; // client/src/
import { schema } from '@shared/schemas'; // shared/
import { asset } from '@assets/logo.png'; // assets/
```

### Waterfall Update Pattern WARNING: SPECIAL CASE

**All waterfall (carry distribution) updates MUST use centralized helper**:

**Location**: `client/src/lib/waterfall.ts`

**Usage**:

```typescript
import { applyWaterfallChange, changeWaterfallType } from '@/lib/waterfall';

// Field updates (type-safe with overloads)
const updated = applyWaterfallChange(waterfall, 'hurdle', 0.1);

// Type switching (AMERICAN ↔ EUROPEAN)
const european = changeWaterfallType(american, 'EUROPEAN');
```

**Features**:

- Type-safe discriminated union handling
- Schema-validated defaults via `WaterfallSchema.parse()`
- Value clamping (hurdle/catchUp to [0,1])
- Immutable updates (returns new object)

**See**: `client/src/lib/__tests__/waterfall.test.ts` (19 test cases)

### Patterns

- Composition over inheritance
- Custom hooks for business logic
- Error boundaries for React components
- Zod schemas for validation

---

## 8. Key Commands Reference

### Essential

```bash
npm run dev              # Start development servers
npm test                 # Run test suite
npm run build            # Production build
npm run baseline:check   # TypeScript baseline check (pre-push)
```

### TypeScript Baseline

```bash
npm run baseline:save     # Save/update baseline after fixing errors
npm run baseline:check    # Verify no new errors introduced
npm run baseline:progress # Show per-project progress metrics
npm run check             # Alias for baseline:check
```

### Health & Diagnostics

```bash
npm run doctor            # Complete health check
npm run doctor:quick      # Fast module resolution check
npm run doctor:links      # Verify Windows sidecar junctions
```

### Database

```bash
npm run db:push           # Push schema changes
npm run db:studio         # Open Drizzle Studio
```

---

## 9. Common Pitfalls & Solutions

### [ ] DO NOT Do This

1. **Install Vite directly**

   ```bash
   npm install vite  # WRONG - breaks Windows sidecar
   ```

2. **Skip baseline check after fixing TypeScript errors**

   ```bash
   # WRONG - baseline out of sync
   git commit -m "fix types"

   # CORRECT
   npm run baseline:save && git add .tsc-baseline.json && git commit
   ```

3. **Run from Git Bash on Windows**

   ```bash
   # WRONG - causes junction issues
   git-bash> npm install

   # CORRECT
   PowerShell> npm install
   ```

4. **Modify `.tsc-baseline.json` manually**
   - Always use `npm run baseline:save`

### [x] DO This

1. **Module resolution fails?**

   ```bash
   npm run doctor:links
   ```

2. **Fixed TypeScript errors?**

   ```bash
   npm run baseline:save
   git add .tsc-baseline.json
   ```

3. **Windows development?**
   - Use PowerShell or CMD (not Git Bash)
   - Run `npm run doctor` after fresh clone

---

## 10. Specific Instructions for AI Agents

### Contribution Guidelines

**When fixing TypeScript errors**:

1. Read [docs/TYPESCRIPT_BASELINE.md](docs/TYPESCRIPT_BASELINE.md) for context
2. Fix errors following common patterns (see section 4)
3. Run `npm run baseline:save` to update baseline
4. Commit code changes AND `.tsc-baseline.json` together
5. Document fixes in commit message

**When adding features**:

1. Check if new TypeScript errors are truly unavoidable
2. If unavoidable, document WHY in commit message
3. Update baseline with `npm run baseline:save`
4. Add tests for new functionality

**When refactoring**:

1. Prefer fixing TypeScript errors over introducing new ones
2. Use baseline system to track progress
3. Run `npm run baseline:progress` to show improvements

### Security

- Never commit `.env` files
- Use `process.env['VAR']` not `process.env.VAR` (TS4111 compliance)
- Validate all user input with Zod schemas
- See `server/lib/validation.ts` for patterns

### Dependencies

- Only add dependencies via `npm install <package>`
- Never install Vite-related packages directly (use sidecar)
- Update `package.json` and commit `package-lock.json`

### Commit Messages

**Format**: `<type>(<scope>): <description>`

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Examples**:

```
fix(types): Resolve TS2532 errors in path-utils

Updated baseline after adding null checks to 10 functions.
Baseline: 500 → 490 errors.
```

```
feat(reserves): Add deterministic PRNG to analytics engine

Minor baseline update due to new type definitions.
Baseline: 490 → 492 errors (documented in DECISIONS.md).
```

---

## 11. Emergency Contacts & Documentation

**For AI agents**: Start here first

- **This file** (`AGENTS.md`) - AI-specific instructions
- **TypeScript baseline**:
  [docs/TYPESCRIPT_BASELINE.md](docs/TYPESCRIPT_BASELINE.md)

**For detailed context**:

- **Project overview**: [CLAUDE.md](CLAUDE.md) (human-oriented)
- **Architecture decisions**: [DECISIONS.md](DECISIONS.md)
- **Change history**: [CHANGELOG.md](CHANGELOG.md)
- **Windows sidecar**: [SIDECAR_GUIDE.md](SIDECAR_GUIDE.md)

**For code patterns**:

- Waterfall updates: `client/src/lib/waterfall.ts`
- Validation: `server/lib/validation.ts`
- Type guards: `shared/type-guards.ts`

---

## 12. Current Status & Priorities

**TypeScript Baseline System**:

- [x] Implemented (PR #162)
- WARNING: Awaiting merge (CI infrastructure issues)
- Current: 500 errors (client: 53, server: 434, shared: 1)
- Goal: Zero errors within 6 months

**Immediate Priorities** (Post-merge):

1. Run TS4111 codemod (expected: 500 → 350 errors)
2. Fix pre-existing request-id test failures (4 tests)
3. Gradual baseline burn-down (opportunistic fixing)

**AI Agent Assistance Welcome**:

- TypeScript error fixing (following baseline workflow)
- Test writing for new features
- Refactoring with type safety improvements
- Documentation updates

---

_Last updated: 2025-10-31_ _Baseline version: 2.0.0 (context-aware hashing)_
_For questions about this file, see [CLAUDE.md](CLAUDE.md)_ _Note: TypeScript
baseline system operational, error count being actively reduced_
