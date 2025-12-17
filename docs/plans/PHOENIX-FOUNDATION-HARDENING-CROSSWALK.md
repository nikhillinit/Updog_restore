---
status: ACTIVE
audience: agents
last_updated: 2025-12-16
categories: [phoenix, foundation-hardening, coordination]
keywords:
  [
    phoenix,
    foundation-hardening,
    truth-cases,
    implementation-parity,
    divergence,
  ]
source_of_truth: true
agent_routing:
  priority: 1
  route_hint:
    'Coordination logic for Phoenix validation + Foundation Hardening
    implementation parity'
  use_cases: [phoenix_hardening_coordination, divergence_triage]
maintenance:
  owner: 'Core Team'
  review_cadence: 'P30D'
---

# Phoenix-Foundation Hardening Coordination

**Purpose:** Single source of truth for coordinating Phoenix validation with
Foundation Hardening implementation parity work.

**Created:** 2025-12-16 **Related PRs:**

- #245 (Phoenix agents integration) - Merged Dec 10, 2025
- #261 (Phoenix v2.34 docs + Domain Knowledge + INDEX updates) - Merged Dec 14,
  2025

---

## Key Distinction

**Phoenix Project:**

- Provides correctness specs via truth-case suites (50 XIRR scenarios, 14
  waterfall-ledger scenarios, 10 fee scenarios, 20 CA scenarios)
- Provides doc-domain scoring (Promptfoo) for documentation quality validation
  (96.3%, 94.3%, 94.5%, 99%)
- Provides NotebookLM domain knowledge sources (85K words, 22 files) as
  canonical reference

**Foundation Hardening Sprint:**

- Implementation parity work (consolidate 4 XIRR implementations, fix unit
  mismatches, standardize error handling)
- Goal: 72.3% → 90% test pass rate
- Fixes architectural divergences discovered during test repair

**Relationship:** Phoenix provides the "what" (correctness specs + domain
knowledge), Foundation Hardening fixes the "how" (implementation alignment).

---

## Domain Overlap

