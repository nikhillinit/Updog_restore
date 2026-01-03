---
status: ACTIVE
audience: agents
last_updated: 2025-12-29
owner: 'Platform Team'
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

If a task sounds like "build / implement / add / create", check
`CAPABILITIES.md` FIRST.

---

# CRITICAL: NotebookLM Truth Sources

**Location:** `docs/notebooklm-sources/` (22 files, ~85,000 words)

The canonical domain knowledge base for ALL Phoenix validation work. Phase 2
COMPLETE as of Nov 6, 2025.

**Contents:**

- `xirr.md` - XIRR calculation semantics
- `waterfall.md` - Waterfall distribution logic
- `fees.md` - Fee calculation standards
- `capital-allocation.md` - Capital allocation policy
- `exit-recycling.md` - Exit recycling rules
- `reserves/` (4 files) - ReserveEngine documentation
- `pacing/` (4 files) - PacingEngine documentation (includes
  VALIDATION-NOTES.md)
- `cohorts/` (3 files) - CohortEngine documentation
- `monte-carlo/` (4 files) - Monte Carlo simulation engine
- `PHASE2-COMPLETE.md` - Phase 2 completion summary

**When to use:** Any validation, domain questions, or implementation requiring
VC fund modeling knowledge.

---

# WARNING: ADR Number Conflicts

**Status:** Requires resolution (renumbering needed)

ADR-010, ADR-011, ADR-012 exist in BOTH locations with DIFFERENT content:

| ADR | In DECISIONS.md                  | In docs/adr/                    |
| --- | -------------------------------- | ------------------------------- |
| 010 | PowerLawDistribution API Design  | Monte Carlo Validation Strategy |
| 011 | Anti-Pattern Prevention Strategy | Typed Stage Normalization       |
| 012 | Evidence-Based Document Reviews  | mem0 Integration                |

**Resolution:** docs/adr/ ADRs should be renumbered to ADR-017, ADR-018,
ADR-019.

**Action:** When referencing ADRs, specify the file path explicitly until
resolved.

---

# 1. Pattern-Based Routing (Fast Path)

Pattern matching uses OR logic: any match triggers the route.

