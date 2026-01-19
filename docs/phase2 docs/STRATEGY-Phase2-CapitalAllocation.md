---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 2 — Capital Allocation (Docs + Validation) — End‑to‑End Strategy

This package contains everything needed to complete **Phase 2** for the Capital
Allocation module:

- WIP case skeletons (CA‑007 … CA‑020) in `scripts/wip-cases/`
- Merge & Injection utilities to keep **data/logic separated** and **docs
  synced**
- Promptfoo configs (**fast** for local, **final** for CI)
- CI workflow for **job‑level path filters** and **artifact uploads v4**
- PR body template, acceptance checklist, and a Claude Code prompt

## Goals & Success Criteria

- **Truth cases**: Add CA‑007…CA‑020 and merge into
  `docs/capital-allocation.truth-cases.json`.
- **Docs**: Expand `docs/notebooklm-sources/capital-allocation.md` to
  **500–700** lines, include ≥ **15** file:line anchors and ≥ **3** worked
  examples (injected).
- **Validation**: Promptfoo domain score **≥ 90%** (final CI config); artifacts
  uploaded (no volatile results committed).
- **Policy**: ADR‑008 remains the source of truth for negative distributions
  (capital recalls, non‑recyclable).
- **CI**: Docs‑only changes skip heavy tests; docs validation always runs and
  uploads artifacts.

## Workflow

1. Create a branch, e.g., `docs/phase1d-capital-allocation-p2`.
2. Place or edit **WIP** cases in `scripts/wip-cases/` (JSON files).
3. Run utilities:
   ```bash
   node scripts/merge-wip-cases.cjs
   node scripts/inject-case-snippets.cjs
   ```
4. Fast local validation (cheap model):
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   cd scripts/validation
   npx promptfoo@latest eval -c capital-allocation-fast.yaml -o ../../.promptfoo/capital-allocation
   ```
5. Push branch, open PR. CI will run **final** config and upload artifacts.
6. Ensure **≥ 90%** domain score; address gaps; merge.

## Acceptance Checklist

- [ ] CA‑007…CA‑020 are merged & pass Ajv (with `ajv-formats`).
- [ ] Docs at 500–700 lines; ≥ 15 anchors; ≥ 3 worked examples (auto‑injected).
- [ ] Scorer unit tests pass; contradictions penalized.
- [ ] CI uploads Promptfoo artifacts (v4).
- [ ] Domain score ≥ 90% (final CI run).
- [ ] ADR‑008 reviewed/updated only if semantics changed.

For details, see `PR_BODY-Phase2.md` and `CHECKLIST-Phase2.md`.
