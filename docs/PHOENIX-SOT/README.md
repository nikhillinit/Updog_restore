---
status: ACTIVE
audience: both
last_updated: 2025-12-14
categories: [phoenix, validation, vc-modeling]
keywords: [phoenix, truth-case, xirr, waterfall, fees, capital, forecasting]
source_of_truth: true
phase: "1B"
phase2_docs: "COMPLETE"
agent_routing:
  priority: 1
  route_hint: "Entry point for all Phoenix project work."
  use_cases: [phoenix_validation, vc_modeling]
maintenance:
  owner: "Phoenix Team"
  review_cadence: "P30D"
---

# Phoenix SOT (Source of Truth) Hub

> Start here for any work on the VC fund modeling, forecasting, validation, and
> branding system. This directory defines the **living execution spec** for
> Phoenix.

**Current Status:**
- Phase 1B: Fees 10/10, Waterfall-Ledger 14/14 validated
- Phase 2 Documentation: COMPLETE (Nov 6, 2025) - 85K words, 22 files

---

## 1. What Lives Here

- **Execution Plan**
  - `execution-plan-v2.34.md` Canonical description of phases, steps, gates, and
    agent/skill usage.

- **Domain Knowledge (NotebookLM Sources)**
  - `../notebooklm-sources/` (22 files, ~85K words) - Canonical domain truth
  - Phase 1: XIRR, Waterfall, Fees, Capital Allocation, Exit Recycling
  - Phase 2: ReserveEngine, PacingEngine, CohortEngine, Monte Carlo
  - `../notebooklm-sources/PHASE2-COMPLETE.md` - Phase 2 completion summary

- **Skill System**
  - `skills-overview.md` Single reference for all skills (Phoenix-specific,
    cross-cutting, situational, v2.34 additions).

- **Tool Routing**
  - `.claude/PHOENIX-TOOL-ROUTING.md` (in repo root) Task/file → agent/skill
    routing rules for Claude and other AI agents.

- **Integration Appendices** (recommended)
  - `mcp-tools-guide.md` How MCP servers and external tools (e.g.,
    TaskMaster-style agents, NotebookLM, multi-AI helpers) plug into each phase.
  - `prompt-templates.md` Waterfall checks, reserve sizing, portfolio QA
    templates and how to apply them at gates.
  - `workflows-and-ci.md` Mapping from Phoenix gates to GitHub Actions workflows
    (tests, performance, code quality).

- **Brand & UX**
  - `brand-bridge.md` Short text SOT connecting Press On Ventures brand
    guidelines to Phase 3+ work.
  - `/docs/brand/PressOnVentures-Guideline.pdf` (or equivalent path) The actual
    brand guideline PDF (fonts, colors, logo safe zones).

---

## 2. Quick Start

### For Humans (Dev / PM / Analyst)

1. **Understand the Plan**
   - Read the Executive Summary and Phase tables in `execution-plan-v2.34.md`.
2. **Find Your Phase**
   - Are you validating calculations (Phase 0), cleaning up (1A), fixing bugs
     (1B), building forecasting (2), or polishing branding (3+)? Jump to that
     section in the execution plan.
3. **Check Skills & Tools**
   - Open `skills-overview.md` and `.claude/PHOENIX-TOOL-ROUTING.md` to see
     which agents/skills should activate for your work.
4. **Wire CI / Workflows**
   - If you're touching tests, pipelines, or gates, consult
     `workflows-and-ci.md`.

### For AI Agents / IDE Integrations

When starting a session in this repo, **always load**:

1. `docs/PHOENIX-SOT/execution-plan-v2.34.md`
2. `docs/PHOENIX-SOT/skills-overview.md`
3. `.claude/PHOENIX-TOOL-ROUTING.md`

Then:

- Choose agents/skills based on the routing rules.
- Respect phase gates and success criteria from the execution plan (truth case
  pass rates, brand checks, etc.).

---

## 3. Phase Map (High-Level)

This mirrors the plan but keeps it lightweight.

- **Phase 0: Truth & Parity**
  - Validate XIRR, waterfalls, fees, capital allocation, exit recycling using
    JSON truth cases.
  - Decide Phase 1 path (1A, 1B, or 1C) based on pass rates.

- **Phase 1A: Cleanup & Precision**
  - Remove precision hazards (e.g., `parseFloat`), clean up calculations, sync
    docs.
  - No behavioral changes without explicit evidence.

- **Phase 1B: Bug Fix Path**
  - When thresholds fail, systematically debug and fix priority issues.
  - Use structured bug workflows and regression tracking.

- **Phase 2: Advanced Forecasting (Living Model)**
  - Implement graduation logic, MOIC suite, reserves optimization, and Monte
    Carlo.
  - **Hard constraint:** Phase 2 must never degrade Phase 1 truth-case pass
    rates.

- **Phase 3+: Brand & UI**
  - Apply Press On Ventures branding to dashboards and LP reports.
  - Use brand gate criteria (typography, color palette, logo safe zones).

---

## 4. SOT Relationships

Think of this directory as a small dependency graph:

```text
execution-plan-v2.34.md
  ├─ uses → skills-overview.md
  ├─ uses → .claude/PHOENIX-TOOL-ROUTING.md
  ├─ references → mcp-tools-guide.md
  ├─ references → prompt-templates.md
  └─ references → workflows-and-ci.md

brand-bridge.md
  └─ references → /docs/brand/PressOnVentures-Guideline.pdf
```

When making changes:

- Update the **plan** first (`execution-plan-v2.34.md`).
- Reflect skill/tool changes in:
  - `skills-overview.md`
  - `.claude/PHOENIX-TOOL-ROUTING.md`

- If you touch branding:
  - Update `brand-bridge.md` and ensure Phase 3 gates still map cleanly to the
    PDF.

---

## 5. Versioning & Deprecation

- v2.34 is expected to supersede v2.33 as the **active execution spec**.
- Older plans should:
  - Move under `../archive/phoenix/`
  - Get a standard deprecation banner at the top:
    - "DEPRECATED — superseded by `docs/PHOENIX-SOT/execution-plan-v2.34.md`…"

For detailed historical context (e.g., how the agent and command system
evolved), see the v2.33 version history section.

### Deprecated: Phoenix v3.0 Infrastructure Track

Phoenix v3.0 (infrastructure modernization) was abandoned in favor of the
validation-first approach in v2.34. Infrastructure goals (pnpm migration,
sidecar removal, TS baseline cleanup) were NOT executed.

**Archived Documents:**

- `docs/archive/phoenix/v3.0/HANDOFF-PHOENIX-PHASE1-2025-11-30.md`
- `docs/archive/phoenix/v3.0/KICKOFF-PHOENIX-PHASE1-2025-11-30.md`
- `docs/archive/phoenix/PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md`
- `docs/archive/phoenix/PHOENIX-PLAN-2025-11-30.md`

**What was executed:** Wizard Step 4 work (PR #227 - active as of Dec 1, 2025)
**What was NOT executed:** pnpm migration, sidecar removal, TS baseline cleanup

---

## 6. Checklist for a "Good Citizen" Change

Before merging a meaningful change:

- [ ] Phase impact identified (0 / 1A / 1B / 2 / 3+).
- [ ] Truth cases updated or explicitly confirmed unaffected.
- [ ] Skills / agents aligned with `.claude/PHOENIX-TOOL-ROUTING.md`.
- [ ] Execution plan updated **if** behavior or gates changed.
- [ ] Brand impact considered **if** user-facing output changed.
- [ ] CI workflows updated **if** a new gate or test category was introduced.
