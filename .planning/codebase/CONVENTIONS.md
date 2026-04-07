# Coding Conventions — Updog

> Generated 2026-04-07. Sources: `eslint.config.js`, `tsconfig.json`,
> `CLAUDE.md`, `cheatsheets/`, `DECISIONS.md`, `docs/skills/REFL-*.md`.

## TypeScript

- **Strict mode:** all on (`strict: true`, `noUncheckedIndexedAccess: true`,
  `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`,
  `noPropertyAccessFromIndexSignature: true`,
  `noFallthroughCasesInSwitch: true`)
- **No `any`:** project policy is "NEVER use `any`" per CLAUDE.md. ESLint
  currently has `@typescript-eslint/no-explicit-any` at **`warn`** because of
  ~400 pre-existing baselines (`eslint.config.js:181`); the policy goal is
  `error`. New code MUST not introduce `any`.
- **`exactOptionalPropertyTypes` pattern:** spread-conditional, never pass
  `undefined` directly. See REFL-021.
  ```ts
  // JSX
  <Modal {...(fundId != null && { fundId })} />
  // Object
  { ...(value && { key: value }) }
  ```
- **Index signature access:** with `noPropertyAccessFromIndexSignature: true`,
  use bracket notation for env vars and dynamic keys:
  `process.env['DATABASE_URL']` not `process.env.DATABASE_URL`. See REFL-032.
- **Array indexing:** TS does not narrow `arr[0]` after `arr.length > 0`. Use
  `arr[0]?.prop ?? default` or extract to a variable with explicit null check.
- **Consistent type imports:** ESLint enforces `prefer: 'type-imports'`,
  `fixStyle: 'separate-type-imports'`. The auto-fixer may strip type imports
  added in a separate edit from a subagent — see REFL feedback "type imports
  after subagent edits".
- **Decimal math:** never `import Decimal from 'decimal.js'` directly in runtime
  code. Use `import { Decimal } from '@shared/lib/decimal-config'`. Enforced by
  ESLint `no-restricted-imports` (`eslint.config.js:444-475`). Test files are
  exempt.
- **No `parseFloat` in P0 calculation paths:** `client/src/lib/`,
  `client/src/core/`, `server/analytics/`, `workers/{reserve,pacing}-worker.ts`
  — `povc-security/no-parsefloat-in-calculations` rule (warn).
- **Floating point banned in `core/reserves/`:**
  `povc-security/no-floating-point-in-core` rule (error).

## File Naming

| Element                   | Convention                                              |
| ------------------------- | ------------------------------------------------------- |
| React component           | `PascalCase.tsx` — e.g. `DashboardCard.tsx`             |
| Page                      | `kebab-case.tsx` — e.g. `fund-setup.tsx`                |
| Hook                      | `useFooBar.ts` (`use` prefix)                           |
| Service / route / utility | `kebab-case.ts`                                         |
| Worker                    | `kebab-case-worker.ts`                                  |
| Test                      | `[name].test.ts` (server) or `[name].test.tsx` (client) |
| Spec                      | `[name].spec.ts` (mostly integration)                   |
| ESLint rule               | `eslint-rules/no-*.cjs` (CommonJS)                      |

## Module Boundaries (ESLint enforced)

- **`server/**`** cannot import `client/src/_`(or`../client/_`, `../../client/\*`)
- **`client/**`** cannot import `server/_`(or`../server/_`, `../../server/\*`)
- Both can import `shared/*` and `@shared/*`
- Path-aliased imports (`@/*`, `@shared/*`) are preferred over relative paths

### Forbidden imports (with replacement guidance)

| Forbidden                         | Use instead                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `../state/useFundStore`           | `@/stores/useFundStore`                                                              |
| `@/lib/feature-flags`             | `@/core/flags/unifiedClientFlags` or `@/core/flags/flagAdapter`                      |
| `@/lib/map-fund-store-to-payload` | `@/adapters/fund-store-adapters` (`fundStoreToCreateV1` / `fundStoreToDraftWriteV1`) |
| `decimal.js`                      | `@shared/lib/decimal-config`                                                         |

