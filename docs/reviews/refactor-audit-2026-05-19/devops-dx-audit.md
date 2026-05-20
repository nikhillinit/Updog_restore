---
status: REFERENCE
last_updated: 2026-05-20
owner: Core Team
categories: [reviews, refactor, devops, developer-experience]
keywords: [devops, dx, scripts, workflows, tooling]
source_of_truth: false
related:
  - docs/governance/2026-05-19-refactor-roadmap.md
---

# Updog_restore Repository - DevOps & Developer Experience Audit Report

> Reference status: this raw audit is supporting evidence. Use
> `docs/governance/2026-05-19-refactor-roadmap.md` for the canonical execution
> order.

> **Audit Date**: 2026-03-28 **Verification Update**: 2026-05-19 **Repository**:
> `/mnt/agents/Updog_restore` **Project Type**: Full-Stack POVC Fund-Modeling
> Platform (Monorepo) **Total Files**: 5,577

---

## Executive Summary

The repository exhibits **severe Developer Experience (DX) degradation** caused
by extreme script proliferation, fragmented CI/CD pipelines, excessive
environment configuration files, and overwhelming tooling sprawl. The 2026-05-19
verification pass shows the current operational baseline as 86 package.json
scripts (many using non-standard naming), 385 files in the `scripts/` directory,
16 CI workflow files, 14 root `.env*` files, 5 docker-compose variants, and a
still-large root configuration surface. A new developer faces an **extremely
steep onboarding cliff**.

**Top-line metrics:**

- 86 npm scripts (first cleanup target: <=50 active scripts)
- 385 total script files (295 at root level)
- 16 CI workflow files
- 14 root .env\* files; no committed `.env.test`, ignored `.env.test.local`
  exists
- 41 root configuration files
- 4 Dockerfiles + 5 docker-compose files
- 4 Husky git hooks
- 2 custom ESLint plugins
- 14 script subdirectories

---

## 2026-05-19 Execution Corrections

- Keep `.husky/pre-push` and `scripts/pre-push.mjs` until a direct hook command
  or `validate:quick` equivalent exists and is verified. Delete
  `scripts/pre-push.mjs` last.
- Do not add `.env.test` just to satisfy the audit. Add it only if test
  bootstrap or CI actually loads it, with safe deterministic values.
- Use `vitest.config.mjs` as the current unit-test entry until `test:unit` is
  migrated. Do not delete it as a first config cleanup.
- Prefer deleting obsolete scripts after reference scans over moving them into a
  committed `scripts/archive/` folder.
- Stabilize local canonical commands before simplifying CI, so GitHub Actions
  call the same commands a solo developer runs locally.

### 2026-05-19 Local Gate Addendum

The branch-local route-refactor safety slice validates the current command
picture in `C:\dev\Updog_restore\.worktrees\refactor-plan-execution`:

- `npm run lint` completed successfully, including ESLint and guardrail
  ratchets.
- `npm run check` completed with 0 TypeScript baseline/current/new errors.
- `npm test -- --project=server` completed successfully for the server-side gate
  relevant to the route work.
- Plain `npm test` still exposed unrelated full-suite timeout flake behavior.
  The latest timeout files passed when rerun directly, so full-suite
  concurrency/scheduling debt remains a DX issue to track separately from the
  route-refactor changes.

## Severity Legend

- **P0 (Critical)**: Blocks onboarding, causes frequent developer friction, or
  risks production stability
- **P1 (High)**: Significantly slows development, causes confusion, or
  duplicates effort
- **P2 (Medium)**: Inconsistent patterns, minor friction, or cleanup needed
- **P3 (Low)**: Nice-to-have improvements

---

## Top 20 Issues by Severity & Category

---

### P0 — Critical Issues

---

#### Issue #1: Script Bloat — 86 npm Scripts with "Wave/Phase/Guard" Taxonomy

**Severity**: P0 | **Category**: Scripts

