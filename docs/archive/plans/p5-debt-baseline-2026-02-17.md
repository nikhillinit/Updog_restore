# P5 Debt Baseline (2026-02-17)

## Scope

- Production paths: `client/src`, `server`, `shared`
- Test debt scope: `tests/**/*.test.ts(x)`, `tests/**/*.spec.ts(x)`

## Snapshot

- Deprecated flag key references in prod code: `0`
- Legacy imports from `@/lib/feature-flags` in `client/src`: `0`
- Static skip sites (`describe.skip|it.skip|test.skip`) in test files: `113`
- Files with `describe.skip` but no `@quarantine` JSDoc: `0`
- Quarantined test files in `tests/quarantine/REPORT.md`: `35`
- Disallowed console methods in prod paths
  (`log|debug|info|table|group|groupEnd`): `383`
- File-level `/* eslint-disable ... */` directives in scoped code: `132`

## Guardrails Initialized

- `.baselines/console-prod-baseline.json`
- `.baselines/eslint-file-disable-baseline.json`
- `npm run guardrails:check` passes against current baselines
