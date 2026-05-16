# Refactor Stability Strategy Design

**Status:** Draft for review  
**Date:** 2026-05-16  
**Scope:** Refactor strategy for improving robustness and stability without
changing product behavior.

## Goal

Create a refactor strategy that makes the codebase more stable by finishing one
active boundary repair before starting the next. The first target is the
variance tracking calculation boundary, because the current branch has already
extracted baseline and alert responsibilities while leaving
`VarianceCalculationService` as the remaining large mixed-responsibility service
body.

## Context

The current branch is `refactor/variance-baseline-service-extraction`. Recent
commits already moved these pieces out of the old variance service facade:

- `server/services/variance-tracking/baseline-service.ts`
- `server/services/variance-tracking/alert-helpers.ts`
- `server/services/variance-tracking/alert-management-service.ts`

The remaining major body is `VarianceCalculationService` in
`server/services/variance-tracking.ts`. It still owns report orchestration,
current metric reads, portfolio and company variance analysis, reserve and
pacing diffs, insight scoring, alert-trigger checks, and metrics recording.

This is a high-leverage target because it is already inside an active refactor
branch, has a strong focused test suite, and matches the service extraction
pattern documented in `DECISIONS.md` around route/service boundaries.

## Strategy

The strategy is to finish the active variance extraction first, then use the
resulting pattern for the broader economics and waterfall boundary. This avoids
two concurrent architectural migrations.

The core rule is:

> Preserve public contracts while moving business rules into smaller, named,
> directly testable modules.

`server/services/variance-tracking.ts` should remain the compatibility facade
until all existing route, automation, and test imports can be proven stable. New
modules should sit behind that facade and accept plain inputs where practical.
This gives the refactor a clean rollback path and keeps behavior observable
through existing tests.

## Approaches Considered

### Approach A: Finish Variance Extraction First

This is the recommended path.

Pros:

- Completes the boundary already opened by the current branch.
- Uses existing tests as a safety net.
- Converts private-method reflection tests into direct module tests.
- Produces a repeatable extraction pattern before tackling broader domains.

Cons:

- Does not immediately address the larger fee/economics/waterfall semantic
  drift.
- Requires discipline to keep the first pass behavior-preserving.

### Approach B: Start Fee/Economics/Waterfall Consolidation Now

This is strategically important, but not the next best move.

Pros:

- Addresses a broader domain boundary with known drift in fee bases, waterfall
  semantics, and legacy client calculations.
- Moves toward shared math authority.

Cons:

- Higher business risk.
- More semantic decisions are required before code movement.
- Starting this before finishing variance extraction would leave two
  half-complete migrations.

### Approach C: Broad Cleanup Across Largest Files

This is rejected for now.

Pros:

- Looks efficient on file-size metrics.
- Can reduce visible complexity quickly.

Cons:

- Encourages unrelated edits.
- Weakens reviewability.
- Risks changing behavior without a clear domain proof.

## Recommended Design

### Boundary Model

Keep this public entrypoint stable:

- `server/services/variance-tracking.ts`

Move cohesive internal responsibilities into focused modules under:

- `server/services/variance-tracking/`

The facade should export the same public classes and singleton:

- `BaselineService`
- `AlertManagementService`
- `VarianceCalculationService`
- `VarianceTrackingService`
- `varianceTrackingService`
- `getAttributedKPIs`

The facade can shrink over time, but consumers should not be forced to change
during the first extraction slices.

### First Refactor Slice

Extract reserve and pacing diff logic into a pure module, for example:

- `server/services/variance-tracking/variance-diff.ts`

This module should own:

- finite-number coercion for diffing
- structured metric delta generation
- reserve variance object assembly from current and baseline snapshots
- pacing variance object assembly from current and baseline snapshots

The service should continue to own DB reads for current reserve and pacing
snapshots in the first slice. That keeps the first module pure and limits blast
radius.

### Second Refactor Slice