**Problem**: The `package.json` currently contains 86 scripts, organized around
a custom "wave/phase/guard" taxonomy that is non-idiomatic and imposes
substantial cognitive load.

**Evidence**:

- `package.json`: 86 scripts as of 2026-05-19 verification
- Scripts named `test:wave1b`, `test:wave1b:runtime`, `test:wave2`,
  `test:wave3`, `test:wave4`, `test:wave5:root`, `test:wave5:integration`,
  `test:wave6:ops`, `test:wave6:client-workers`, `test:wave6:dev-runtime`,
  `test:wave6:packages`
- Scripts named `lint:wave4`, `lint:wave5:policy`, `lint:wave6:residual`
- Scripts named `test:phase4:server`, `test:phase4:client`,
  `test:phase4:integration`, `lint:phase4:strict`, `guard:phase4:workers:check`,
  `validate:phase4`
- `test:wave1b:runtime` alone references 24 individual test files
- `lint:wave6:residual` references 27 individual files inline

**Recommendation**: Collapse wave/phase groupings into a single parameterized
script pattern:

```json
// BEFORE (16+ scripts)
{
  "test:wave1b": "vitest run tests/unit/routes/monte-carlo-api.test.ts ...",
  "test:wave2": "vitest run tests/unit/cache/...",
  "test:wave3": "vitest run tests/unit/components/...",
  ...
}

// AFTER (1 script)
{
  "test:group": "vitest run --config vitest.config.mjs",
  "test:unit": "vitest run --project=server --project=client"
}
```

Use Vitest's built-in `test.namePattern` or file globbing in `vitest.config.mjs`
project definitions. Remove all wave/phase suffix scripts entirely.

---

#### Issue #2: 385 Scripts in `scripts/` Directory — Extreme Proliferation

**Severity**: P0 | **Category**: Scripts

**Problem**: The `scripts/` directory currently contains 385 files (295 at root
level). This is an entire codebase of operational scripts -- larger than many
application codebases. Subdirectories include: `ai/`, `ai-tools/`, `ci/`,
`codemods/`, `control-plane`, `database/`, `guardrails/`, `hooks/`,
`migrations/`, `perf/`, `redis/`, `security/`, `sql/`, `tbd/`, `validation/`,
`wip-cases/`.

**Evidence**:

- 295 files at `scripts/` root level
- Subdirectories: `ai/`, `ai-tools/`, `ci/`, `codemods/`, `control-plane/`,
  `database/`, `guardrails/`, `hooks/`, `migrations/`, `perf/`, `redis/`,
  `security/`, `sql/`, `tbd/`, `validation/`, `wip-cases/`
- Script names indicate many are one-off fixes: `fix-double-semicolons.js`,
  `fix-react-imports.js`, `fix-recharts-imports.js`,
  `fix-remaining-underscores.mjs`, `fix-server-underscores.mjs`,
  `fix-truth-cases.cjs`, `fix-ts4111.cjs`, `fix-type-safety.js`,
  `fix-typescript-errors.cjs`, `fix-typescript-errors.mjs`,
  `fix-underscore-imports.mjs`, `fix-unused-imports.js`, `fix-unused-vars.mjs`

**Recommendation**:

1. Delete or externalize one-off fix scripts after reference scans; avoid a
   committed `scripts/archive/` unless it has a clear owner and TTL
2. Consolidate duplicate fix scripts into parameterized utilities
3. Audit scripts against npm scripts -- remove scripts that duplicate `npm run`
   commands
4. Target: <50 active scripts (84% reduction)

---

#### Issue #3: CI/CD Workflow Duplication and Over-Complexity

**Severity**: P0 | **Category**: CI/CD

**Problem**: 16 workflow files with significant duplication. `ci-unified.yml`
remains the large unified pipeline, and several targeted workflows still
duplicate lint/typecheck/test/security responsibilities. Multiple workflows run
on overlapping triggers without a single command contract.

