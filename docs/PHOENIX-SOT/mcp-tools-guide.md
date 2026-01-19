---
status: ACTIVE
last_updated: 2026-01-19
---

# MCP Tools Integration Guide (Phoenix)

> How external tools and MCP servers plug into the Phoenix execution plan.
> Audience: humans + AI agents / IDE integrations.

This guide extends `execution-plan-v2.34.md` and
`.claude/PHOENIX-TOOL-ROUTING.md` by describing **when** and **how** to use each
MCP server or external AI tool in the Phoenix workflow.

---

## 0. Scope & Principles

- External tools must:
  - Respect phase gates and truth-case constraints.
  - Never silently override the deterministic engine or truth cases.
  - Prefer **explanation + artifacts** (reports, JSON, diffs) over opaque
    decisions.

- This guide defines:
  - Available MCP servers / integrations.
  - Phase-by-phase integration points.
  - Safety & provenance rules.

---

## 1. MCP Servers & External Tools Overview

| Name / Server        | Type          | Capabilities (High-Level)                                        | Typical Use Cases                               |
| -------------------- | ------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `taskmaster-ai`      | MCP server    | Task decomposition, project complexity analysis, autopilot flows | Phase 0 planning, 1A/1B automation              |
| `multi-ai-collab`    | MCP server    | Debate, ensemble, and consensus across multiple AI models        | Cross-validation at tricky gates                |
| `notebooklm`         | External tool | Question-answering over uploaded docs, provenance checks         | Truth case provenance, Excel/web parity context |
| `ai-code-review`     | MCP server    | Static analysis, PR review, style / safety checks                | Phase 0/1A/1B code review gates                 |
| `research-assistant` | MCP / HTTP    | Web research / literature review (Perplexity-style)              | Market context, benchmarking, non-core logic    |

> **NOTE:** Keep this table in sync with your MCP registry / configuration files
> (`.claude/settings.local.json`).

---

## 2. Phase-by-Phase Integration

### 2.1 Phase 0 — Truth & Parity

**Goals:**

- Validate XIRR, waterfall, fees, capital allocation, exit recycling against
  JSON truth cases and Excel parity.
- Decide path (1A, 1B, 1C).

**Recommended MCP usage:**

- `taskmaster-ai`:
  - Use `expand_task` / `initialize_project` to break Phase 0 steps into
    concrete subtasks.
  - Use `analyze_project_complexity` to estimate work per module.

- `multi-ai-collab`:
  - For ambiguous truth-case failures, call `ai_debate` / `ask_all_ais` with:
    - Problem description.
    - Relevant truth cases.
    - Current implementation notes.

