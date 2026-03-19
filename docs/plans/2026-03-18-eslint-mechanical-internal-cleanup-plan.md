---
status: PROPOSED
last_updated: 2026-03-18
---

# ESLint Mechanical and Internal Cleanup Plan

## Snapshot

Current non-root-cause warning buckets on 2026-03-18:

- `no-console`: 291
- `unused-imports/no-unused-vars`: 215
- `require-atomic-updates`: 25
- `povc-security/no-parsefloat-in-calculations`: 8
- `react-hooks/exhaustive-deps`: 7
- remaining singleton warnings: 6

Notable internal or policy-sensitive files:

- `packages/agent-core/backtest-runner.ts`: 54
- `server/security/integration-guide.ts`: 42
- `server/websocket/dev-dashboard.ts`: 31
- `server/routes/dev-dashboard.ts`: 9
- `client/src/lib/rollout-orchestrator.ts`: 16

## Objective

Remove the remaining low-risk warnings and explicitly classify the files that
should be fixed in code versus scoped as CLI/example/internal-only policy
exceptions.

## Phase 1: Unused Variable Sweep

Target rule:

- `unused-imports/no-unused-vars`: 215

Best starting files:

- `server/routes/dev-dashboard.ts`
- `client/src/pages/CapitalStructureStep.tsx`
- `client/src/pages/time-travel.tsx`
- `client/src/pages/DistributionsStep.tsx`
- `client/src/pages/analytics.tsx`
- `client/src/pages/shared-dashboard.tsx`
- `client/src/components/portfolio-constructor/ReserveConfigurator.tsx`
- `client/src/lib/predictive-cache.ts`
- `server/security/integration-guide.ts`

Approach:

- remove dead locals
- rename intentionally unused args to `_name`
- avoid leaving placeholder variables in mock or temporary code

Expected payoff:

- fastest warning reduction with minimal behavioral risk

## Phase 2: Console Policy Cleanup

Target rule:

- `no-console`: 291

Decision matrix:

### Production runtime files

Examples:

- `server/server.ts`
- `server/services/notion-service.ts`
- `server/services/email-service.ts`
- `server/routes/monte-carlo.ts`
- `server/queues/*.ts`

Action:

- replace `console.*` with the repo logger or an existing structured logging
  helper

### Client runtime files

Examples:

- `client/src/lib/rollout-orchestrator.ts`
- `client/src/hooks/useDevDashboard.ts`

Action:

- gate debug-only output behind existing debug utilities
- remove diagnostics that are not user- or developer-critical

### CLI or human-facing command files

Examples:

- `packages/agent-core/backtest-runner.ts`

Action:

- either keep console usage and add a narrow ESLint override
- or migrate to `process.stdout.write` / `process.stderr.write` if preferred

### Reference or integration-guide files

Examples:

- `server/security/integration-guide.ts`

Action:

- decide whether this remains linted as runtime code
- if it is reference-only, move it or add a tightly scoped override instead of
  spending production-code cleanup effort here first

## Phase 3: Atomic Update and Singleton Cleanup

Target rule:

- `require-atomic-updates`: 25

Top files:

- `server/queues/simulation-queue.ts`: 6
- `server/queues/backtesting-queue.ts`: 4
- `server/queues/report-generation-queue.ts`: 3
- `client/src/config/runtime.ts`: 2
- `server/cache/index.ts`: 2

Approach:

- replace mutable singleton assignment in async paths with init promises or
  local temporaries
- make queue and cache initialization idempotent
- only suppress when the code is intentionally safe and a refactor would make it
  less clear

## Phase 4: Precision and Hook Remainders

Target rules:

- `povc-security/no-parsefloat-in-calculations`: 8
- `react-hooks/exhaustive-deps`: 7
- remaining singleton warnings: 6

Approach:

- evaluate whether `parseFloat` belongs in UI parsing only or needs Decimal
  conversion
- fix hook dependency arrays only when the dependency intent is clear
- resolve one-off warnings individually after the high-volume buckets are done

## Policy Decisions Required

- Should CLI files remain under the same `no-console` policy as runtime code?
- Should example/reference TS files stay in the default lint target?
- Should some internal tooling paths get scoped overrides instead of logger
  migrations?

## Verification

- batch unused-var sweep: `npx eslint <files>`
- console cleanup wave:
  `npx eslint packages/agent-core/backtest-runner.ts server/server.ts server/services/notion-service.ts`
- atomic update wave:
  `npx eslint server/queues/*.ts server/cache/index.ts client/src/config/runtime.ts`
- full pass: `npx eslint . --max-warnings 99999`

## Done Definition

- low-risk mechanical warnings are largely removed
- remaining console usage is intentional and documented
- async singleton warnings are either fixed or narrowly justified
- the repo warning cap can be ratcheted downward after the wave lands
