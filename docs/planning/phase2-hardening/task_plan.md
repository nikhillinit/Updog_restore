---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 2 Hardening: Task Plan

## Session Metadata
- Start Time: 2026-01-18
- Baseline: PR447 merged (path validation guardrails)
- Status: IN PROGRESS

## Goal
Harden the Reflection System with CI gates, portable tooling, wizard routing, and coverage visibility.

## Phases

| # | Phase | Status | Notes |
|---|-------|--------|-------|
| 0 | Validate post-PR447 state | complete | validate() confirmed working |
| 1 | CI Gates (2.3) | complete | Created reflection-validate.yml |
| 2 | Portable Tooling (2.1) | complete | npm scripts: reflection:new/check/rebuild/validate |
| 3 | Wizard Routing (2.4) | complete | wizard-index command + vocabulary validation |
| 4 | Test Scaffolding (2.2) | complete | Interactive prompts + enhanced test stub |
| 5 | Coverage Metrics (2.5) | complete | metrics command + health score |

## Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Doc structure | 3-file pattern | Per planning-with-files skill |
| CI approach | Standalone workflow | Path filtering doesn't work in ci-unified.yml jobs |
| PyYAML in CI | Install explicitly | Fallback parser is lossy; CI needs strict validation |
| Pre-commit strategy | Option A (Doc update) | Lower risk; CI catches issues, no local hook complexity |

## Risks
| Risk | Mitigation |
|------|------------|
| CI false positives | Narrow path triggers |
| Silent doc drift | Enforce via CI, not just docs |

## Open Questions
- [ ] What commands does manage_skills.py currently support?
- [ ] What's the canonical wizard step vocabulary?
