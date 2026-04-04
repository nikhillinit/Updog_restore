---
last_updated: 2026-04-03
---

# Phase 1B: Dual-Forecast Dashboard Single-Owner PR Queue

## Purpose

This document is now a compact, single-owner closure board for `Phase 1B`. It
records what landed, what was closed in the final provider-seam tranche, and
which non-blocking leftovers are explicitly deferred beyond Phase 1B.

## Re-Baselined Status

Evidence basis: current repo reality summarized in
`.omx/plans/2026-04-04-phase-1b-remaining-work-ralplan.md`, plus the queue and
status artifacts in this repo. This is no longer a full PR-by-PR implementation
plan.

### Status Matrix

| PR  | Status             | Current truth                                                                                                                                        |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR1 | effectively landed | Canonical deterministic perimeter and route semantics are already in place.                                                                          |
| PR2 | done               | The `FundContext` first-fund fallback on `/financial-modeling` is closed and covered by the provider-seam regression gate.                           |
| PR3 | effectively landed | The comparison contract and route are already mounted and integration-covered.                                                                       |
| PR4 | sign-off complete  | `financial-modeling` is live and truthful under the real provider seam.                                                                              |
| PR5 | done               | Fund-level construction-vs-actual comparison and drift v1 remain complete.                                                                           |
| PR6 | runtime-landed     | Dormant deterministic routes are off the mounted perimeter, and the remaining on-disk forecasting slice is explicitly deferred as follow-up hygiene. |
| PR7 | done               | Adjacent truthfulness cleanup remains complete.                                                                                                      |

## Closure Tranche Completed

The final Phase 1B closure tranche completed the following:

1. Closed the `FundContext` fallback so `/financial-modeling` no longer silently
   inherits the first available fund.
2. Added the mandatory provider-integrated regression gate for the real provider
   seam.
3. Reconciled the queue/status doc with the mounted perimeter and test truth.
4. Explicitly deferred the dormant `client/src/components/forecasting/*` slice
   to post-Phase-1B hygiene rather than reopening route work.

## What Is Closed

- PR1: effectively landed.
- PR2: done.
- PR3: effectively landed.
- PR4: sign-off complete under the provider seam.
- PR5: done.
- PR6: runtime-landed.
- PR7: done.

## Explicit Deferred Follow-Up

- `client/src/components/forecasting/*` is dormant and unreachable from the
  mounted perimeter. It may be removed in a later hygiene pass, but it is not a
  Phase 1B blocker.
- `server/routes/performance-metrics.ts` and `server/routes/engine-summaries.ts`
  still contain default-fund behavior, but the canonical deterministic surface
  does not call those routes. They are explicitly deferred unless a later audit
  proves them back on the active path.

## Exit Criteria For Final Closure

1. The canonical deterministic surface is truthful under the real provider seam.
   `[done]`
2. The queue/status artifact matches current runtime and test truth. `[done]`
3. The dormant forecasting slice is explicitly disposed of or deferred.
   `[done: deferred]`
4. No remaining work requires reopening PR1, PR3, PR5, PR6, or PR7 as full
   implementation tracks. `[done]`
