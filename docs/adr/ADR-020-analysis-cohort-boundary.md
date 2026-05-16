# Analysis Cohort Boundary

Analysis Cohort logic belongs in `shared/core/cohorts/analysis/` so both server
routes and client shims use the same semantics. The existing `CohortEngine`
public surface remains stable for now and is treated as the Exit Cohort Model
surface, because projected economics already depend on it and renaming it would
expand this remediation beyond route reachability, shared boundary cleanup, and
API contract alignment.

## Considered Options

- Move Analysis Cohort logic to shared and keep the legacy public symbol stable.
- Merge Analysis Cohort logic into the existing `CohortEngine` surface.
- Rename the existing `CohortEngine` surface immediately.

## Consequences

Future cohort work must distinguish **Cohort Analysis** from the **Exit Cohort
Model**. Server code must not import Analysis Cohort domain logic from
`client/src`.
