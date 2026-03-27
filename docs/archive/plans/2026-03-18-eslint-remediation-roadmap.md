---
status: PROPOSED
last_updated: 2026-03-18
---

# ESLint Remediation Roadmap

## Snapshot

As of 2026-03-18, the current ESLint baseline is:

- 0 errors
- 2470 warnings

Current warning mix:

- Type-safety rules: 1918
  - `@typescript-eslint/no-unsafe-member-access`: 703
  - `@typescript-eslint/no-unsafe-assignment`: 443
  - `@typescript-eslint/no-explicit-any`: 250
  - `@typescript-eslint/no-unsafe-argument`: 238
  - `@typescript-eslint/no-unsafe-call`: 150
  - `@typescript-eslint/no-unsafe-return`: 134
- Mechanical and operational rules: 552
  - `no-console`: 291
  - `unused-imports/no-unused-vars`: 215
  - `require-atomic-updates`: 25
  - `povc-security/no-parsefloat-in-calculations`: 8
  - `react-hooks/exhaustive-deps`: 7
  - remaining singleton rules: 6

Largest remaining directories:

- `client/src/components`: 402
- `server/routes`: 254
- `client/src/lib`: 227
- `client/src/hooks`: 209
- `client/src/pages`: 142
- `server/services`: 86
- `server`: 85

## Goal

Reduce the warning baseline in waves without destabilizing runtime behavior, and
ratchet `--max-warnings` downward after each completed wave.

## Workstreams

### 1. Mechanical and Internal Cleanup

Source plan: `docs/plans/2026-03-18-eslint-mechanical-internal-cleanup-plan.md`

Scope:

- remaining `unused-imports/no-unused-vars`
- `no-console`
- `require-atomic-updates`
- small singleton rules
- example and internal-only files

Target outcome:

- remove the easiest 250-400 warnings
- separate true production issues from CLI/example-file policy decisions

### 2. Server Type Safety

Source plan: `docs/plans/2026-03-18-eslint-server-type-safety-plan.md`

Scope:

- `server/routes`
- `server/services`
- `server/lib`
- `server/websocket`
- `server/security`
- server-side shared helpers used by routes

Target outcome:

- eliminate route and service `any` leakage
- add typed parsing boundaries around request payloads, database rows, and
  command output

### 3. Client Type Safety

Source plan: `docs/plans/2026-03-18-eslint-client-type-safety-plan.md`

Scope:

- `client/src/components`
- `client/src/hooks`
- `client/src/lib`
- `client/src/pages`
- `client/src/core`
- mirrored shared client math helpers

Target outcome:

- stop unsafe data from entering chart, wizard, reserve, and hook layers
- convert repeated `any` usage to reusable guards and typed adapters

## Recommended Sequence

### Wave A: Mechanical Wins

Start with the mechanical/internal cleanup plan.

Rationale:

- lowest regression risk
- fastest warning reduction
- removes noise before deeper type work

Expected reduction:

- 250+ warnings if unused vars and internal-file console usage are handled
  cleanly

### Wave B: Server Boundaries

Run the server type-safety plan next.

Rationale:

- route and service payload typing produces wide downstream payoff
- request, DB, and CLI parsing patterns are concentrated and repeatable

Expected reduction:

- 500-800 warnings if route and websocket clusters are normalized

### Wave C: Client Data Flow

Run the client type-safety plan after server boundaries are stable.

Rationale:

- client warnings are numerous, but many share a few adapter and guard problems
- chart and wizard clusters benefit from consistent upstream data shapes

Expected reduction:

- 700-1000 warnings if chart, hook, reserve, and forecasting clusters are fixed
  by root cause

### Wave D: Ratchet and Policy Cleanup

After the three main waves:

- lower `--max-warnings` from the current permissive baseline
- decide whether CLI/example files get code fixes, scoped overrides, or removal
  from the main lint target
- update historical plan docs only if they remain active references

## Guardrails

- Do not add broad file-level disables to buy progress.
- Prefer typed helpers over repeated local assertions.
- Keep internal/example-file policy decisions explicit.
- Run targeted ESLint on each cluster before full-repo verification.
- Keep full-repo warnings non-increasing on every PR.

## Verification Cadence

- Per cluster: `npx eslint <touched files>`
- Per wave: `npx eslint . --max-warnings 99999`
- After successful wave: reduce repo warning cap and update any ratchet
  baselines

## Exit Criteria

- 0 ESLint errors remains true throughout
- warning count drops materially after each wave
- no new broad suppressions
- runtime-facing logging and request handling remain behaviorally unchanged
