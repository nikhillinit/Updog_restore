---
status: ACTIVE
audience: agents
last_updated: 2025-12-12
owner: "Platform Team"
review_cadence: P30D
categories: [discovery, agents, routing]
keywords: [discovery-map, routing, capability-discovery, decision-tree]
---

# DISCOVERY-MAP (Agent-Facing)

## Mission

Prevent re-implementation by routing agents to existing assets first.

**Two-layer discovery:**
- Humans use: `docs/INDEX.md`
- Agents use: this file

**Machine-readable index:** `docs/_generated/router-index.json`
- Generated from: `docs/DISCOVERY-MAP.source.yaml`
- Regenerate: `npm run docs:routing:generate`

## Global Rule: CAPABILITIES-First

If a task sounds like "build / implement / add / create", check `CAPABILITIES.md` FIRST.

---

# 1. Pattern-Based Routing (Fast Path)

Pattern matching uses OR logic: any match triggers the route.

| Query Pattern | Route To | Why |
|---|---|---|
| "implement feature" OR "new agent" OR "add tool" | CAPABILITIES.md | Check existing solutions before building |
| "phoenix" OR "truth case" OR "validation" | docs/PHOENIX-SOT/README.md | Phoenix workflows entry point |
| "phase 2" OR "monte carlo" OR "probabilistic" | /phoenix-phase2 command | Phase 2 workflow |
| "expectation mode" OR "deterministic parity" | /phoenix-phase2 command | Expectation Mode in command |
| "distribution table" OR "mc report" | /phoenix-prob-report command | Format Monte Carlo output |
| "test failing" OR "fix tests" | /phoenix-truth + cheatsheets/pr-merge-verification.md | Baseline comparison |
| "precision" OR "parseFloat" OR "Decimal" | phoenix-precision-guardian agent | Numeric drift |
| "clawback" OR "ledger waterfall" OR "carry" | waterfall-specialist agent | Waterfall semantics |
| "capital allocation" OR "exit recycling" | phoenix-capital-allocation-analyst agent | Allocation module |
| "fees" OR "irr" OR "xirr" | xirr-fees-validator agent | XIRR/fees owner |
| "reserves" OR "pro-rata" OR "ownership" | phoenix-reserves-optimizer agent | Reserve allocation |
| "graduation" OR "moic" OR "forecasting" | phoenix-probabilistic-engineer agent | Phase 2 probabilistic |
| "brand" OR "styling" OR "dashboard layout" | phoenix-brand-reporting-stylist agent | Brand consistency |
| "docs sync" OR "jsdoc" OR "calculations.md" | phoenix-docs-scribe agent | Documentation sync |
| "deploy" OR "production" OR "rollout" | docs/workflows/PRODUCTION_SCRIPTS.md | Deployment docs |
| "workflow" OR "ci" OR "github actions" | docs/workflows/README.md | CI/CD docs |
| "architecture" OR "decision" OR "why" | DECISIONS.md | ADR rationale |
| "change history" OR "what changed" | CHANGELOG.md | Chronological changes |
| "error" OR "debug" OR "troubleshoot" | SIDECAR_GUIDE.md | Platform issues |
| "module not found" OR "typescript" OR "path" | SIDECAR_GUIDE.md | TS/module resolution |

---

# 2. Phoenix Agent Quick Reference

All names below are the canonical `name:` field from agent frontmatter.

| Agent Name | Skill Name | Phase | Use For |
|---|---|---|---|
| phoenix-truth-case-runner | phoenix-truth-case-orchestrator | 0 | Run suite, compute pass rates, triage |
| phoenix-precision-guardian | phoenix-precision-guard | 1A | parseFloat eradication, Decimal.js |
| waterfall-specialist | phoenix-waterfall-ledger-semantics | 0,1B | Clawback, tier/ledger validation |
| xirr-fees-validator | phoenix-xirr-fees-validator | 0,1B | XIRR/fees truth cases, Excel parity |
| phoenix-capital-allocation-analyst | phoenix-capital-exit-investigator | 0,1A | Low-confidence modules, provenance |
| phoenix-docs-scribe | phoenix-docs-sync | 1A | JSDoc, calculations.md sync |
| phoenix-probabilistic-engineer | phoenix-advanced-forecasting | 2 | Graduation, MOIC, Monte Carlo |
| phoenix-reserves-optimizer | phoenix-reserves-optimizer | 2 | Reserve allocation |
| phoenix-brand-reporting-stylist | phoenix-brand-reporting | 3 | Press On Ventures branding |

