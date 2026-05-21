---
status: ACTIVE
last_updated: 2026-05-20
---

# DEV_BRAIN.md

Phase-routed AI development for Updog_restore.

## Entry Points

- Claude sessions: `CLAUDE.md`
- Codex sessions: `AGENTS.md`
- Human docs: `docs/INDEX.md`
- Agent routing: `.claude/DISCOVERY-MAP.md`
- Agent directory: `.claude/AGENT-DIRECTORY.md`

Hermes is a routing layer. It does not replace the governance files above.

## Model Co-op Defaults

These defaults apply to Hermes CLI-routed sessions. Direct user instructions and
the model-specific governance files remain authoritative.

| Model       | Default lane                                                |
| ----------- | ----------------------------------------------------------- |
| Claude Code | Planning, architecture briefs, review, docs, risk, handoffs |
| Codex       | Implementation, tests, refactors, lint/typecheck repair     |
| Kimi Code   | Long-context audits, repo-wide scans, large doc synthesis   |

## Phase Routing

| Phase                          | Default               | Handoff Artifact      | Required Gate                                                                                 |
| ------------------------------ | --------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| research                       | Claude                | Implementation brief  | `npm run doctor:quick` plus repo search evidence                                              |
| research long-context sub-path | Kimi                  | Audit memo            | Routed from `research` via `longContextTriggers` or `--kimi`; cite files read and uncertainty |
| production                     | Codex                 | Diff plus tests       | `npm run check` plus targeted tests                                                           |
| production-financial           | Codex plus specialist | Diff plus truth notes | `npm run calc-gate`                                                                           |
| distribution                   | Claude                | PR-ready summary      | `npm run lint` plus relevant tests                                                            |

## Specialist Escalation

- Waterfall/carry/clawback: `waterfall-specialist`
- Precision/rounding/numeric drift: `phoenix-precision-guardian`
- XIRR/fees/cash-flow: `xirr-fees-validator`
- Failing/flaky tests: `test-repair`
- Code review/risk scan: `code-reviewer`
- Root cause/regression: `debug-expert`

## Hard Rules

1. Financial calculation changes require `npm run calc-gate`.
2. Do not create docs that fail the derivability test.
3. Prefer existing agents before inventing new ones.
4. Use the smallest safe diff.
5. Every phase handoff must name the artifact and verification evidence.

## Config

- Routing policy: `.claude/hermes/model-routing.json`
- Hermes identity: `.claude/hermes/SOUL.md`
- CLI: `node orchestrate.js --help`