| Query Pattern                                                 | Route To                                              | Why                                      |
| ------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| "implement feature" OR "new agent" OR "add tool"              | CAPABILITIES.md                                       | Check existing solutions before building |
| "domain knowledge" OR "vc modeling" OR "fund calculations"    | docs/notebooklm-sources/                              | Canonical domain truth (85K words)       |
| "reserve engine" OR "pacing engine" OR "cohort engine"        | docs/notebooklm-sources/                              | Phase 2 engine documentation             |
| "phoenix" OR "truth case" OR "validation"                     | docs/PHOENIX-SOT/README.md                            | Phoenix workflows entry point            |
| "phase 2" OR "monte carlo" OR "probabilistic"                 | /phoenix-phase2 command                               | Phase 2 workflow                         |
| "expectation mode" OR "deterministic parity"                  | /phoenix-phase2 command                               | Expectation Mode in command              |
| "distribution table" OR "mc report"                           | /phoenix-prob-report command                          | Format Monte Carlo output                |
| "test failing" OR "fix tests"                                 | /phoenix-truth + cheatsheets/pr-merge-verification.md | Baseline comparison                      |
| "scaffold tests" OR "new test suite" OR "test infrastructure" | test-scaffolder agent                                 | Create test infrastructure for modules   |
| "flaky test" OR "flakiness" OR "intermittent failure"         | test-repair agent (flakiness section)                 | Flakiness detection and management       |
| "test fixtures" OR "factory functions" OR "golden dataset"    | test-fixture-generator skill                          | Fixture patterns and generators          |
| "precision" OR "parseFloat" OR "Decimal"                      | phoenix-precision-guardian agent                      | Numeric drift                            |
| "clawback" OR "ledger waterfall" OR "carry"                   | waterfall-specialist agent                            | Waterfall semantics                      |
| "capital allocation" OR "exit recycling"                      | phoenix-capital-allocation-analyst agent              | Allocation module                        |
| "fees" OR "irr" OR "xirr"                                     | xirr-fees-validator agent                             | XIRR/fees owner                          |
| "reserves" OR "pro-rata" OR "ownership"                       | phoenix-reserves-optimizer agent                      | Reserve allocation                       |
| "graduation" OR "moic" OR "forecasting"                       | phoenix-probabilistic-engineer agent                  | Phase 2 probabilistic                    |
| "brand" OR "styling" OR "dashboard layout"                    | phoenix-brand-reporting-stylist agent                 | Brand consistency                        |
| "phase 3" OR "LP reports" OR "PDF export"                     | docs/PHOENIX-SOT/execution-plan-v3.0-phase3-addendum.md | Phase 3 planning                       |
| "brand guidelines" OR "logo usage" OR "POV colors"            | docs/PHOENIX-SOT/brand-bridge.md                      | Press On Ventures brand specification    |
| "print css" OR "print stylesheet" OR "dashboard print"        | client/src/styles/print.css                           | Print-optimized styling                  |
| "design tokens" OR "brand tokens" OR "theme tokens"           | client/src/lib/brand-tokens.ts                        | Programmatic brand values                |
| "pdf generation" OR "tear sheet" OR "quarterly report"        | client/src/utils/pdf/                                 | PDF export utilities                     |
| "docs sync" OR "jsdoc" OR "calculations.md"                   | phoenix-docs-scribe agent                             | Documentation sync                       |
| "deploy" OR "production" OR "rollout"                         | docs/workflows/PRODUCTION_SCRIPTS.md                  | Deployment docs                          |
| "workflow" OR "ci" OR "github actions"                        | docs/workflows/README.md                              | CI/CD docs                               |
| "architecture" OR "decision" OR "why"                         | DECISIONS.md                                          | ADR rationale                            |
| "change history" OR "what changed"                            | CHANGELOG.md                                          | Chronological changes                    |
| "log change" OR "changelog entry"                             | /log-change command                                   | Guided CHANGELOG.md entry                |
| "log decision" OR "adr entry" OR "architectural decision"     | /log-decision command                                 | Guided ADR entry for DECISIONS.md        |
| "which agent" OR "agent selection" OR "find agent"            | .claude/AGENT-DIRECTORY.md                            | Canonical agent locations                |
| "test strategy" OR "test agent" OR "which test"               | .claude/docs/TEST-STRATEGY.md                         | Test agent routing guide                 |
| "react performance" OR "re-render" OR "useMemo" OR "useCallback" | react-performance-optimization skill               | Memoization, code splitting              |
| "async error" OR "retry" OR "circuit breaker" OR "resilience" | async-error-resilience skill                          | BullMQ patterns, graceful degradation    |
| "phoenix workflow" OR "which phoenix skill"                   | phoenix-workflow-orchestrator skill                   | Phoenix skill routing master             |
| "schema evolution" OR "drizzle migration" OR "db:push"        | database-schema-evolution skill                       | Zero-downtime migrations                 |
| "pr ready" OR "pre-pr" OR "before pull request"               | /pr-ready command                                     | Full pre-PR validation workflow          |
| "db validate" OR "schema check" OR "before db:push"           | /db-validate command                                  | Pre-push schema validation               |
| "orchestrate" OR "chain agents" OR "auto validate"            | workflow-orchestrator agent                           | Auto-chain agents based on changes       |
| "agent metrics" OR "agent performance" OR "usage tracking"    | .claude/AGENT-METRICS.md                              | Agent performance tracking               |
| "error" OR "debug" OR "troubleshoot"                          | SIDECAR_GUIDE.md                                      | Platform issues                          |
| "module not found" OR "typescript" OR "path"                  | SIDECAR_GUIDE.md                                      | TS/module resolution                     |

---

# 2. Phoenix Agent Quick Reference

All names below are the canonical `name:` field from agent frontmatter.

| Agent Name                         | Skill Name                         | Phase | Use For                               |
| ---------------------------------- | ---------------------------------- | ----- | ------------------------------------- |
| phoenix-truth-case-runner          | phoenix-truth-case-orchestrator    | 0     | Run suite, compute pass rates, triage |
| phoenix-precision-guardian         | phoenix-precision-guard            | 1A    | parseFloat eradication, Decimal.js    |
| waterfall-specialist               | phoenix-waterfall-ledger-semantics | 0,1B  | Clawback, tier/ledger validation      |
| xirr-fees-validator                | phoenix-xirr-fees-validator        | 0,1B  | XIRR/fees truth cases, Excel parity   |
| phoenix-capital-allocation-analyst | phoenix-capital-exit-investigator  | 0,1A  | Low-confidence modules, provenance    |
| phoenix-docs-scribe                | phoenix-docs-sync                  | 1A    | JSDoc, calculations.md sync           |
| phoenix-probabilistic-engineer     | phoenix-advanced-forecasting       | 2     | Graduation, MOIC, Monte Carlo         |
| phoenix-reserves-optimizer         | phoenix-reserves-optimizer         | 2     | Reserve allocation                    |
| phoenix-brand-reporting-stylist    | phoenix-brand-reporting            | 3     | Press On Ventures branding            |

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