## React / Hooks

- **Functional components only.** Hooks-based; no class components.
- **`react-hooks/rules-of-hooks`** is `error`; **`exhaustive-deps`** is `warn`
  (intentional — too many false positives in stabilized code paths).
- **Lazy routes:** all heavy pages are wrapped in
  `React.lazy(() => import(...))` (see `client/src/App.tsx:23+`).
- **`useFundStore` selectors:** ESLint `no-restricted-syntax` rejects:
  - `useFundStore()` with no equality function
  - Object-literal returns from a selector without an equality function
  - Array-literal returns from a selector without an equality function
  - Use `useFundSelector` (defaults to shallow) or pass `shallow` / `Object.is`
    as second arg
- **React hooks with `setInterval` under `vi.useFakeTimers()`:** every
  `vi.advanceTimersByTime` must be wrapped in `act()`. See REFL/feedback
  `feedback_use_fake_timers_act_wrapping.md` and pattern at
  `tests/unit/hooks/use-graduation.test.tsx:80`.

## Error Handling

- **Express error handler:** centralized in `server/app.ts`; uses
  `HttpError { status?, message? }` shape
- **Zod validation errors:** `zod-validation-error` `^5.0.0` for human-readable
  messages
- **Pino logger:** `logger.error({ err: error, phase: '...' }, 'message')` —
  pass error as `err` field for proper serialization
- **No silent catches:** `silent-failure-hunter` agent exists for this; new
  `try/catch` blocks must rethrow or log+act, never swallow
- **Idempotency required for all mutations** (zero-tolerance per CLAUDE.md)
- **Optimistic locking required for all updates** (configVersion column pattern)

## Logging

- **Standard:** Pino (per ADR-019)
- **Console gate:** `no-console` is `warn` with `allow: ['warn', 'error']`.
  There's a guardrail ratchet at `scripts/guardrails/console-ratchet.mjs`
  (baseline 374 disallowed calls — new code cannot add to it).
- **Client-side:** Sentry breadcrumbs when DSN configured;
  `client/src/monitoring/noop.ts` shim otherwise

## Imports

- **Path alias preferred** over deep relative imports
- **Unused imports** are `error` (`unused-imports/no-unused-imports`)
- **Unused vars** are `warn`, ignored if prefixed with `_`
- **Auto-fix on save:** Husky `lint-staged` runs
  `eslint --fix --max-warnings 0 --cache --no-warn-ignored` then Prettier on
  every staged TS/JS file
- **Linter strips imports immediately**: when adding imports for code that
  doesn't exist yet, add the consumer first or combine in a single edit. See
  memory "Linter Edit Hook -- Import Ordering". Workaround: dynamic
  `await import('...')` at call site.

## Validation

- **Zod 3.25.76 at every I/O boundary** — request bodies, query params, queue
  payloads, env loading
- **Drizzle-Zod** generates baseline schemas from DB tables; refine in
  `shared/schemas/`
- **Use `z.enum()` not `z.string()`** for fields with known domain values (per
  memory "Contract Schema Enum Constraints")
- **Severity enums must match domain definitions** when filtering JSONB (per
  memory "Severity Enum Consistency")

## Database

- **JSONB vs columns:** before writing structured data into JSONB, check the
  schema for dedicated columns. Don't nest into a blob when proper columns exist
  (per memory "Check Schema Columns Before Persistence").
