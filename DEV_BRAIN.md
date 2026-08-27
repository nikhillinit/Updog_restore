---
status: ACTIVE
last_updated: 2026-08-26
---

# DEV_BRAIN.md

Phase-routed AI development for Updog_restore.

## Entry Points

- Claude sessions: `CLAUDE.md`
- Codex sessions: `AGENTS.md`
- All model/harness sessions: `AGENT-SAFETY.md` before branch, Git-state, CI,
  security, or financial-allocation work
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

## Sophistication Tiers (added 2026-07-28)

Tier is an orthogonal axis composed with phase routing: phase decides roles,
artifacts, and gates; tier decides which model fills the owner slot (after
`--model` overrides and long-context routing, both of which still take
precedence) and how much review fires. Explicit `--tier` wins; otherwise
weighted keyword scoring per tier is used; absent any match the fallback is T1.
Financial specialist risk always promotes to T3 and cannot be overridden
downward.

| Tier | Meaning  | Owner model (research / production / distribution) | Review                                                                     |
| ---- | -------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| T0   | trivial  | qwen / sol / qwen                                  | none                                                                       |
| T1   | standard | claude / codex / claude (phase defaults)           | no automatic review; existing `--workflow` behavior                        |
| T2   | complex  | claude / sol / claude                              | MOA: all surviving reviewers must approve                                  |
| T3   | critical | claude / sol / claude                              | MOA-strict: >=3 reviewers, >=2 approvals, zero degradation (today: 2-of-3) |

MOA review rules:

- Reviewers see only the task and artifact, each with a distinct lens. They
  return a schema-validated JSON findings report; malformed or free-text output
  is treated as an error vote.
- Approval is decided by code from the verdict votes, never by the aggregator.
  The aggregator (`sol`) narrates merged findings only when the round is not
  approved.
- `moa` uses the `reviewers` panel (`terra`/correctness, `luna`/spec-compliance,
  `qwen`/simplicity-efficiency). `moa-strict` uses the independent
  `strictReviewers` panel (`terra`/correctness, `luna`/spec-compliance,
  `claude`/numeric-precision). The panels are decoupled; editing one never
  changes the other's count or quorum.
- Every reviewer entry is shape-validated (non-empty model and lens) before any
  reviewer is spawned. `moa` requires at least 2 configured reviewers;
  `moa-strict` requires at least 3. Reviewer errors are isolated, and even the
  stringification of a rejection value is wrapped in try/catch so no payload can
  crash the whole panel.
- Degraded fan-in is loud in T2 (stderr warning; surviving reviewers decide) and
  fails closed in T3 (repair loop breaks immediately with zero repair attempts,
  though audit and gate steps still run before the final exit code reflects the
  unapproved review).
- The repair loop deduplicates findings by file:line:claim and compares them to
  the immediately preceding round only. If MOA is the sole rejector and produces
  no new keys after at least one repair round, the loop exits to avoid a dry
  loop.
- The MOA review step is skipped for `review` and `debate` workflows (no owner
  artifact to review). `review: none` also suppresses the regular reviewer step.
- T2/T3 production dispatches auto-upgrade to a live `pair` workflow unless the
  caller already passed `--dry-run`, `--json`, or an explicit `--workflow`, so
  the mandated review actually gates the run.
- Anchor precedence is unchanged: gates, tests, and Phoenix truth cases outrank
  any model verdict.

Model lanes:

- `sol`, `luna`, and `terra` are gpt-5.6 variants dispatched through the Codex
  CLI (`-m gpt-5.6-*`). `luna` and `terra` run read-only sandboxes; `sol` runs
  with full access as the implementer/aggregator lane.
- `qwen` is the local Ollama lane (`ollama run qwen3.6:latest`) and is the
  quota-free T0 lane. It has no tool-use loop, so it is used for text-only
  research/distribution tasks, not for production implementation.
- `agy` is a manual-override lane that requires its prompt as a CLI argument.
- `promptDelivery` selects how the prompt is delivered: `stdin` (default) or
  `argument` (agy). On Windows, shell mode is enabled only for `stdin` delivery,
  preventing prompt metacharacters from being reinterpreted by cmd.exe.
- `unsetEnv` strips named environment variables before spawning (used by `kimi`
  to avoid inherited `PYTHONPATH`/`PYTHONHOME` interpreter conflicts).
- Every spawned model process and gate runs with `cwd` pinned to the repository
  root workspace; the generated prompt also instructs the model to set its
  tool-use cwd to the same workspace.

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
3. Relaunch cleanup is automated: before live dispatch, `orchestrate.js` checks
   its PID file, kills a live prior process tree, and records its current PID.
   Periodic >6h orphaned Node-process sweeps remain manual and separate because
   relaunch cleanup runs only on the next invocation, not on a timer.
4. Long-running dispatch = a single synchronous background invocation, never
   nohup+poll; long CLI calls run inside subagent synchronous Bash, not
   session-level background tasks.
5. Hermes postflight verifies only `npm run check` — the review phase reruns
   targeted and full test suites independently.
6. Degraded-environment vitest: client project runs use `--maxWorkers=1`; write
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
