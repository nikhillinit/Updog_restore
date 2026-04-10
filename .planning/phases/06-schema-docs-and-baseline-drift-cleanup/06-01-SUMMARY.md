---
phase: 06-schema-docs-and-baseline-drift-cleanup
plan: 01
type: summary
date: 2026-04-10
status: partial-execution-complete
supersedes:
  - 06-01-PLAN.md
follow_on:
  - 06-01-v2-PLAN.md
---

# Plan 06-01 Summary

## Outcome

Plan `06-01` did not execute as originally written. Live Neon introspection proved
the original plan was factually wrong, so the plan was closed out via findings,
then narrowed into a safe-now execution slice plus a corrected `06-01-v2` plan.

## What Actually Executed

### 1. Findings preserved

- Preserved:
  [.planning/phases/06-schema-docs-and-baseline-drift-cleanup/06-01-INTROSPECT-FINDINGS.md](C:\dev\Updog_restore\.planning\phases\06-schema-docs-and-baseline-drift-cleanup\06-01-INTROSPECT-FINDINGS.md)
- Findings status updated from `blocking-decision-required` to
  `superseded-by-v2`.

### 2. Safe-now artifact cleanup executed

Deleted the stale untracked `drizzle-kit introspect` outputs:

- `migrations/schema.ts`
- `migrations/relations.ts`

Rationale: the findings doc established these files were non-authoritative and
misleading relative to direct SQL truth from `information_schema.tables`.

### 3. Safe-now Notion cluster executed

Deleted:

- `server/services/notion-service.ts`

Removed from `shared/schema.ts`:

- `notionConnections`
- `notionSyncJobs`
- `notionPortfolioConfigs`
- `notionDatabaseMappings`
- related insert schemas
- related type exports

Execution-time proof used:

```powershell
rg -n "notion-service\.js|notion-service\.ts|NotionService|notionService" server client shared tests schema -g '!node_modules'
```

Observed result before deletion:

- `server/services/notion-service.ts:41`
- `server/services/notion-service.ts:1238`

No additional runtime importers were found. Table-symbol consumers were limited
to `shared/schema.ts` and `server/services/notion-service.ts`.

## What Was Deferred to 06-01-v2

The following remain audit-first:

1. Cohort cluster
2. Portfolio-optimization cluster
3. LP cluster
4. Newly surfaced phantoms:
   - `shares`
   - `shareAnalytics`
   - `sensitivityRuns`
   - `snapshotVersions`

`jobOutbox` remains explicit keep-as-is.

## Verification Evidence

### Static verification

TypeScript baseline check:

```text
Found 0 TypeScript errors
Baseline errors: 0
Current errors: 0
New errors: 0
```

Fresh code-intel diagnostics:

- project diagnostics: `0` errors
- `shared/schema.ts`: `0` errors

### Guardrail verification

Console ratchet:

```text
[console-ratchet] pass: current 39 <= baseline 39
```

ESLint-disable ratchet:

```text
[eslint-disable-ratchet] pass: current 28 <= baseline 29
```

### Environment limitation

`vitest` / `validate:core` could not be executed from this shell because the
runtime blocks the process-spawn path used by Vite/Vitest (`spawn EPERM`) and
the PowerShell `npm` launcher is broken in this environment. This is a
verification-environment limitation, not a TypeScript regression from the safe
delete slice.

## Notes

- `shared/notion-schema.ts` now appears to have zero importers after
  `notion-service.ts` deletion, but it was not part of the approved safe-now
  bucket and was left untouched to keep the execution slice narrow.
- The canonical remaining execution contract is
  [.planning/phases/06-schema-docs-and-baseline-drift-cleanup/06-01-v2-PLAN.md](C:\dev\Updog_restore\.planning\phases\06-schema-docs-and-baseline-drift-cleanup\06-01-v2-PLAN.md).