**Evidence**:

- `.github/workflows/ci-unified.yml`: 629 lines, 9 phases (changes -> setup ->
  check -> test-affected -> test-full -> build -> security-tests -> memory-mode
  -> guards -> gate)
- `.github/workflows/core-validation.yml`: 102 lines, duplicates `validate:core`
  from ci-unified
- `.github/workflows/code-quality.yml`: 265 lines, has its own lint/typecheck
  that duplicates ci-unified's check phase
- `.github/workflows/bundle-size-check.yml`: 185 lines with complex
  dual-checkout pattern
- 16 total workflow files as of 2026-05-19 verification

**Recommendation**: Consolidate into 3-4 workflows maximum:

```yaml
# 1. ci.yml — PR validation (lint, test, build)
# 2. cd.yml — deployment to staging/production
# 3. nightly.yml — full test suite, security scans
# 4. optional: bundle-check.yml (only if size monitoring critical)
```

Remove `core-validation.yml` and merge into `ci-unified.yml`. Remove
`code-quality.yml` since its checks duplicate the unified pipeline.

---

#### Issue #4: 11 Environment Files — Configuration Sprawl

**Severity**: P0 | **Category**: Environment

**Problem**: 14 root `.env*` files create confusion about which file is
authoritative. Files include overlapping concerns and some appear abandoned.
Current verification finds no committed `.env.test`; `.env.test.local` exists as
ignored local state.

**Evidence**:

```
.env.development
.env.development.example
.env.example
.env.local.example
.env.preact
.env.production
.env.react
.env.rls.example
.env.staging.example
.env.vercel
.env.vercel.example
```

- `.env.react` and `.env.preact` suggest framework switching experiments
- `.env.vercel` and `.env.vercel.example` duplicate Vercel-specific config
- `.env.rls.example` is for Row-Level Security testing only

**Recommendation**: Consolidate toward 4 canonical roles, but add committed
`.env.test` only after loader/CI behavior is verified:

```
.env.example           # Single template with ALL variables documented
.env.development       # Local development defaults (committed with safe values)
.env.test              # Test environment (CI/local testing)
.env.production        # Production (never committed, only in deployments)
```

Remove or merge `.env.react`, `.env.preact`, `.env.vercel`,
`.env.vercel.example`, and `.env.rls.example` only after their unique variables
are moved into `.env.example`, deployment docs, or RLS-specific docs as
appropriate.

---

#### Issue #5: Pre-Commit Hook Runs eslint --fix and Prettier on Every Commit

**Severity**: P0 | **Category**: GitHooks

**Problem**: The pre-commit hook (`.husky/pre-commit`, 64 lines) runs ESLint
--fix and Prettier --write on all staged files, auto-stages changes back, and
includes custom emoji and bigint validation. This makes commits slow and can
cause unexpected modifications.

**Evidence**:

- `.husky/pre-commit` lines 45-55:

```bash
git diff --cached --name-only -z --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' \
  | xargs -0 -r eslint --fix --max-warnings 0 --cache --no-warn-ignored
git diff --cached --name-only -z --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' \
  | xargs -0 -r node node_modules/prettier/bin/prettier.cjs --write
git diff --cached --name-only -z --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' \
  | xargs -0 -r git add --
```

**Recommendation**: Use `lint-staged` (already configured in `package.json`!)
instead of a custom shell script. Replace the pre-commit hook with:

```bash
#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"
npx lint-staged
```

Move emoji/bigint checks to CI-only or a separate opt-in
`npm run guard:precommit` script.

---

### P1 — High Priority Issues

---

#### Issue #6: Docker Image Duplication — 4 Dockerfiles, 5 Compose Files

**Severity**: P1 | **Category**: Docker

