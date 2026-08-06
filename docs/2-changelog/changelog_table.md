# Changelog Table

| Version | Week | Commit Message                                                                                             |
| ------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `1.4.1` | 1    | feat(audit): WS1 surface contract matrix - 470-row release-proof surface inventory, validators, G1 tooling |
| `1.4.0` | 1    | feat(current-forecast): pre-soak v2 runtime - shadow wiring, activation latch, resume/re-arm               |
| `1.3.3` | 1    | chore: initialize TRIP workflow                                                                            |

- **Version**: SemVer format in backticks (e.g., `1.0.0`, `0.2.1`)
- **Week**: Project week number. Week 1 = the week when TRIP Init was run
  (anchor Monday 2026-08-03).
- **Commit Message**: One-line description of the change (conventional commits)

# Changelog Summary

- **v1.4.1 (WS1 Surface Contract Matrix - Week 1, 05-08-2026)**:
  - **Audit tooling**: `audit/surface-contract-matrix/` — 470-row surface
    inventory (F_1.2.0 child plan A), seed/inspect/boot-proof/classify/
    validate/render/approve scripts, curated disposition artifacts
  - **CI gate**: `tests/unit/audit/` (23 tests) — exact-set, source-hash,
    fingerprint, discovery, render-determinism, phase-downgrade checks
  - **Zero product change**: no route, schema, or client edits; G1 review
    deliberately open (user gate)
  - **Docs**: CR `docs/3-code-review/CR_w1_v1.4.1.md` (5 rounds, 20 Major
    - 1 Minor findings, all addressed)
- **v1.4.0 (Current-Forecast Pre-Soak Activation Blockers - Week 1,
  04-08-2026)**:
  - **Runtime**: Production shadow triggers at both facts-commit call sites
    (NEW-A), bounded lifecycle timeout, conflict-tolerant failure persistence
  - **Activation**: Latest-decisive-observation gating, one-way activation latch
    (fresh-key 409 / same-key replay 200), resume/re-arm admin command for
    `held` recovery
  - **Architecture**: Serving seam isolates legacy `metricsAggregator` consumers
    (#1325); Neon HTTP transaction fallback; `enable_current_forecast_v2` flag
    retired (DB-mode only)
  - **Docs**: ADR-071, shadow-soak runbook, CR
    `docs/3-code-review/CR_w1_v1.4.0.md`
- **v1.3.3 (TRIP Initialization - Week 1, 04-08-2026)**:
  - **Setup**: Initialized TRIP workflow with docs structure
  - **Documentation**: ARCHI.md already existed (full-stack web architecture);
    ARCHI-rules.md, changelog table, and testing guidelines added
  - **Files Added**: .claude/skills/TRIP-\* and codex-\* skills,
    docs/ARCHI-rules.md, docs/2-changelog/changelog_table.md,
    docs/3-code-review/README.md, docs/4-unit-tests/TESTING.md,
    docs/4-unit-tests/COVERAGE-DEBT.md, docs/TESTING.md

New entries are added at the **top** of each section.
