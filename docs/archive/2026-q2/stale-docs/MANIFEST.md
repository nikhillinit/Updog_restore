---
archived: true
archived_on: 2026-05-08
---

# Stale Documentation Archive Manifest

This batch moves stale tracked documentation out of active routing after review
with `node scripts/check-doc-freshness.mjs`.

Documents left active despite freshness warnings:

- Active routing and generated indexes: `.claude/skills/INDEX.md`,
  `docs/skills/SKILLS_INDEX.md`.
- Active governance: `docs/STABILIZATION-ROADMAP.md`,
  `cheatsheets/baseline-governance.md`.
- Domain/institutional memory: NotebookLM Monte Carlo sources and
  `docs/skills/REFL-*`.
- Active historical references that should stay addressable from current docs:
  `cheatsheets/prompt-improver-hook.md`.

## Archived Files

| Original path                                                  | Archived path                                                                                  | Reason                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `.claude/plans/swift-plotting-lemon.md`                        | `docs/archive/2026-q2/stale-docs/claude/plans/swift-plotting-lemon.md`                         | Completed M7 process plan, retained for provenance only.                                |
| `docs/METRICS_LIMITATIONS_MVP.md`                              | `docs/archive/2026-q2/stale-docs/docs/METRICS_LIMITATIONS_MVP.md`                              | Obsolete MVP limitations page with dated Q1/Q2 2026 roadmap claims.                     |
| `docs/analysis/strategic-review-2025-11-27/`                   | `docs/archive/2026-q2/stale-docs/docs/analysis/strategic-review-2025-11-27/`                   | Historical strategic review packet, superseded by Phoenix SOT and later roadmap docs.   |
| `docs/integration/mem0-integration.md`                         | `docs/archive/2026-q2/stale-docs/docs/integration/mem0-integration.md`                         | Superseded implementation summary; current durable record is ADR-019 plus package docs. |
| `docs/plans/2026-03-30-post-stabilization-priorities.md`       | `docs/archive/2026-q2/stale-docs/docs/plans/2026-03-30-post-stabilization-priorities.md`       | Already marked SUPERSEDED; retained as historical context only.                         |
| `docs/plans/2026-03-30-priority-2b-2c-3a-3b-execution-spec.md` | `docs/archive/2026-q2/stale-docs/docs/plans/2026-03-30-priority-2b-2c-3a-3b-execution-spec.md` | Follow-on spec tied to superseded post-stabilization priority draft.                    |
| `docs/queue-observability.md`                                  | `docs/archive/2026-q2/stale-docs/docs/queue-observability.md`                                  | Short stale queue note superseded by current queue config and health-route source.      |