**Problem**: Multiple Dockerfiles and docker-compose files with significant
duplication. `Dockerfile` and `Dockerfile.worker` are nearly identical (only
user name and CMD differ). `Dockerfile.simple` is a non-optimized single-stage
build. `Dockerfile.railway` duplicates the main Dockerfile with minor
Railway-specific changes.

**Evidence**:

- `Dockerfile`: 64 lines, 3-stage build (deps/build/prod) -- primary
- `Dockerfile.worker`: 151 lines, same 3-stage structure + 90-line inline
  healthcheck script
- `Dockerfile.simple`: 36 lines, single-stage dev build
- `Dockerfile.railway`: 45 lines, similar to main Dockerfile
- `docker-compose.yml`: 77 lines (dev stack: postgres, redis, pgadmin)
- `docker-compose.dev.yml`: 40+ lines (postgres:15, redis, prometheus)
- `docker-compose.chaos.yml`: 101 lines (toxiproxy for chaos engineering)
- `docker-compose.observability.yml`: 111 lines (prometheus, grafana,
  alertmanager, pgwatch2)
- `docker-compose.rls.yml`: 316 lines (full HA: primary, replica, pgbouncer,
  haproxy, prometheus, grafana, alertmanager, redis, app)

**Recommendation**:

1. Merge `Dockerfile` and `Dockerfile.worker` using a `WORKER_TYPE` ARG:

```dockerfile
ARG APP_TYPE=web  # web | worker
FROM node:22-alpine AS base
# ... common stages ...
CMD if [ "$APP_TYPE" = "worker" ]; then node worker.js; else node dist/index.js; fi
```

2. Delete `Dockerfile.simple` (use `Dockerfile` with `--target build`)
3. Delete `Dockerfile.railway` (use `Dockerfile` with build args)
4. Merge docker-compose variants: use compose profiles
   (`--profile observability`, `--profile chaos`, `--profile rls`)

---

#### Issue #7: Pre-Push Hook Delegates to 200+ Line Node Script

**Severity**: P1 | **Category**: GitHooks

**Problem**: `.husky/pre-push` (3 lines) shells out to `scripts/pre-push.mjs` --
a Node script that implements its own shell command execution, Windows
detection, and complex validation logic. This indirection adds fragility.

**Evidence**:

- `.husky/pre-push`:

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"
exec node scripts/pre-push.mjs "$@"
```

- `scripts/pre-push.mjs` has its own `run()`/`output()` wrapper functions,
  Windows platform detection, and complex child process orchestration

**Recommendation**: Keep the current hook/script pair until a replacement
command is added and verified. Then simplify to inline bash or a direct npm
call:

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "[pre-push] Running validations..."
npm run lint
npm run test:quick
```

Delete `scripts/pre-push.mjs` only after the replacement hook path passes on
Windows and the canonical validation command is documented.

---

#### Issue #8: 41 Root Configuration Files

**Severity**: P1 | **Category**: Onboarding

**Problem**: The repository root has a large configuration surface. Current
verification finds 5 root TypeScript configs, 6 root Vitest configs, 2
Playwright configs, 2 ESLint configs, and numerous other dotfiles.

**Evidence**:

```
.editorconfig, .env*, .lighthouserc.json, .npmrc, .nvmrc, .prettier*, .remarkrc.mjs, .vercelignore,
deploy.config.json, drizzle.config.ts, eslint.config.js, eslint.security.config.js,
playwright.config*.ts (x2), postcss.config.js, replit-deployment.config.js, tailwind.config.ts,
tsconfig*.json (x5), vite.config.ts, vitest.config.* (x6)
```

**Recommendation**: Keep active TypeScript boundaries, especially
`tsconfig.shared.json`, until references are removed. Merge Vitest aliases/setup
by migration while keeping `vitest.config.mjs` as the unit entry until
`test:unit` changes. Add concise configuration documentation only for
non-obvious active configs.

---

#### Issue #9: ESLint Max Warnings Threshold Set to 4,700

**Severity**: P1 | **Category**: CI/CD

