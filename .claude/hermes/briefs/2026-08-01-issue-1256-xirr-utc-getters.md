# Issue #1256 — safeXIRR day-count depends on process timezone

Frozen spec for this dispatch. GitHub issue (canonical defect description):
https://github.com/nikhillinit/Updog_restore/issues/1256 — do not re-derive
scope from anywhere else.

## Scope

Single file: `shared/lib/finance/xirr.ts`, function `serialDayUtc` (currently
lines 70-72):

```ts
function serialDayUtc(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY
  );
}
```

`getFullYear()/getMonth()/getDate()` are local-time getters. The docstring above
it (lines 66-69) claims UTC-normalized purity; that only holds when the process
runs with `TZ=UTC`. Confirmed by grep of the whole file: this is the ONLY
local-time getter site (`getFullYear|getMonth|getDate|getHours` etc. without a
`UTC` prefix) — no sibling occurrences to fix.

## Fix

Swap to UTC getters:

```ts
function serialDayUtc(date: Date): number {
  return (
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
    MS_PER_DAY
  );
}
```

Behavior-identical to current output under `TZ=UTC` (the only sanctioned runtime
for this repo) — zero parity risk against Phoenix truth cases.

Also add `export` to `function serialDayUtc` (visibility change only, no logic
change) so it can be unit-tested directly. It is currently module-private and
only reachable indirectly via `yearFraction` ->
`xirrNewtonBisection`/`safeXIRR`/`calculateCanonicalIrr`.

## TDD (write failing test first)

Target file: `tests/unit/xirr-edge-cases.test.ts` (existing file, single
`describe('xirr edge cases', ...)` block already imports `xirrNewtonBisection`
from `@/lib/finance/xirr` — add `serialDayUtc` to that same import and add new
`it(...)` cases inside the existing describe block, matching its established
`date: new Date('...Z')` style).

Do NOT try to prove this bug by spawning a child process with a different `TZ`
env var, and do NOT try to mutate `process.env.TZ` mid-test (V8 caches timezone
state per-process; this is unreliable and would be the first flaky-test source
in a suite that pins `TZ=UTC` repo-wide). Instead, mock `Date.prototype`'s local
getters directly with `vi.spyOn` to prove the function's output is independent
of them:

```ts
it('serialDayUtc is pure w.r.t. local Date getters (regression for #1256)', () => {
  const date = new Date('2024-01-01T00:00:00.000Z');
  const fy = vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(1999);
  const mo = vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(0);
  const da = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(1);

  const result = serialDayUtc(date);

  fy.mockRestore();
  mo.mockRestore();
  da.mockRestore();

  expect(result).toBe(Date.UTC(2024, 0, 1) / (24 * 60 * 60 * 1000));
});
```

This must FAIL against the current implementation (which would pick up the
mocked-to-1999 local getters and return the wrong serial day) and PASS after the
fix (which ignores local getters entirely). Add a second, non-mocked sanity test
confirming ordinary UTC-date input still produces the expected serial day (no
regression on the happy path).

## Constraints (non-negotiable)

- Frozen module under ADR-010 (`docs/adr/ADR-010-xirr-day-count-and-bounds.md`).
  This dispatch implements + tests the fix; it does NOT merge it — a separate
  `xirr-fees-validator` specialist review happens after this dispatch returns,
  before any commit/PR.
- Do not touch anything outside `shared/lib/finance/xirr.ts` and the one test
  file. Not in scope: `shared/lib/internal-economics/*` (separate, unrelated fix
  — different dispatch), WP-2b-4 files, WP-L3 files.
- No behavior change under `TZ=UTC`. Do not change `MS_PER_DAY`, `yearFraction`,
  rate bounds, or any other function in the file.

## Verification (must all pass before returning)

```
TZ=UTC npx vitest run tests/unit/xirr-edge-cases.test.ts --configLoader native --project=server
TZ=UTC npm run check
npm run lint
TZ=UTC npm run phoenix:truth
```

Phoenix truth cases must show zero drift (this is a frozen-module edit — any
movement is a stop-and-report, not a proceed).

## Explicitly out of scope for this dispatch

- Task 2 from the handoff (`isNegative()` -> `.lt(0)` nit in
  `shared/lib/internal-economics/cash-assembly-call-sizing-v1.ts:167`) —
  separate file, separate specialist lane, separate dispatch.
- Any WP-2b-4 or WP-L3 work — issue #1256 is explicitly confirmed out of WP-2b-4
  scope.