| Command              | Description                   | When to Use                         |
| -------------------- | ----------------------------- | ----------------------------------- |
| /phoenix-truth       | Run deterministic truth cases | Phase 0 validation, baseline checks |
| /phoenix-phase2      | Probabilistic workflow        | After deterministic gate passes     |
| /phoenix-prob-report | Format MC distribution table  | PR-ready summaries                  |
| /test-smart          | Intelligent test selection    | Changed files only                  |
| /fix-auto            | Auto-fix lint/format/tests    | Quick cleanup                       |
| /deploy-check        | Pre-deployment validation     | Before production                   |
| /workflows           | Interactive tool helper       | Finding the right tool              |
| /log-change          | Guided CHANGELOG.md entry     | After features/fixes                |
| /log-decision        | Guided ADR entry              | Architectural decisions             |
| /pre-commit-check    | Quality validation            | Before committing                   |
| /pr-ready            | Full pre-PR validation        | Before creating pull request        |
| /db-validate         | Schema validation             | Before npm run db:push              |

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

| Artifact         | Path                                  | Description                    |
| ---------------- | ------------------------------------- | ------------------------------ |
| Router Index     | `docs/_generated/router-index.json`   | Full routing data with stats   |
| Router Fast      | `docs/_generated/router-fast.json`    | Consumer-optimized fast router |
| Staleness Report | `docs/_generated/staleness-report.md` | Documents needing review       |

**Commands:**

- `npm run docs:routing:generate` - Regenerate artifacts
- `npm run docs:routing:check` - Verify sync (used in CI)
- `npm run docs:routing:query "<query>"` - Route a query programmatically

**Source of truth:** `docs/DISCOVERY-MAP.source.yaml`

## Consumer Router API

For programmatic routing, use `scripts/routeQueryFast.ts`:

```typescript
import { routeQueryFast, loadRouterIndex } from './scripts/routeQueryFast';

const index = await loadRouterIndex();
const result = routeQueryFast('help with waterfall', index);

if (result.matched) {
  console.log(`Route to: ${result.route_to}`);
  console.log(`Why: ${result.why}`);
}
```

**Scoring:**

- Each matched phrase: +1 point
- Generic terms (test, error, fix): +0.5 points (penalized)
- Minimum score to route: 2 (configurable)
- Tie-breakers: score DESC, priority ASC

---

# 7. Settings.json Configuration

The `.claude/settings.json` file controls permissions, hooks, and status line.

## Schema (Required Structure)

```json
{
  "permissions": {
    "allow": ["pattern1", "pattern2"],
    "deny": ["pattern3"]
  },
  "hooks": { ... },
  "statusLine": { ... }
}
```

The `permissions` object is required. Other keys are optional.

## Policy (Pattern Syntax)

Bash permission patterns use **prefix matching** with `:*` suffix:

| Pattern              | Meaning                                           |
| -------------------- | ------------------------------------------------- |
| `Bash(git status)`   | Exact match only (no args allowed)                |
| `Bash(git status:*)` | Prefix match (allows any args like `--porcelain`) |

**Common patterns:**

```json
"allow": [
  "Bash(npm run lint:*)",    // npm run lint, npm run lint:fix, etc.
  "Bash(git status:*)",       // git status --porcelain=v1, etc.
  "Bash(git diff:*)",         // git diff HEAD, git diff --name-only, etc.
  "Read(**/*)"                // Read any file
]
```

**Prefix match caveat:** `Bash(npm run lint:*)` also matches `npm run lintfix`
(starts with same prefix). For stricter matching, include a space:
`Bash(npm run lint :*)`.

---

# 8. Maintenance

**Update this file when:**

- New Phoenix agent/skill created
- Agent names changed (check frontmatter `name:`)
- New commands added
- Routing patterns change

**Update source YAML when:**

- Adding new routing patterns
- Changing staleness rules
- Adding new agent registry entries

**Last verified against repo:** 2025-12-14