Extract company and portfolio variance analysis into a focused module, for
example:

- `server/services/variance-tracking/company-variance.ts`

This module should own:

- baseline company snapshot extraction
- current versus baseline company matching
- added, removed, and changed company rows
- valuation alias compatibility fields
- company risk-level classification

DB reads can stay in `VarianceCalculationService` until this module is stable.
After direct tests are in place, DB reads can move behind a small
repository/helper only if that removes real complexity.

### Third Refactor Slice

Move `VarianceCalculationService` itself into:

- `server/services/variance-tracking/calculation-service.ts`

At this point `server/services/variance-tracking.ts` should mostly import and
re-export focused services, instantiate the coordinator, and expose
`getAttributedKPIs`.

This slice should not change route behavior, alert generation behavior, or API
response shapes.

### Fourth Refactor Slice

Clean the variance route after service boundaries are stable:

- `server/routes/variance.ts`

Move response mapping and dashboard assembly into named helpers. Replace
route-level `console.error` calls with the project logger. This should happen
after the calculation service extraction so route cleanup does not obscure
service behavior changes.

### Fifth Refactor Slice

Tighten variance response contracts:

- `shared/variance-validation.ts`

Replace broad `z.any()` fields only where the emitted shape is already
understood and covered by tests. This should be a separate contract-hardening
slice, not part of the initial extraction.

## Testing Strategy

The first proof is existing behavior:

```powershell
npm test -- tests/unit/services/variance-tracking.test.ts
```

Current evidence: 90 tests pass.

Each slice should follow this pattern:

1. Add or preserve characterization tests around current behavior.
2. Extract one cohesive module.
3. Add direct tests for the new module.
4. Keep facade tests passing.
5. Run typecheck before claiming completion.

Minimum gates for the variance extraction:

```powershell
npm test -- tests/unit/services/variance-tracking.test.ts
npm test -- tests/unit/api/variance-tracking-api.test.ts
npm test -- tests/unit/services/variance-alert-automation.test.ts
npm run check
```

Delivery gate before merge:

```powershell
npm run validate:core
```

If formula behavior changes in any later phase, add domain truth-case validation
before merge. The initial variance extraction should not change formulas.

## Stability Rules

- Do not change API response shapes during extraction slices.
- Do not change DB schema.
- Do not change alert semantics.
- Do not move route code and service code in the same commit unless the route
  move is purely mechanical and separately tested.
- Do not start fee/economics/waterfall consolidation until the variance facade
  is stable and tests are green.
- Do not stage unrelated local files such as `.claude/discovery.md` or existing
  untracked plan files.

## Economics And Waterfall Follow-Up

After the variance boundary is stable, the next strategic target is
fee/economics/waterfall consolidation.

That follow-up should start with a no-formula-change boundary slice:

- define one canonical fee-basis vocabulary
- add explicit legacy basis normalization at ingress points
- document unsupported legacy or European waterfall assumptions
- keep client code out of authoritative calculations

This is intentionally sequenced after variance extraction because it carries
more business semantics and requires clearer domain decisions.

## Success Criteria

The strategy succeeds when:

- `VarianceCalculationService` is no longer a large mixed-responsibility body
  inside the facade.
- Private-method reflection tests are replaced or reduced by direct module
  tests.
- `server/services/variance-tracking.ts` is a stable compatibility facade.
- Variance routes and API tests still pass without response-shape drift.
- `npm run check` and `npm run validate:core` are green before merge.
- The resulting pattern can be reused for the fee/economics/waterfall
  consolidation.

## Non-Goals

- No product behavior changes.
- No UI redesign.
- No new dependencies.
- No schema migration.
- No fee/economics formula changes during the variance extraction.
- No broad cleanup across unrelated large files.

## Review Notes

This design intentionally favors a narrow, complete refactor over a broad
cleanup sweep. The goal is not to make every large file smaller immediately. The
goal is to establish one reliable, tested extraction pattern and then apply it
to the next domain boundary.
