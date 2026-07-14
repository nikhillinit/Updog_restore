---
status: ACTIVE
last_updated: 2026-07-14
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

## Workflow Modes

- solo: owner only. pair: owner plus reviewer with a bounded repair loop.
- chain: owner plus optional specialist plus reviewer (research reviewer is
  Kimi).
- debate: N comparators plus a synthesis step (roster in model-routing.json
  `debate`; default claude, codex, kimi compare and claude synthesizes). Opt-in
  via `--workflow debate`.
- review: reviews an existing artifact and never re-runs the owner lane.
  Distribution ownership has no reviewer, so distribution review is gate-only by
  design.

## Specialist Escalation

- Waterfall/carry/clawback: `waterfall-specialist`
- Precision/rounding/numeric drift: `phoenix-precision-guardian`
- XIRR/fees/cash-flow: `xirr-fees-validator`
- Failing/flaky tests: `test-repair`
- Code review/risk scan: `code-reviewer`
- Root cause/regression: `debug-expert`

## Plan Review Gate (added 2026-07-14, REFL-039)

Before any production-phase dispatch, the plan artifact passes a cross-model
review gate:

1. Claude writes the wave/implementation plan pinned to source-verified facts.
2. Codex reviews the plan (`codex exec`, read-only, plan file as the brief) and
   returns comments.
3. Claude independently assesses each comment's validity against the sources —
   accept with evidence or reject with evidence, never blind adoption — and
   amends the plan.
4. Only the finalized, reviewed plan dispatches to Codex for implementation.

Role assignments (plan = Claude, implement = Codex, review = Claude) change only
by explicit owner decision. Transport failures get transport fixes, never role
swaps (REFL-039).

## Lane Hygiene (added 2026-07-14, REFL-039)

Transport rules for Hermes lane dispatch, one per observed 2026-07-13 failure:

1. Invoke `node orchestrate.js --phase production` directly (npm shim can 126).
2. Keyword-light `--task` string; payload details go in a temp-file brief
   pointer (multi-line payloads mangle; financial keywords self-classify).
3. Unique launcher script per run; kill the prior orchestrate process tree
   before relaunch; purge >6h orphaned node/cmd processes after runs (orphan
   accumulation caused the 2026-07-13 OOM).
4. ONE lane at a time while free RAM < 4 GB; no detached lane stacking.
5. Long-running dispatch = a single synchronous background invocation, never
   nohup+poll; long CLI calls run inside subagent synchronous Bash, not
   session-level background tasks.
6. Hermes postflight verifies only `npm run check` — the review phase reruns
   targeted and full test suites independently.
7. Degraded-environment vitest: client project runs use `--maxWorkers=1`; write
   outputs to files, never pipe through `tail`.

## Hard Rules

1. Financial calculation changes require `npm run calc-gate`.
2. Do not create docs that fail the derivability test.
3. Prefer existing agents before inventing new ones.
4. Use the smallest safe diff.
5. Every phase handoff must name the artifact and verification evidence.
6. Plan Review Gate and Lane Hygiene (above) are mandatory for production-phase
   dispatches.

## Config

- Routing policy: `.claude/hermes/model-routing.json`
- Hermes identity: `.claude/hermes/SOUL.md`
- CLI: `node orchestrate.js --help`
