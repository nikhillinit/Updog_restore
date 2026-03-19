---
status: PROPOSED
last_updated: 2026-03-18
---

# ESLint Server Type Safety Plan

## Snapshot

Current server-heavy clusters on 2026-03-18:

- `server/routes`: 254 warnings
- `server/services`: 86 warnings
- `server/lib`: 65 warnings
- `server/middleware`: 66 warnings
- `server/websocket`: 40 warnings
- `server/security`: 42 warnings

Top rule families in the server path:

- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-argument`

Top current files:

- `server/routes/monte-carlo.ts`: 41
- `server/routes/scenario-comparison.ts`: 33
- `server/websocket/dev-dashboard.ts`: 31
- `server/routes/ai.ts`: 27
- `server/metrics/variance-metrics.ts`: 27
- `server/security/integration-guide.ts`: 42
- `server/db/schema/reserves.ts`: 27

## Root Causes

### 1. Untyped request payloads

Patterns:

- `req.body` and `req.query` consumed as `any`
- ad hoc casts instead of schema parsing
- route-local destructuring without a validated boundary

### 2. Untyped external data

Patterns:

- `JSON.parse(...)` results treated as structured values
- child-process stdout parsed without typed guards
- upstream API payloads used directly

### 3. Request augmentation inconsistencies

Patterns:

- `req.user`, `req.context`, and route-local request shapes accessed
  inconsistently
- repeated local assertions instead of a shared typed request helper

### 4. Dynamic record access in schema and helper code

Patterns:

- nested maps and schema objects accessed without guards
- `unknown` and `error`-typed DB payloads flowing into runtime code

## Phase 1: Route Boundary Fixes

Target files:

- `server/routes/monte-carlo.ts`
- `server/routes/scenario-comparison.ts`
- `server/routes/ai.ts`
- `server/routes/variance.ts`
- `server/routes/dev-dashboard.ts`

Tasks:

- add or reuse Zod schemas for request bodies and query parameters
- replace direct `req.body` destructuring with `.parse(...)` or typed helpers
- normalize route-local request types where `req.user` is optional
- remove leftover dead locals once parse boundaries are typed

Expected payoff:

- highest immediate reduction in `server/routes`
- route code becomes easier to review and test

## Phase 2: Websocket and Command Output Parsing

Target files:

- `server/websocket/dev-dashboard.ts`
- `server/websocket.ts`
- `server/metrics/variance-metrics.ts`
- `server/routes/dev-dashboard.ts`

Tasks:

- create small typed parsers for `exec` output and JSON payloads
- type websocket event payloads instead of using `any`
- isolate `socket.emit` and `socket.on` payload contracts in local interfaces

Expected payoff:

- removes concentrated `no-unsafe-*` warnings in dev-dashboard and metrics code

## Phase 3: Service and Library External-Data Boundaries

Target files:

- `server/services/notion-service.ts`
- `server/services/ai-orchestrator.ts`
- `server/lib/errorHandling.ts`
- `server/lib/http-preconditions.ts`
- `server/lib/redis/cluster.ts`
- `server/cache/index.ts`
- `server/infra/circuit-breaker/*.ts`

Tasks:

- narrow API client responses with explicit interfaces
- add helpers for parsed JSON and error objects
- replace repeated index access with typed adapters or guards
- use `unknown` plus guards instead of `any`

Expected payoff:

- broad removal of `no-unsafe-member-access`, `no-unsafe-assignment`, and
  `no-explicit-any`

## Phase 4: Security and Example-File Decision Pass

Target files:

- `server/security/integration-guide.ts`
- `server/routes/simulations-guarded.example.ts`

Decision needed:

- production runtime code: fix in code
- reference/example-only code: either move to docs/examples or add
  narrowly-scoped config overrides

Preferred approach:

- keep production files strict
- avoid spending server-runtime cleanup time on files that are effectively
  documentation

## Implementation Rules

- Prefer shared helpers over repeated local assertions.
- Use local interfaces for parsed payloads when Zod would be overkill.
- Do not widen shared request types to `any`.
- Treat CLI output as `unknown` until parsed and validated.

## Verification

Recommended commands per phase:

- `npx eslint server/routes/monte-carlo.ts server/routes/scenario-comparison.ts server/routes/ai.ts server/routes/variance.ts`
- `npx eslint server/websocket/dev-dashboard.ts server/routes/dev-dashboard.ts server/metrics/variance-metrics.ts`
- `npx eslint server/services/notion-service.ts server/lib/redis/cluster.ts server/cache/index.ts`
- full pass: `npx eslint . --max-warnings 99999`

## Done Definition

- route payload access is typed at the boundary
- websocket and child-process parsing is typed
- server runtime paths no longer depend on `any` for core request or response
  handling
- warning count in server-heavy directories drops materially without new
  suppressions
