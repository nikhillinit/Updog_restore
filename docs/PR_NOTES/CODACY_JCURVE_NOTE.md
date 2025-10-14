# Codacy (jcurve.ts) — Temporary Mitigation for Track 1A

**Context:** Codacy flags two medium-severity findings in `shared/lib/jcurve.ts`:
- **Cyclomatic complexity ~41** (rule limit 8)
- **Function length ~112 lines** (rule limit 50)

These issues **predate** Track 1A and are unrelated to this PR's scope (types-only).

## What we did in this PR
- Added a **function-scoped ESLint suppression** above `computeJCurvePath`:
  ```ts
  /* eslint-disable-next-line complexity, max-lines-per-function -- TEMP: Track 1A types-only; refactor in follow-up */
  export function computeJCurvePath(...) { ... }
  ```
- This **does not change runtime behavior** and localizes the suppression to the hotspot.

## Follow-up (separate PR)
- Refactor `computeJCurvePath` into smaller **pure helpers** (e.g., `normalizeInputs`, `computeContributions`, `computeDistributions`, `buildSeries`, `smooth`, `toMetrics`).
- Add **golden tests** to ensure output parity before/after refactor.
- Remove the temporary ESLint suppression.

## Why not refactor here?
- Track 1A is **strictly types-only** and already complete (Client+Shared TS = 0).
- Keeping the delta minimal prevents risk and unblocks merge, while a dedicated refactor PR can focus on correctness and test coverage.

**Status:** Temporary suppression applied; follow-up issue to be opened post-merge.

— PR #145