**Problem**: `.github/workflows/code-quality.yml` sets
`MAX_ESLINT_ERRORS: 4700`, and `eslint.config.js` likely has lenient rules. This
normalizes an enormous number of lint violations as "acceptable."

**Evidence**:

- `.github/workflows/code-quality.yml` line 20:

```yaml
MAX_ESLINT_ERRORS: 4700 # Baseline: 4700 total issues after Gate 0 no-console:warn rule
```

**Recommendation**:

1. Fix lint issues in batches (one rule at a time)
2. Reduce the threshold by 10% per sprint until it reaches 0
3. Use `eslint --max-warnings 0` in CI (already in `lint:eslint` script -- use
   that instead of the custom code-quality workflow)

---

#### Issue #10: AI Review Infrastructure in Production Repo

**Severity**: P1 | **Category**: Tooling

**Problem**: A complete multi-AI review agent system lives in `tools/ai-review/`
with 5 TypeScript files implementing orchestration, synthesis, and multi-agent
review. This appears to be experimental but is committed to the main branch.

**Evidence**:

- `tools/ai-review/MultiAIReviewAgent.ts` (3,205 bytes)
- `tools/ai-review/OrchestratorAdapter.ts` (3,555 bytes)
- `tools/ai-review/SynthesisAgent.ts` (2,905 bytes)
- `tools/ai-review/execute-multi-ai-review.ts` (6,720 bytes)
- `tools/ai-review/types.ts` (795 bytes)
- Referenced in `.husky/pre-commit` line 58-60 as optional AI review

**Recommendation**:

1. Move to a separate repository (`updog-ai-tooling`) or a private package
2. If kept, gate behind a feature flag and document clearly as experimental

---

### P2 — Medium Priority Issues

---

#### Issue #11: Two Custom ESLint Plugins with Minimal Implementation

**Severity**: P2 | **Category**: Tooling

**Problem**: Two custom ESLint plugins exist with very small footprints, adding
maintenance burden for minimal value.

**Evidence**:

- `tools/eslint-plugin-povc-security/index.cjs`: 12,118 bytes (custom security
  rules)
- `tools/eslint-plugin-rls/index.cjs`: 271 bytes + `lib/` directory
  (RLS-specific rules)
- `tools/eslint-plugin-rls/package.json`: 231 bytes

**Recommendation**:

1. Evaluate if `eslint-plugin-security` or `eslint-plugin-node` already covers
   these cases
2. If custom rules are truly needed, publish as internal
   `@updog/eslint-plugin-*` packages
3. The RLS plugin (271 bytes) likely should be a single rule in the main eslint
   config

---

#### Issue #12: 64-Line Inline Healthcheck Script in Dockerfile.worker

**Severity**: P2 | **Category**: Docker

**Problem**: The worker Dockerfile embeds a 130-line Node.js healthcheck script
as a heredoc, making it untestable outside Docker and impossible to
lint/type-check.

**Evidence**:

- `Dockerfile.worker` lines 57-138: Complete Node.js healthcheck server as
  inline heredoc

**Recommendation**: Extract to `scripts/healthcheck-worker.mjs` and COPY it:

```dockerfile
COPY --chown=worker:nodejs scripts/healthcheck-worker.mjs /app/healthcheck.js
```

---

#### Issue #13: `docker-compose.rls.yml` — Full Production Stack in Dev Repo

**Severity**: P2 | **Category**: Docker

**Problem**: The RLS compose file defines a complete production-grade stack
(primary/replica PostgreSQL, PgBouncer, HAProxy, Prometheus, Grafana,
AlertManager, Redis) with 316 lines. This is far beyond what developers need
locally and creates a massive maintenance surface.

**Evidence**:

- `docker-compose.rls.yml`: 316 lines
- Defines 10 services including replication, SSL, connection pooling, monitoring
- Requires `./certs/`, `./config/pgbouncer/`, `./config/haproxy/`,
  `./monitoring/` directories