- `notebooklm`:
  - Use `ask_question` over:
    - Excel model notes.
    - Historical analysis docs.
    - Tactyc / benchmarking docs.
  - Focus on **provenance** (e.g., "Where did this waterfall scenario come
    from?").

---

### 2.2 Phase 1A — Cleanup & Precision

**Goals:**

- Remove precision hazards, tidy code, sync docs, no behavioral changes without
  evidence.

**Recommended MCP usage:**

- `ai-code-review`:
  - Hook into:
    - parseFloat eradication patches.
    - Decimal.js configuration changes.
    - Documentation updates (JSDoc + `calculations.md`).
  - Require a clean report before closing key 1A steps.

- `taskmaster-ai`:
  - Use for time-boxed TDD microsteps:
    - Generate small, 2–5 minute subtasks around each refactor.
    - Track completion / remaining tasks.

---

### 2.3 Phase 1B — Bug Fix Path

**Goals:**

- Identify and fix substantive defects in calculation logic; preserve and
  improve pass rates.

**Recommended MCP usage:**

- `taskmaster-ai`:
  - Use for structured bug workflow:
    - Classify bug → decompose fix plan → schedule regression tests.

- `ai-code-review`:
  - Mandatory on:
    - Changes to XIRR, waterfalls, fees, capital allocation, exit recycling
      modules.
    - Changes that may affect truth-case semantics.

- `multi-ai-collab`:
  - Use `collaborative_solve` for especially complex multi-module bugs.
  - Consider `openai_think_deep` / `gemini_think_deep`-style tools where
    available.

---

### 2.4 Phase 2 — Forecasting & Reserves (Living Model)

**Goals:**

- Implement graduation logic, MOIC suite, reserves optimization, Monte Carlo.
- Never regress Phase 0/1 correctness.

**Recommended MCP usage:**

- `multi-ai-collab`:
  - `ai_debate` on:
    - Graduation matrix design.
    - Reserve allocation policies.
    - Interpretation of Tactyc-style sector / allocation assumptions.

- `research-assistant`:
  - Use to pull:
    - Market benchmarks.
    - Typical graduation / exit rates.
    - Industry reserve sizing norms.

- `notebooklm`:
  - Cross-check conceptual assumptions against:
    - Internal whitepapers.
    - Tactyc and other platform docs.
    - Your own prior modeling notes.

> **Guardrail:** Any suggestion from external tools must be "compiled" into
> truth cases / deterministic checks before being accepted into the engine.

---

### 2.5 Phase 3+ — Brand & Presentation

**Goals:**

- Ensure LP-facing outputs meet Press On Ventures brand standards and narrative
  requirements.

**Recommended MCP usage:**

- `ai-code-review` (UI / brand mode):
  - Check that:
    - Brand tokens (colors, fonts) are consistent.
    - Critical numbers (IRR/MOIC/etc.) are the same as backend calculations.

- `research-assistant`:
  - Optional: gather examples of benchmark LP reports for framing / storytelling
    inspiration.

---

## 3. Tool Invocation Patterns

### 3.1 TaskMaster-Style Invocations

```bash
# Decompose Phase 0 truth-case work
mcp__taskmaster-ai__expand_task \
  --taskId "phase0-truth-validation" \
  --num 10

# Initialize project tracking
mcp__taskmaster-ai__initialize_project \
  --projectRoot "c:/dev/Updog_restore"

# Start autopilot TDD workflow
mcp__taskmaster-ai__autopilot_start \
  --taskId "1" \
  --projectRoot "c:/dev/Updog_restore"
```

### 3.2 Multi-AI Collaboration

```bash
# Debate a tricky waterfall edge case
mcp__multi-ai-collab__ai_debate \
  --topic "Should waterfall L08 clawback use shortfall-based or distribution-based logic?" \
  --ai1 "gemini" \
  --ai2 "openai"

# Get consensus on XIRR edge case
mcp__multi-ai-collab__ai_consensus \
  --question "Is XIRR scenario 07 expected to converge or return null?" \
  --options "converge to -99.9%, return null as non-computable"
```

### 3.3 NotebookLM / Provenance Validation

```bash
# Ask about origin of a particular truth case
# (NotebookLM typically used via web UI, not CLI)
# Upload: docs/excel-model-notes/, docs/tactyc-research/
# Query: "Why does truth case W14 assume a 50% exit rate at Series C?"
```

---

## 4. Safety, Provenance & Audit Trail

- All external tool outputs that influence **behavior** must:
  - Be captured as:
    - Truth cases, or
    - Config parameters under version control.

  - Be referenced in:
    - Phase-specific validation reports (e.g.,
      `docs/phase0-validation-report.md`).

- For each major decision, log:
  - Tool name / version.
  - Prompt / parameters (sanitized if needed).
  - Resulting changes (links to commits/tests).

---

## 5. Implementation Checklist

- [ ] MCP servers configured and accessible from the repo environment.
- [ ] This guide cross-linked from `execution-plan-v2.34.md`.
- [ ] `.claude/PHOENIX-TOOL-ROUTING.md` updated to reflect these tools.
- [ ] Phase-specific examples verified against your actual CLI / API syntax.
- [ ] A minimal "dry run" performed per phase to validate connectivity and
      safety.
