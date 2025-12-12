# Prompt Templates (Phoenix)

> Canonical prompts for repeatable checks and validations. Audience: humans + AI
> agents; used at gates and high-stakes steps.

This document defines **named prompt templates** used across phases, with clear
triggers and required inputs/outputs.

---

## 0. Design Goals

- Make high-stakes prompts:
  - Repeatable
  - Auditable
  - Easy to plug into MCP tools or IDE agents.

- Templates should:
  - Reference concrete artifacts (files, truth cases, reports).
  - Avoid vague instructions ("make it better") in favor of checklists.

---

## 1. Template Catalogue

### 1.1 `WaterfallChecksTemplate`

**Purpose:** Validate waterfall calculations (tier + ledger) against truth cases
and LPA-like semantics before passing Phase 0/1 gates.

**Used In:**

- Phase 0:
  - Step 0.4 / 0.9 – XIRR/Waterfall/Fees cross-validation
- Phase 1B:
  - Post-fix validation for waterfall modules

**Inputs (minimum):**

- Path(s) to truth-case files.
- Paths to implementation files.
- Description of any recent changes.
- Target tolerance (e.g., ±0.000001).

**Skeleton:**

```txt
You are validating venture fund waterfall calculations for GP/LP distributions.

Context:
- Truth cases: {{truth_case_files}}
- Implementation files: {{impl_files}}
- Recent changes: {{change_summary}}
- Required tolerance: {{tolerance}}

Tasks:
1. Explain the intended waterfall semantics (tier + ledger) in plain language.
2. For each truth case, check:
   - LP capital return
   - GP carry
   - Clawback behavior
3. Identify any mismatches (with exact numeric deltas).
4. Classify each mismatch:
   - Implementation bug
   - Truth case issue
   - Assumption mismatch
5. Propose **minimal** code or test changes to fix issues.

Output:
- Short summary of status (PASS / FAIL).
- Table of failed scenarios with root cause.
- Clear next actions.
```

---

### 1.2 `ReserveSizingTemplate`

**Purpose:** Evaluate and explain reserve sizing and follow-on strategies (Phase
2).

**Used In:**

- Phase 2:
  - When tuning reserves logic, MOIC on planned reserves, or graduation
    matrices.

**Inputs:**

- Reserve engine config (JSON).
- Graduation / exit assumptions.
- Target reserve policy goals.

**Skeleton:**

```txt
You are reviewing reserve sizing for a venture capital fund.

Context:
- Reserve engine config: {{reserve_config_path}}
- Graduation / exit assumptions: {{assumptions_summary}}
- Objectives: {{reserve_objectives}}

Tasks:
1. Summarize the current reserve strategy in plain English.
2. Calculate or describe:
   - Expected follow-on reserve ratio.
   - Exit MOIC on planned reserves by company / bucket.
3. Identify weak spots:
   - Under-reserved high-conviction areas.
   - Over-reserved low-conviction areas.
4. Suggest 2–3 alternative reserve policies and explain the trade-offs.
5. Highlight **any** changes that might threaten Phase 0/1 parity.

Output:
- Reserve strategy summary.
- Table of key metrics by allocation / stage.
- Recommended adjustments with reasoning.
```

---

### 1.3 `PortfolioQATemplate`

**Purpose:** Quality assurance pass on portfolio-level outputs (NAV, DPI, TVPI,
MOIC, IRR) and their explanations.

**Used In:**

- Phase 2:
  - Before presenting results to LPs or promoting to production.

- Phase 3+:
  - As part of LP-facing deck/report checks.

**Inputs:**

- Portfolio output dataset (CSV/JSON).
- Key assumptions summary.
- Intended audience (internal / LP / IC).

**Skeleton:**

```txt
You are performing a quality assurance review on a VC fund portfolio forecast.

Context:
- Output data: {{portfolio_output_path}}
- Key assumptions: {{assumptions_summary}}
- Audience: {{audience_type}}

Tasks:
1. Review NAV, DPI, TVPI, gross/net MOIC, and IRR.
2. Check for:
   - Obvious inconsistencies (e.g., TVPI < DPI, negative NAV, etc.).
   - Sudden jumps that may indicate modeling errors.
3. Summarize performance in a way that:
   - Is accurate.
   - Is understandable to the target audience.
4. Identify any places where:
   - An LP might raise questions.
   - Explanations or caveats are needed.
5. Produce 3–5 key messages that could go into an LP update.

Output:
- Brief "sanity check" status (OK / NEEDS REVIEW).
- Bullet list of anomalies or questions.
- Suggested narrative bullets.
```

---

## 2. Phase-Template Matrix

> Quick map from phase to templates.

| Phase | Typical Use                     | Templates                                      |
| ----- | ------------------------------- | ---------------------------------------------- |
| 0     | Truth case parity, waterfalls   | `WaterfallChecksTemplate`                      |
| 1A    | Not template-heavy (mostly TDD) | (Optional) ad-hoc prompts                      |
| 1B    | Waterfall/XIRR fixes validation | `WaterfallChecksTemplate`                      |
| 2     | Reserves & portfolio QA         | `ReserveSizingTemplate`, `PortfolioQATemplate` |
| 3+    | LP / brand passes               | `PortfolioQATemplate` (+ brand checks)         |

---

## 3. Using Templates with Tools

### Example: Calling a Template via an MCP Tool

```bash
# Use multi-AI collaboration with WaterfallChecksTemplate
mcp__multi-ai-collab__collaborative_solve \
  --problem "Validate waterfall-ledger.truth-cases.json scenarios against implementation" \
  --approach "sequential"

# Template variables:
# truth_case_files: docs/waterfall-ledger.truth-cases.json
# impl_files: server/analytics/waterfall-ledger.ts
# tolerance: 0.000001
```

Or, inside an IDE / Claude:

> "Use `WaterfallChecksTemplate` with the current waterfall files and truth
> cases, and show me the failures."

---

## 4. Authoring & Versioning Rules

- Name templates with `TitleCaseTemplate` to keep things consistent.
- Store them here as text skeletons; keep **live** variants in:
  - MCP config, or
  - `.claude/prompts/` directory, if you use one.

When you change a template:

1. Update this file.
2. Note the change in `execution-plan-v2.34.md` if the behavior at a gate
   changes.
3. Optionally add an entry to `version-history.md` for large changes.

---

## 5. Checklist for Adding a New Template

- [ ] Template has a clear, narrow purpose.
- [ ] Inputs are explicit and map to real files / data.
- [ ] Tasks are ordered and verifiable.
- [ ] Output format is clear and easy to diff across runs.
- [ ] Template is referenced in:
  - `execution-plan-v2.34.md` (where it's used), and
  - `.claude/PHOENIX-TOOL-ROUTING.md` (how it's invoked).