| Domain                 | Phoenix Truth Cases (Auditable Counts)                                                                                                                                                 | Phoenix Doc Score (Promptfoo)                                                                          | Foundation Hardening Divergence                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **XIRR**               | N cases ([/docs/xirr.truth-cases.json](/docs/xirr.truth-cases.json)) - Excel parity                                                                                                    | 96.3% ([/docs/notebooklm-sources/xirr.md](/docs/notebooklm-sources/xirr.md))                           | 4 implementations (finance/xirr.ts, lib/xirr.ts, selectors/xirr.ts, server/actual-metrics-calculator.ts) with different algorithms, error handling, rate bounds |
| **Waterfall**          | N ledger ([/docs/waterfall-ledger.truth-cases.json](/docs/waterfall-ledger.truth-cases.json)), N tier ([/docs/waterfall-tier.truth-cases.json](/docs/waterfall-tier.truth-cases.json)) | 94.3% ([/docs/notebooklm-sources/waterfall.md](/docs/notebooklm-sources/waterfall.md))                 | Clawback only in american-ledger.ts (not fee-calculations.ts), ghost EUROPEAN types remain despite ADR-004 removal                                              |
| **Fees**               | N cases ([/docs/fees.truth-cases.json](/docs/fees.truth-cases.json))                                                                                                                   | 94.5% ([/docs/notebooklm-sources/fees.md](/docs/notebooklm-sources/fees.md))                           | 3 separate fee systems with different basis enums (7 values vs 3 values vs 6 values), different recycling logic                                                 |
| **Capital Allocation** | N cases ([/docs/capital-allocation.truth-cases.json](/docs/capital-allocation.truth-cases.json))                                                                                       | 99% ([/docs/notebooklm-sources/capital-allocation.md](/docs/notebooklm-sources/capital-allocation.md)) | 6+ engines with different unit systems (cents/BigInt/Decimal/dollars), different rounding strategies (Banker's vs standard)                                     |
| **Exit Recycling**     | N cases ([/docs/exit-recycling.truth-cases.json](/docs/exit-recycling.truth-cases.json))                                                                                               | 91% ([/docs/notebooklm-sources/exit-recycling.md](/docs/notebooklm-sources/exit-recycling.md))         | Duplication in fee-calculations.ts vs fee-profile.ts                                                                                                            |

**Truth-Case Counts (Computed from Files):**

```bash
# Auditable JSON counts (prevent drift)
jq length docs/xirr.truth-cases.json                # XIRR
jq length docs/waterfall-ledger.truth-cases.json    # Waterfall (ledger)
jq length docs/waterfall-tier.truth-cases.json      # Waterfall (tier)
jq length docs/fees.truth-cases.json                # Fees
jq length docs/capital-allocation.truth-cases.json  # Capital Allocation
jq length docs/exit-recycling.truth-cases.json      # Exit Recycling
```

**Note:** Counts shown as "N" to prevent documentation drift. Use the jq
commands above to get current counts from source JSON files.

---

## Coordination Strategy

### When Working on Foundation Hardening Test Repair

**Before fixing any test failure:**

1. **Run Phoenix validation first** to establish correctness baseline:

   ```bash
   /phoenix-truth focus=<domain>  # xirr, waterfall, fees, capital
   ```

2. **Consult NotebookLM domain knowledge** for canonical semantics:
   - XIRR: `/docs/notebooklm-sources/xirr.md`
   - Waterfall: `/docs/notebooklm-sources/waterfall.md`
   - Fees: `/docs/notebooklm-sources/fees.md`
   - Capital Allocation: `/docs/notebooklm-sources/capital-allocation.md`

3. **Use Foundation Hardening triage** (from
   [IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md](/docs/plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md)):
   - **Scenario 1 (Simple fix):** Fix immediately if <30 min, 1-2 files, no
     shared seams
   - **Scenario 2 (Complex fix):** Document in
     [ARCHITECTURAL-DEBT.md](/docs/ARCHITECTURAL-DEBT.md), defer to Parity
     Sprint
   - **Scenario 3 (Not divergence):** Fix actual root cause (missing await,
     wrong mock, etc.)

4. **Maintain Phoenix truth-case pass rates** while fixing implementation
   divergences

### When to Use Each System

**Use Phoenix:**

- Need to verify correctness of calculation logic
- Need canonical domain knowledge (NotebookLM sources)
- Validating truth-case coverage
- Running end-to-end validation (`/phoenix-truth focus=all`)

**Use Foundation Hardening:**

- Fixing test failures (72.3% → 90% pass rate)
- Consolidating duplicate implementations
- Standardizing error handling / unit systems
- Implementation parity work (not correctness validation)

---

## Commands & Tools

### Phoenix Commands (Discovery System - PR #249)

**Slash Commands (Claude Code):**

```bash
# Run truth-case validation by domain
/phoenix-truth focus=xirr          # XIRR scenarios (Excel parity)
/phoenix-truth focus=waterfall     # Waterfall scenarios (ledger + tier)
/phoenix-truth focus=fees          # Fee scenarios
/phoenix-truth focus=capital       # Capital allocation scenarios
/phoenix-truth focus=all           # All truth-case scenarios

# Access domain knowledge (NotebookLM)
# Files located in /docs/notebooklm-sources/
```

**Local Fallback (until npm script implemented):**

```bash
# Run truth-case runner directly via vitest
npx vitest run tests/unit/truth-cases/runner.test.ts

# Filter by domain
npx vitest run tests/unit/truth-cases/runner.test.ts -t "xirr"
npx vitest run tests/unit/truth-cases/runner.test.ts -t "waterfall"
npx vitest run tests/unit/truth-cases/runner.test.ts -t "fees"
```

**Discovery Routing (PR #249):**

- **Source of Truth**:
  [/docs/DISCOVERY-MAP.source.yaml](/docs/DISCOVERY-MAP.source.yaml)
- **Generated Artifacts**:
  - [/docs/\_generated/router-index.json](/docs/_generated/router-index.json)
    (full index)
  - [/docs/\_generated/router-fast.json](/docs/_generated/router-fast.json)
    (fast lookup)
- **Tool Routing**:
  [/.claude/PHOENIX-TOOL-ROUTING.md](/.claude/PHOENIX-TOOL-ROUTING.md) (separate
  from discovery routing)

### Foundation Hardening Validators (from Hardening Plan)

```bash
# Test pass rate validation
npm test -- --project=server
npm test -- --project=client

# Schema drift detection
npm run validate:schema-drift

# Baseline quality checks
npm run baseline:check
```

### Routing Validation (PR #249)

```bash
# Regenerate routing index
npm run docs:routing:generate

# Validate routing configuration
npm run docs:routing:check
```

---

## Truth-Case Locations (Repo-Root Links)

### Deterministic Modules (Phase 1)

- **XIRR**: [/docs/xirr.truth-cases.json](/docs/xirr.truth-cases.json) (50
  scenarios, Excel `XIRR()` verified)
- **Waterfall - Ledger**:
  [/docs/waterfall-ledger.truth-cases.json](/docs/waterfall-ledger.truth-cases.json)
  (14 scenarios, clawback semantics)
- **Waterfall - Tier**:
  [/docs/waterfall-tier.truth-cases.json](/docs/waterfall-tier.truth-cases.json)
  (15 scenarios, hand-verified)
- **Fees**: [/docs/fees.truth-cases.json](/docs/fees.truth-cases.json) (10
  scenarios, arithmetic derivations)
- **Capital Allocation**:
  [/docs/capital-allocation.truth-cases.json](/docs/capital-allocation.truth-cases.json)
  (20 scenarios, priority spot-check)
- **Exit Recycling**:
  [/docs/exit-recycling.truth-cases.json](/docs/exit-recycling.truth-cases.json)
  (10 scenarios, needs investigation)

### Domain Knowledge Sources (NotebookLM - 85K words)

**Phase 1 (Deterministic):**

- [/docs/notebooklm-sources/xirr.md](/docs/notebooklm-sources/xirr.md) - Doc
  Score: 96.3% (Promptfoo)
- [/docs/notebooklm-sources/waterfall.md](/docs/notebooklm-sources/waterfall.md) -
  Doc Score: 94.3%
- [/docs/notebooklm-sources/fees.md](/docs/notebooklm-sources/fees.md) - Doc
  Score: 94.5%
- [/docs/notebooklm-sources/capital-allocation.md](/docs/notebooklm-sources/capital-allocation.md) -
  Doc Score: 99%
- [/docs/notebooklm-sources/exit-recycling.md](/docs/notebooklm-sources/exit-recycling.md) -
  Doc Score: 91%

**Phase 2 (Probabilistic - COMPLETE):**

- [/docs/notebooklm-sources/reserves/](/docs/notebooklm-sources/reserves/) (4
  files, ~23 pages)
- [/docs/notebooklm-sources/pacing/](/docs/notebooklm-sources/pacing/) (4 files,
  ~26 pages)
- [/docs/notebooklm-sources/cohorts/](/docs/notebooklm-sources/cohorts/) (3
  files, ~69 pages)
- [/docs/notebooklm-sources/monte-carlo/](/docs/notebooklm-sources/monte-carlo/)
  (4 files, ~120 pages)

**Note:** Phase 2 engine documentation marked COMPLETE as of Nov 6, 2025. See
[/docs/notebooklm-sources/PHASE2-COMPLETE.md](/docs/notebooklm-sources/PHASE2-COMPLETE.md).

---

## Promptfoo Validation Configs (Doc-Domain Scoring)

Phoenix uses Promptfoo to validate documentation quality (NOT truth-case pass
rates).

**Documentation Validation Framework:**

- **Configs Location**: [/scripts/validation/](/scripts/validation/) (see
  `*-validation.yaml` files)
- **Example**: `fee-validation.yaml` (singular naming convention per
  CAPABILITIES.md)
- **Score Format**: "Domain Score" output (e.g., 96.3% for XIRR documentation
  quality)

**Current Doc Scores (from NotebookLM sources):**

- **XIRR**: 96.3% doc-domain score
  ([/docs/notebooklm-sources/xirr.md](/docs/notebooklm-sources/xirr.md))
- **Waterfall**: 94.3% doc-domain score
  ([/docs/notebooklm-sources/waterfall.md](/docs/notebooklm-sources/waterfall.md))
- **Fees**: 94.5% doc-domain score
  ([/docs/notebooklm-sources/fees.md](/docs/notebooklm-sources/fees.md))
- **Capital Allocation**: 99% doc-domain score
  ([/docs/notebooklm-sources/capital-allocation.md](/docs/notebooklm-sources/capital-allocation.md))
- **Exit Recycling**: 91% doc-domain score
  ([/docs/notebooklm-sources/exit-recycling.md](/docs/notebooklm-sources/exit-recycling.md))

**Important:** These percentages are documentation quality scores from Promptfoo
validation, separate from truth-case pass/fail counts.

---

## Known Issues & Gotchas

### Phoenix Known Issues

1. **Pacing Validation Config Mismatch** (documented in
   `/docs/notebooklm-sources/pacing/VALIDATION-NOTES.md`)
   - Configs need alignment with current implementation before running full test
     suite
   - Workaround: Manual config review before pacing validation

### Foundation Hardening Blockers

1. **PR #279 Breaking Change**
   - `max_allocation_per_cohort` now expects **percentage** (float, e.g., 0.5
     for 50%) instead of absolute cent value
   - Risk: Any code using old format will produce wrong results
   - Action: Search for old usage before Phase 2.2

2. **XIRR Exception Risk**
   - `client/src/core/selectors/xirr.ts` **THROWS exceptions** (can crash UI
     without error boundary)
   - Other implementations return null or Result objects
   - Action: Add to Phase 2.1 hotspot watch list

3. **Ghost EUROPEAN Types**
   - Despite ADR-004 removal (commit `ebd963a`), ghost references remain:
     - `shared/contracts/kpi-selector.contract.ts`
     - `client/src/stores/fundStore.ts`
     - Test files
   - Action: Remove during Phase 2.3 if encountered

---

## Integration with Foundation Hardening Phases

### Phase 2.1 (Integration Seams)

- **If** ops-webhook or stage-validation tests fail due to XIRR exceptions →
  Apply immediate fix (Scenario 1)
- **Before fixing:** Run `/phoenix-truth focus=xirr` to verify XIRR correctness
  baseline
- **Document** any unit mismatch issues in CA engine tests →
  [ARCHITECTURAL-DEBT.md](/docs/ARCHITECTURAL-DEBT.md) (Scenario 2)

### Phase 2.2 (Truth Cases)

- **If** CA truth cases fail due to PR #279 breaking change → Update adapter
  immediately (Scenario 1)
- **Consult** `/docs/notebooklm-sources/capital-allocation.md` for canonical CA
  semantics
- **If** waterfall truth cases fail → Assess if test expectations are wrong vs.
  implementation using `/docs/notebooklm-sources/waterfall.md`

### Phase 2.3 (UI/Wizard)

- **If** wizard tests reference EUROPEAN types → Remove ghost types immediately
  (Scenario 1)
- **Before removing:** Check `/docs/notebooklm-sources/waterfall.md` to confirm
  EUROPEAN is not a valid type
- **Document** fee basis enum mismatches discovered in wizard →
  [ARCHITECTURAL-DEBT.md](/docs/ARCHITECTURAL-DEBT.md) (Scenario 2)

### Phase 2.4 (Regression Prevention)

- **Review** [ARCHITECTURAL-DEBT.md](/docs/ARCHITECTURAL-DEBT.md) entries →
  Prioritize for Parity Sprint
- **Run** `/phoenix-truth focus=all` to verify no regressions in truth-case pass
  rates
- **No parity fixes** unless blocking final 90% target

---

## Success Criteria

**Foundation Hardening Sprint:**

- Test pass rate: 72.3% → ≥90%
- Phoenix truth-case pass rates: MAINTAINED (no regressions)
- Architectural debt entries: 0 → 4-8 (documented, not fixed)
- Immediate divergence fixes: 0-3 (only if blocking, Scenario 1)

**Implementation Parity Sprint (Post-Hardening):**

- Duplicate implementations: 16 → 4 (one per domain)
- Phoenix truth-case pass rates: MAINTAINED or IMPROVED
- Cross-implementation test coverage: 0% → 100%
- [ARCHITECTURAL-DEBT.md](/docs/ARCHITECTURAL-DEBT.md) resolved entries: 0 → 4-8

**Drift Prevention & Discoverability:**

- Crosswalk indexed and returned by routing query:
  ```bash
  npm run docs:routing:generate
  npm run docs:routing:check
  npm run docs:routing:query -- "phoenix foundation hardening crosswalk"
  ```
- ARCHITECTURAL-DEBT / Divergence Assessment contain **no embedded overlap
  tables** (only links to this crosswalk)

---

## Related Documents

- **Phoenix Execution Plan**:
  [/docs/PHOENIX-SOT/execution-plan-v2.34.md](/docs/PHOENIX-SOT/execution-plan-v2.34.md)
- **Phoenix SOT Hub**:
  [/docs/PHOENIX-SOT/README.md](/docs/PHOENIX-SOT/README.md)
- **Foundation Hardening Plan**:
  [/FOUNDATION-HARDENING-EXECUTION-PLAN.md](/FOUNDATION-HARDENING-EXECUTION-PLAN.md)
- **Implementation Parity Strategy**:
  [/docs/plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md](/docs/plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md)
- **Architectural Debt Registry**:
  [/docs/ARCHITECTURAL-DEBT.md](/docs/ARCHITECTURAL-DEBT.md)
- **Divergence Assessment**:
  [/docs/plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](/docs/plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md)
- **Fee Alignment Review**:
  [/docs/plans/FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md](/docs/plans/FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md)
- **Discovery Routing Map**:
  [/.claude/DISCOVERY-MAP.md](/.claude/DISCOVERY-MAP.md)
- **Documentation Index**: [/docs/INDEX.md](/docs/INDEX.md)

---

**Maintenance Notes:**

- **Update coordination strategy** if Phoenix adds new truth-case domains
- **Update truth-case locations** if files move (use repo-root links to minimize
  link rot)
- **Update Promptfoo scores** if NotebookLM sources are regenerated
- **Link from commits:** Include "See PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md"
  in Foundation Hardening commit messages when Phoenix context is relevant
