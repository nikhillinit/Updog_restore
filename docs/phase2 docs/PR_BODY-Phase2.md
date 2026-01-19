---
status: ACTIVE
last_updated: 2026-01-19
---

## Summary

Phase 2 completes Capital Allocation:

- Added CA‑007…CA‑020 (reserve, pacing, cohorts, integration/recall)
- Expanded docs to ~500–700 lines with ≥15 file:line anchors & ≥10 formulas
- Promptfoo validation (final config) with ≥90% domain score (artifacts
  attached)

## What changed

- `docs/capital-allocation.truth-cases.json`: merged 14 cases from
  `scripts/wip-cases/`
- `docs/notebooklm-sources/capital-allocation.md`: deep dives + **injected**
  examples (CA‑007/009/013/015/020)
- `scripts/merge-wip-cases.cjs`, `scripts/inject-case-snippets.cjs`
- `.github/workflows/docs-validation.yml`: job‑level paths filter + artifacts v4
- `scripts/validation/capital-allocation-{fast,final}.yaml`

## Validation

- Local fast run: Haiku model
- CI final run: Sonnet model
- Artifacts: “promptfoo-results-capital-allocation” in PR checks

## Semantics

- Banker’s rounding (half‑to‑even) documented and applied
- Largest Remainder Method (LRM) with deterministic lexicographic tie‑break
- Negative distributions = capital recalls (non‑recyclable), ADR‑008 is source
  of truth
