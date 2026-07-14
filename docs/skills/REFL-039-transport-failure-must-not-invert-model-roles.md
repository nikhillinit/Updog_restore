---
type: reflection
id: REFL-039
title: Transport failure must not invert model roles
status: VERIFIED # VERIFIED | DRAFT | DEPRECATED
date: 2026-07-14
version: 1
severity: high
wizard_steps: []
error_codes: []
components: [orchestration, hermes, agents]
keywords:
  [
    hermes,
    codex,
    model-co-op,
    lane-hygiene,
    orchestration,
    plan-review,
    role-inversion,
    oom,
  ]
test_file: tests/regressions/REFL-039.test.ts
superseded_by: null
---

# Reflection: Transport failure must not invert model roles

## 1. The Anti-Pattern (The Trap)

**Context:** The repo's model co-op contract (DEV_BRAIN.md) assigns Claude to
planning/review and Codex to implementation, routed via Hermes. On 2026-07-13
the lane TRANSPORT degraded — orphaned node/cmd processes accumulated across the
July 6-12 lane sessions until the box hit OOM, client vitest worker pools hung,
session-level background Bash tasks were killed, the Hermes npm shim exited 126,
and multi-line `--task` payloads were mangled. The response conflated two
independent things: the transport (broken) and the role assignments (fine). The
workaround that emerged — Claude subagents implementing, Codex demoted to
adversarial reviewer — was an ad-hoc role INVERSION. It was then recorded in the
session handoff as "proven machinery" and propagated to the next sessions as if
it were ratified architecture.

**How to Recognize This Trap:**

1.  **Signal:** A handoff or memory entry describes a workflow deviation as
    "proven" based on a single session's operational constraint, with no
    ratification record and no note marking it provisional.
2.  **Pattern:** An infrastructure failure (process leaks, shims, payload
    limits) is "fixed" by reassigning WHO does the work rather than repairing
    HOW the work is dispatched.
3.  **Mental Model:** "The lane failed, so the lane's owner model must be the
    wrong choice." Transport reliability and model-role fit are independent
    variables; July 13 provided evidence only about the former. Plans 1-8 had
    all landed under the original role split.

**Impact:** Silent architecture drift. The owner's standing contract (plan =
Claude, implement = Codex, review = Claude) was inverted for three waves without
an explicit decision, and each successive handoff hardened the deviation. The
cost of correcting compounds with every wave shipped under the inverted flow.

> **DANGER:** Do NOT respond to lane/dispatch failures by swapping implementer
> and reviewer roles. Fix the transport; keep the roles.

## 2. The Verified Fix (The Principle)

**Principle:** Separate transport hardening from role assignment. Roles change
only by explicit owner decision; transport failures get transport fixes.

**The restored, hardened flow (ratified by owner 2026-07-14):**

1.  **Claude plans.** Wave spec pinned to independently verified facts
    (contracts read from source, not recon-agent paraphrase).
2.  **Codex reviews the plan** (`codex exec`, read-only, plan file as brief).
    Codex returns comments; Claude independently assesses each comment's
    VALIDITY against the sources (accept with evidence / reject with evidence —
    never blind adoption, mirroring superpowers:receiving-code-review) and
    amends the spec. Only the finalized, reviewed plan dispatches.
3.  **Codex implements** via Hermes production phase under the Lane Hygiene
    rules below.
4.  **Claude reviews.** Hermes postflight is only `npm run check`, so the review
    stage MUST independently rerun targeted + full test suites, scope diff
    (three-dot vs origin/main), design-compliance greps over added lines, and
    the pre-push floor (relevant integration flow +
    `UPDOG_RELEASE_CHECK_SKIP_DB=1 npm run release:check` for UI waves). A
    ready-to-run landing prompt is written to the artifacts dir at each gate so
    the close survives session death.

**Lane Hygiene (transport fixes for every observed 2026-07-13 failure mode):**

| Failure observed                                | Transport fix                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| npm shim exit 126                               | Invoke `node orchestrate.js --phase production` directly, never the npm wrapper                 |
| `--task` mangling / keyword self-classification | Keyword-light task string + temp-file BRIEF pointer                                             |
| Orphaned node/cmd -> OOM                        | Unique .ps1 per run; kill the orchestrate process tree before relaunch; purge >6h orphans after |
| Stacked lanes -> memory pressure                | ONE lane at a time; no detached stacking while free RAM < 4 GB                                  |
| Foreground 10m cap                              | Single synchronous background call (one wsl/Start-Process invocation), never nohup+poll         |
| vitest worker-pool hangs                        | Client runs `--maxWorkers=1` while degraded; write output to files, never pipe through `tail`   |
| Background Bash kills                           | Long CLI calls run inside subagent synchronous Bash, not session-level background tasks         |

## 3. Evidence

- **Test Coverage:** `tests/regressions/REFL-039.test.ts` — a docs-integrity
  guard asserting DEV_BRAIN.md retains the Plan Review Gate and Lane Hygiene
  sections (the enforcement surfaces this reflection added). Pruning either
  section fails the test and points here.
- **Validation:** Plans 1-8 landed via the original role split (Hermes ->
  Codex). The 2026-07-13 failure was environmental (orphan accumulation -> OOM),
  not role-related; wave 9B1's code was complete and green before the session
  died mid-landing. Restoring roles with hardened transport addresses the actual
  root cause; the inverted flow addressed a symptom.
- **Related:** REFL-034 (subagent fabrication — why the Claude review stage
  independently reruns everything), auto-memory
  `feedback_lane_dispatch_process_hygiene`, DEV_BRAIN.md (Plan Review Gate, Lane
  Hygiene).
