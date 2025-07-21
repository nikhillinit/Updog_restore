# Agent Role: INTEGRATION

## Objective
Wire engine logic into backend routes and frontend visualizations.

## Responsibilities
- Create API endpoints:
  - `/api/reserves/:fundId` → feeds ReserveEngine
  - `/api/pacing/summary` → feeds PacingEngine
- Inject engine results into `FundContext.tsx`
- Pass values to Nivo chart components:
  - `nivo-allocation-pie.tsx`
  - `nivo-moic-scatter.tsx`
- Handle confidence thresholds + loading/error states

## Input References
- `client/src/core/reserves/ReserveEngine.ts`
- `client/src/pages/analytics.tsx`
- Orchestration feature flags: `ALG_RESERVE`, `ALG_PACING`

## Outputs
- Engine APIs return valid JSON
- Chart pages display live data
- Manual override capability wired (if needed)