**Recommendation**: Move to a separate `updog-infrastructure` repository. Keep
only `docker-compose.yml` (dev essentials) and `docker-compose.dev.yml` in the
main repo.

---

#### Issue #14: Scripts Directory Contains "Dead" Fix Scripts

**Severity**: P2 | **Category**: Scripts

**Problem**: Numerous scripts appear to be one-time migration/fix scripts that
have already been applied but remain in the repo. Examples include
`fix-double-semicolons.js`, `fix-react-imports.js`, `fix-recharts-imports.js`,
`migrate-lp-tables.ts`, `apply-recharts-deep-imports.js`, `apply-type-fixes.js`,
`migrate-array-safety.js`, etc.

**Evidence**:

```
scripts/fix-*.js (12+ files)
scripts/apply-*.js/ts (4+ files)
scripts/migrate-*.ts (2+ files)
```

**Recommendation**: Move all one-time migration scripts to `scripts/archive/` or
delete them. Keep only idempotent/reusable scripts at root level.

---

#### Issue #15: Bundle Size Check Does Double Checkout

**Severity**: P2 | **Category**: CI/CD

**Problem**: `.github/workflows/bundle-size-check.yml` checks out the repository
twice (once as `pr-tools`, once as `base-branch`) to compare bundle sizes,
significantly increasing CI time and complexity.

**Evidence**:

- Lines 26-34: Dual checkout pattern
- Lines 29-33: Two separate `actions/checkout@v4` calls

**Recommendation**: Use a GitHub Action designed for this purpose
(`github-actions/bundle-size` or `pkg-size/action`) or use a simpler approach
comparing against `main` branch artifact.

---

### P3 — Low Priority Issues

---

#### Issue #16: README.md is Only 49 Lines with Minimal Setup Info

**Severity**: P3 | **Category**: Onboarding

**Problem**: The README provides only `npm install && npm run dev` as setup
instructions, with no mention of database setup, environment configuration, or
Docker usage.

**Evidence**:

- `README.md`: Only 49 lines
- Setup section: 2 lines (`npm install`, `npm run dev`)

**Recommendation**: Expand README to include:

```markdown
## Quick Start

1. `npm install`
2. `cp .env.example .env.local` and configure
3. `docker-compose up -d` (starts postgres + redis)
4. `npm run db:push`
5. `npm run dev`

## Validation

6. `npm run validate:core`
```

---

#### Issue #17: Unused `.env.react` and `.env.preact` Files

**Severity**: P3 | **Category**: Environment

**Problem**: Separate `.env.react` and `.env.preact` files suggest the project
switched between React and Preact build modes, leaving stale configuration
behind.

**Evidence**:

- `.env.react` exists
- `.env.preact` exists
- `tsconfig.react.json` also exists alongside `tsconfig.preact.json`

**Recommendation**: Determine which framework is current (likely Preact based on
`build:web` script). Delete the unused env file and tsconfig. Document the
decision in `docs/ARCHITECTURE.md`.

---

#### Issue #18: `prepare` Script Runs Husky Install + Normalization

**Severity**: P3 | **Category**: GitHooks

**Problem**: The `prepare` script runs both `husky install` and
`node scripts/normalize-husky-shims.mjs` on every `npm install`, adding
unnecessary startup time and potential failure points.

**Evidence**:

- `package.json` line 97:
  `"prepare": "husky install && node scripts/normalize-husky-shims.mjs"`

**Recommendation**: Use Husky v9's automatic init (no `husky install` needed).
Remove `scripts/normalize-husky-shims.mjs` if it's handling Husky v8
compatibility.

---

#### Issue #19: Volta and `packageManager` Field Both Pin Tooling

**Severity**: P3 | **Category**: Tooling

**Problem**: Both Volta configuration and `packageManager` field are used to pin
Node/npm versions, creating two sources of truth.

**Evidence**:

- `package.json` line 10: `"packageManager": "npm@10.9.0"`
- `package.json` lines 244-247:

```json
"volta": {
  "node": "20.19.0",
  "npm": "10.9.2"
}
```

**Recommendation**: Remove the `volta` section and rely solely on `engines` +
`packageManager`. Volta is team-specific; `packageManager` is standardized.

---

#### Issue #20: Scripts/README.md Documents PowerShell Deployment System

**Severity**: P3 | **Category**: Onboarding

**Problem**: `scripts/README.md` (185 lines) documents a PowerShell-based
deployment system with progressive rollouts, circuit breakers, and monitoring.
This creates confusion about where deployment documentation lives and ties
deployment to Windows PowerShell.

**Evidence**:

- `scripts/README.md` lines 14-185: Complete deployment system docs
- References `deploy-with-confidence.ps1`, `monitor-deployment.ps1`,
  `smoke-test-prod.ps1`, `victory-lap.ps1`

**Recommendation**: Move deployment docs to `docs/DEPLOYMENT.md`. Keep
`scripts/README.md` as a directory index only.

---

## Summary Statistics

| Metric                | Count  | Industry Best Practice    | Gap                                            |
| --------------------- | ------ | ------------------------- | ---------------------------------------------- |
| package.json scripts  | 86     | <=50 first pass, then <30 | 1.7x over first-pass target                    |
| scripts/ files        | 385    | <50 active                | 7.7x over                                      |
| CI workflow files     | 16     | 3-5                       | 3.2x over                                      |
| .env\* files          | 14     | 3-4 canonical roles       | 3.5x over                                      |
| Root config files     | 41     | 15-20                     | 2x over                                        |
| Dockerfiles           | 4      | 1-2                       | 2x over                                        |
| docker-compose files  | 5      | 1-2                       | 2.5x over                                      |
| TypeScript configs    | 5 root | 3-5 active boundaries     | Keep `tsconfig.shared.json` until refs removed |
| Vitest configs        | 6 root | 2-3 after migration       | `vitest.config.mjs` is current unit entry      |
| Playwright configs    | 2 root | 1-2                       | In target range, still needs profile review    |
| Husky hooks           | 4      | 1-2                       | 2x over                                        |
| Custom ESLint plugins | 2      | 0                         | 2 unnecessary                                  |

---

## Prioritized Action Plan

### Phase 1: Immediate (Sprint 1) — P0 Issues

1. [ ] Collapse wave/phase test scripts into parameterized `vitest` commands
2. [ ] Merge duplicate CI workflows (`core-validation.yml` into
       `ci-unified.yml`)
3. [ ] Consolidate .env files to 4 canonical files
4. [ ] Replace pre-commit hook with `lint-staged` only
5. [ ] Delete or externalize one-time fix scripts after reference scans (target:
       295 -> <80 root scripts)

### Phase 2: Short-term (Sprint 2-3) — P1 Issues

6. [ ] Consolidate Dockerfiles using build ARGS (target: 4 -> 1)
7. [ ] Merge docker-compose files using profiles (target: 5 -> 2)
8. [ ] Add and verify replacement pre-push command, then delete
       `scripts/pre-push.mjs`
9. [ ] Consolidate TS/Vitest/Playwright configs
10. [ ] Remove or relocate AI review tooling

### Phase 3: Medium-term (Sprint 4-5) — P2 Issues

11. [ ] Move one-off migration scripts to archive
12. [ ] Extract inline Dockerfile healthcheck to separate script
13. [ ] Move RLS compose stack to infrastructure repo
14. [ ] Simplify bundle-size-check workflow

### Phase 4: Ongoing — P3 Issues

15. [ ] Expand README with full setup instructions
16. [ ] Clean up stale .env.react/.env.preact files
17. [ ] Remove Volta section, standardize on `packageManager`
18. [ ] Consolidate deployment documentation

---

_End of Audit Report_
