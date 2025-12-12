> **DEPRECATED - 2025-12-11** This document has been superseded by
> `docs/PHOENIX-SOT/execution-plan-v2.34.md`. Kept for provenance only. Do
> **not** use for planning, agent invocation, or workflow execution. For current
> execution guidance, see:
> [docs/PHOENIX-SOT/README.md](../PHOENIX-SOT/README.md)

---

# PHOENIX STRATEGY v3.0: Evidence-Driven Incremental Modernization

**Date:** 2025-11-30 **Status:** Active

**Supersedes (for Phoenix execution details):**

- `PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md`
- `docs/analysis/strategic-review-2025-11-27/04-PHOENIX-STRATEGY-ANALYSIS.md`

---

## 0. Executive Summary

Phoenix v3.0 is a reset of the original Phoenix plan based on the **actual**
state of the repo:

- MOIC / portfolio-lot logic **already exists in the codebase** (multiple files)
  and is not blocked on any pending PR.
- A production-grade **TypeScript baseline system**
  (`scripts/typescript-baseline.cjs` + `.tsc-baseline.json`) already exists.
- The Windows **Sidecar** (`tools_local` + junction scripts) is a
  **developer-experience / complexity** bottleneck, not the primary cause of
  TypeScript errors.
- pnpm is an **unproven optimization** in this context, not a guaranteed win and
  not a prerequisite for delivering value.

Phoenix v3.0 pivots from:

> "Big infrastructure bet to reduce TS errors and then ship features"

to:

> "Ship value (IA, wizard, MOIC) on top of a contained TS baseline, and only
> adopt pnpm/sidecar removal if a short, time-boxed experiment proves it's worth
> it."

The core principles are:

1. **Code is truth.** Decisions are based on measured behavior, not assumptions.
2. **Baseline before heroics.** We accept the current TS error baseline and
   prevent regression using existing tooling.
3. **Features first.** IA consolidation and the modeling wizard move forward
   regardless of infra outcome.
4. **Validation before migration.** pnpm is validated with a short spike before
   any migration work.

---

[Rest of original content continues unchanged...]
