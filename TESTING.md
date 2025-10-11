# Testing Policy (Core-first)

## Scope
For the Settings-first MVP, we only run **core** tests by default.
De-scoped suites (wizard, Monte-Carlo, prediction) are excluded from the core run.

## How to run
```bash
# core tests only
npx vitest --config vitest.core.config.ts

# typecheck + core tests
npx tsc --noEmit && npx vitest --config vitest.core.config.ts
```

## Structural vs. behavioral mocks
- **Structural mocks** (stable shapes like schemas) live under `tests/__mocks__`.
- **Behavioral overrides** should be done inline in a specific test via `vi.mock(...)`.

## Flags in tests
- Avoid reading `import.meta.env` or `process.env` directly in specs.
- If a spec depends on a feature flag, import from `@/flags` and branch with `describe/it.skip`.