---

# 3. Decision Tree (Fallback)

Use when pattern matching doesn't clearly apply.

```
START
  |
  v
Q1: Does this involve implementing something NEW?
  |
  +-- YES --> CAPABILITIES.md FIRST
  |           |
  |           +-- Found existing? --> Use it (cite file/command/agent)
  |           |
  |           +-- Not found? --> Use DEVELOPMENT-TOOLING-CATALOG decision order:
  |                              Phoenix Agents > Project Agents > Commands > Generic
  |
  +-- NO --> Continue
  |
  v
Q2: Is this a Phoenix project task?
  |
  +-- YES --> docs/PHOENIX-SOT/README.md
  |           |
  |           +-- Phase 0/1A/1B? --> execution-plan-v2.34.md
  |           +-- Truth cases? --> /phoenix-truth command
  |           +-- Phase 2? --> /phoenix-phase2 (only after gate passes)
  |           +-- Agents? --> .claude/agents/PHOENIX-AGENTS.md
  |
  +-- NO --> Continue
  |
  v
Q3: Is this about understanding WHY a decision was made?
  |
  +-- YES --> DECISIONS.md (ADR search)
  +-- NO --> Continue
  |
  v
Q4: Is this about recent changes or history?
  |
  +-- YES --> CHANGELOG.md
  +-- NO --> Continue
  |
  v
Q5: Which category?
  |
  +-- Development --> docs/INDEX.md
  +-- Testing --> docs/INDEX.md
  +-- Deployment --> docs/INDEX.md
  +-- Troubleshooting --> SIDECAR_GUIDE.md
  +-- Other --> docs/INDEX.md
  |
  v
Q6: Is the document >24h old AND contains execution claims?
  |
  +-- YES --> Apply Document Review Protocol:
  |           1) git log --since="<doc-date>" for evidence
  |           2) Verify referenced code exists (grep/glob)
  |           3) If unverified --> warn, recommend reality check
  |
  +-- NO --> Proceed with document
```

---

# 4. Command Quick Reference

| Command | Description | When to Use |
|---|---|---|
| /phoenix-truth | Run deterministic truth cases | Phase 0 validation, baseline checks |
| /phoenix-phase2 | Probabilistic workflow | After deterministic gate passes |
| /phoenix-prob-report | Format MC distribution table | PR-ready summaries |
| /test-smart | Intelligent test selection | Changed files only |
| /fix-auto | Auto-fix lint/format/tests | Quick cleanup |
| /deploy-check | Pre-deployment validation | Before production |
| /workflows | Interactive tool helper | Finding the right tool |

---

# 5. Stale Document Defense

When reviewing docs that claim execution results:

1. Check `last_updated` in frontmatter
2. If >24h old, verify claims:
   - `git log --since="YYYY-MM-DD" -- <path>`
   - `grep` for referenced symbols/files
3. If unverified, warn before trusting

---

# 6. Generated Artifacts

The discovery system generates machine-readable artifacts:

| Artifact | Path | Description |
|---|---|---|
| Router Index | `docs/_generated/router-index.json` | Machine-readable routing patterns |
| Staleness Report | `docs/_generated/staleness-report.md` | Documents needing review |

**Commands:**
- `npm run docs:routing:generate` - Regenerate artifacts
- `npm run docs:routing:check` - Verify sync (used in CI)

**Source of truth:** `docs/DISCOVERY-MAP.source.yaml`

---

# 7. Maintenance

**Update this file when:**
- New Phoenix agent/skill created
- Agent names changed (check frontmatter `name:`)
- New commands added
- Routing patterns change

**Update source YAML when:**
- Adding new routing patterns
- Changing staleness rules
- Adding new agent registry entries

**Last verified against repo:** 2025-12-12