- **NULL configVersion:** snapshot queries must handle `NULL` configVersion —
  pre-Phase-2A funds have unattributed snapshots (per memory "Legacy NULL
  Attribution").
- **Drizzle mock interface gaps:** Phase 2A tables (`fundConfigs`, `calcRuns`)
  are missing from the mock query interface; use service-level mocking for
  integration tests (per memory "DB Mock Query Interface Gaps").
- **Schema split:** new tables go in the right file (`shared/schema.ts` for
  core, `shared/schema-lp-reporting.ts` for LP reporting,
  `shared/schema-lp-sprint3.ts` for capital
  calls/distributions/documents/notifications) — `drizzle.config.ts` enumerates
  all three.
- **Neon pooler quirk:** PgBouncer requires `JSON.stringify()` for JSONB params
  in raw `pg` queries (per memory "Neon Database").

## Documentation Governance (per CLAUDE.md)

**PRUNE by default** — do not create:

- Session artifacts, progress logs, handoff docs
- Navigation indexes, capability catalogs
- Capability inventories derivable from code

**PRESERVE / CREATE** — institutional memory:

- REFLs (`docs/skills/REFL-NNN-*.md`) for debugging learnings
- ADR entries in `DECISIONS.md`
- Memory entries for non-derivable gotchas
- Domain docs when business logic cannot be inferred from code

**Derivability test:** could a future session reconstruct this from code + git
log? If YES, do NOT create a file.

## Style — No Emoji Policy

- **Strictly enforced.** No emoji in code, docs, commits, logs.
- Use text alternatives: `[x]` instead of checkmarks, `PASS:` / `FAIL:` instead
  of icons.
- Rationale: emoji break CI logs, reduce a11y, hurt searchability.
- Cheatsheet: `cheatsheets/emoji-free-documentation.md`

## Commits

- **Conventional Commits** enforced: `feat:`, `fix:`, `refactor:`, `chore:`,
  `docs:`, `test:`, `perf:`, `build:`, `ci:`
- **Recent examples** (from `git log --oneline -20`):
  - `tests(lib): resurrect 8 orphaned test suites from client/src/lib/__tests__`
  - `refactor(variance): extract remaining-capital helper + add tests`
  - `feat(sensitivity): add stress tab with StressPanel + engine + route + IA cleanup`
  - `chore(deps): bump vite 5.4.21 -> ^6.4.2 to patch GHSA-4w7w-66w2-5vf9`
- **Atomic commits** during multi-session work — commit per batch, not at end
  (per memory "Commit Discipline in Multi-Session Work")
- **Diff for collateral** after subagent batches before committing (per memory
  "Subagent Collateral Cleanup")

## Quality Gates (MANDATORY pre-commit)

Per `cheatsheets/anti-pattern-prevention.md` (24 cataloged patterns) and
CLAUDE.md "Zero Tolerance Quality Policy":

1. **All mutations MUST have idempotency**
2. **All updates MUST use optimistic locking**
3. **All cursors MUST be validated**
4. **All queue jobs MUST have timeouts**

Run `/pre-commit-check` (lint + typecheck + tests) before commits. Pre-push hook
(`./scripts/validate-pr.sh`) runs `npm run baseline:check`.

## Mandatory Pre-Action Checks (CLAUDE.md)

- **BEFORE changing shared mocks/fixtures:** grep for ALL assertion patterns
  that depend on current behavior
- **BEFORE pushing when test infra changed:** run full `npm test`, not just
  targeted
- **BEFORE writing JSONB:** check schema for dedicated columns
- **BEFORE client route changes:** trace actual app routing (spec may name wrong
  component) — see memory "Verify Live Route Matches Spec"
- **AFTER subagent batches:** diff for files outside owned scope
- **WHEN errors occur:** graduated response — lint fails → `npm run lint:fix`;
  type errors → `npm run check`; test fails → run targeted test first

## Babysitter / GSD Conventions

- Phoenix truth cases must pass before merging calculation changes —
  `npm run phoenix:truth` for current count
- Pre-push baseline check compiles client/server/shared **separately** — local
  `tsc --noEmit` may pass while baseline fails (catches TS4111 index-signature
  drift)
- `TZ=UTC` required for all test runs (set by all `test:*` scripts)
- Conventional commits (above)
- Codex CLI for orchestrator-style consultations
  (`codex exec "..." --sandbox read-only`)
