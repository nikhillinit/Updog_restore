# NotebookLM Business Logic Data Collection - Handoff Memo

**Date:** 2025-10-26 **Project:** Updog_restore (Press On Ventures VC Fund
Modeling Platform) **Purpose:** Document findings from NotebookLM content
evaluation and provide roadmap for accurate business logic documentation

---

## Executive Summary

A comprehensive 6-agent investigation revealed that the proposed NotebookLM
content for this project contained **0% factual accuracy** on critical technical
claims. All core business logic descriptions were AI hallucinations with no
grounding in the actual codebase.

**This memo provides:**

1. Complete catalog of what was WRONG in the proposed content
2. Validated ACTUAL implementations discovered by agents
3. Structured roadmap for collecting accurate business logic documentation
4. Agent orchestration workflow for the data collection task

---

## Part 1: Validation Findings Summary

### What Was Fabricated (DO NOT USE)

| Domain            | False Claim                                                        | Reality Check Status                         |
| ----------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| **Waterfall**     | `calculateWaterfallStep()` function with step-by-step distribution | ❌ Does not exist                            |
| **ReserveEngine** | `MIN_BUFFER_PERCENTAGE = 0.03` constant                            | ❌ Does not exist                            |
| **ReserveEngine** | `calculateRequiredReserves(liabilities, aum)` method               | ❌ Does not exist                            |
| **PacingEngine**  | `calculateDailyPacingRate(budget, days)` method                    | ❌ Does not exist                            |
| **PacingEngine**  | Daily pacing calculations                                          | ❌ Quarterly only (8 quarters)               |
| **Architecture**  | ADR-001: "Drizzle over Prisma" (2025-08-10)                        | ❌ Actual ADR-001 is "KPI Selector Contract" |
| **Architecture**  | ADR-002: "Turborepo" (2025-08-12)                                  | ❌ No Turborepo; uses npm-run-all            |
| **Sidecar**       | Legacy Windows executable bridge (`LegacyBridge.exe`)              | ❌ Actually npm package isolation            |
| **Testing**       | 19 PBT tests in waterfall.test.ts                                  | ❌ 30 unit tests (PBT exists elsewhere)      |

**Key Takeaway:** The AI model fabricated plausible-sounding implementations
without referencing actual code.

---

## Part 2: Actual Implementations Discovered

### 2.1 Waterfall Module (`client/src/lib/waterfall.ts`)

**Purpose:** UI state management for waterfall type switching and field updates
**Lines of Code:** 149 **Exports:** 4 functions

```typescript
// Actual API (validated by code-explorer agent)
export function isAmerican(w: Waterfall): boolean;
export function isEuropean(w: Waterfall): boolean;
export function applyWaterfallChange(
  w: Waterfall,
  field: string,
  value: unknown
): Waterfall;
export function changeWaterfallType(
  w: Waterfall,
  nextType: 'AMERICAN' | 'EUROPEAN'
): Waterfall;
```

**Key Invariants:**

- Prevents setting EUROPEAN-only fields (`hurdle`, `catchUp`) on AMERICAN
  waterfall
- Clamps `hurdle`/`catchUp` to [0, 1] range
- Validates `carryVesting` bounds (cliffYears: 0-10, vestingYears: 1-10)
- Returns immutable updates (no mutation)

**Test Coverage:** 30 test cases in `waterfall.test.ts` (traditional unit tests,
NOT property-based)

**IMPORTANT DISCOVERY:** There's a SECOND waterfall system at
`shared/schemas/waterfall-policy.ts` with:

- `calculateEuropeanWaterfall()` - Full tier-based distribution logic
- `calculateAmericanWaterfall()` - Deal-by-deal calculations
- Uses Decimal.js for precision

**Action Required:** Document BOTH systems and their relationship.

---

### 2.2 ReserveEngine (`client/src/core/reserves/`)

**Critical Finding:** THREE distinct engine implementations exist, not one
monolithic class.

#### Engine 1: ReserveEngine.ts (189 lines)

**Type:** Functional (not a class) **Purpose:** Rule-based allocation with ML
simulation fallback

```typescript
// Actual API
export function ReserveEngine(portfolio: unknown[]): ReserveOutput[];
export function generateReserveSummary(
  fundId: number,
  portfolio: ReserveInput[]
): ReserveSummary;
```

**Algorithm:**

- Stage-based multipliers (Seed: 1.5x, Series A: 1.3x, etc.)
- Sector adjustments (FinTech/HealthTech: +20%, DeepTech: +30%)
- Ownership premium (>25%: +15%)
- Deterministic PRNG (seed=42) for reproducibility

**Invariants:**

- Non-negative allocations (uses `Math.round()`)
- Confidence scores capped at `MEDIUM` (0.7)
- Idempotent (same input → same output)

#### Engine 2: ConstrainedReserveEngine.ts (74 lines)

**Type:** Class with `calculate()` method **Purpose:** Constrained optimization
with hard capacity limits

```typescript
class ConstrainedReserveEngine {
  calculate(input: {
    availableReserves: number;
    companies: Company[];
    stagePolicies: StagePolicy[];
    constraints: Constraints;
  }): {
    allocations: Allocation[];
    totalAllocated: bigint;
    remaining: bigint;
    conservationOk: boolean;
  };
}
```

**Algorithm:**

- Uses `Cents` type (BigInt) for precision
- Two-pass greedy allocation sorted by score
- Enforces per-company and per-stage caps

**Invariants:**

- Conservation of reserves (total allocated + remaining = available)
- Non-negativity guaranteed by construction
- Monotonicity by score (higher score = priority)

#### Engine 3: DeterministicReserveEngine.ts (851 lines)

**Type:** Class with async pipeline **Purpose:** Production-grade Exit MOIC on
Planned Reserves algorithm

```typescript
class DeterministicReserveEngine {
  async calculateOptimalReserveAllocation(
    input: ReserveAllocationInput
  ): Promise<ReserveCalculationResult>;
}
```

**Pipeline (7 stages):**

1. MOIC calculation (current + projected)
2. Ranking by Exit MOIC on Planned Reserves
3. Portfolio optimization
4. Risk adjustments (age, maturity)
5. Constraint application
6. Result generation
7. Caching (MD5-based hash key)

**Invariants:**

- Deterministic (uses hash-based caching)
- Conservation (proportional reduction if over-allocated)
- Risk-adjusted based on company age + current MOIC

**Action Required:** Document all three engines, their use cases, and selection
criteria.

---

### 2.3 PacingEngine (`client/src/core/pacing/PacingEngine.ts`)

**Type:** Functional (not a class) **Lines of Code:** 161 **Scope:** Quarterly
pacing only (NOT daily)

```typescript
// Actual API
export function PacingEngine(input: unknown): PacingOutput[];
export function generatePacingSummary(input: PacingInput): PacingSummary;
```

**Algorithm:**

- Divides fund into 8 equal quarters (2-year deployment window)
- Market condition multipliers:
  - Bull: early=1.3x, mid=1.1x, late=0.8x (front-loaded)
  - Bear: early=0.7x, mid=0.9x, late=1.2x (back-loaded)
  - Neutral: even distribution (1.0x)
- Adds ±10% variability via deterministic PRNG (seed=123)

**Phases:**

- Quarters 0-2: "early-stage focus"
- Quarters 3-5: "mid-stage deployment"
- Quarters 6-7: "late-stage optimization"

**Invariants:**

- Always 8 quarters (hardcoded)
- Deterministic (same input → same output)
- Total deployment within 90-110% of fund size

**Integration:**

- API: `GET /api/pacing/summary`
- Worker: `pacing-worker.ts` (BullMQ job processor)
- UI: `pacing-timeline-chart.tsx` (bar chart + cumulative line)

**Action Required:** Document quarterly logic, NOT daily (critical
misrepresentation risk).

---

### 2.4 Architecture Reality

**Actual Build System:**

- npm workspaces (NOT Turborepo)
- Scripts: `npm-run-all`, `concurrently`
- Custom sidecar pattern for Windows (`tools_local/`)

**Actual ADRs (as of 2025-10-03):**

- ADR-001: Frozen KPI Selector Contract
- ADR-002: Feature Flags & 5-Route IA
- ADR-009: Vitest Path Alias Configuration

**Sidecar Architecture:**

- **Purpose:** Isolate Vite + build tools in `/tools_local/node_modules/`
- **Mechanism:** Windows junctions (`mklink /J`) from root to sidecar
- **Why:** Solves Windows Defender blocking + POSIX symlink corruption
- **NOT:** Legacy system bridge or executable interop

**Action Required:** Document actual build system, sidecar purpose, and real
ADRs.

---

## Part 3: Data Collection Roadmap

### Phase 1: Core Engine Documentation (5-7 hours)

#### Task 1.1: Waterfall Domain Logic

**Objective:** Document both waterfall systems and their relationship

**Agent Workflow:**

```
code-explorer → waterfall-specialist → docs-architect
```

**Deliverables:**

1. API reference for `client/src/lib/waterfall.ts` (type switching)
2. API reference for `shared/schemas/waterfall-policy.ts` (calculations)
3. Invariant documentation with test case references
4. Usage examples for AMERICAN vs EUROPEAN types
5. Integration guide (when to use which system)

**Key Questions to Answer:**

- When does UI use `applyWaterfallChange()` vs calculation functions?
- What triggers a recalculation in the policy system?
- How do tier priorities work in EUROPEAN waterfalls?

**Validation:** Cross-reference with 30 test cases in `waterfall.test.ts`

---

#### Task 1.2: ReserveEngine Family

**Objective:** Document all three engines with selection criteria

**Agent Workflow:**

```
code-explorer → database-expert (for data layer) → docs-architect
```

**Deliverables:**

1. Engine comparison matrix (use cases, algorithms, performance)
2. Algorithm documentation for each engine:
   - ReserveEngine: Rule-based + ML simulation
   - ConstrainedReserveEngine: Capacity-constrained optimization
   - DeterministicReserveEngine: Exit MOIC ranking (7-stage pipeline)
3. Input/output schemas with validation rules
4. Invariant documentation with property-based test references
5. Selection guide (which engine for which scenario)

**Key Questions to Answer:**

- When is each engine selected by the system?
- How do constraints propagate through ConstrainedReserveEngine?
- What triggers cache invalidation in DeterministicReserveEngine?
- What is "Exit MOIC on Planned Reserves" algorithm's mathematical definition?

**Validation:** Cross-reference with `reserves.property.test.ts` (8 properties,
50 runs each)

---

#### Task 1.3: PacingEngine Quarterly Logic

**Objective:** Document quarterly pacing algorithm accurately

**Agent Workflow:**

```
code-explorer → architect-review → docs-architect
```

**Deliverables:**

1. API reference for `PacingEngine()` and `generatePacingSummary()`
2. Market condition multiplier table
3. Phase assignment logic (early/mid/late)
4. Variability mechanism (PRNG usage)
5. Integration documentation (worker + API + UI)

**Key Questions to Answer:**

- Why 8 quarters (2 years) specifically?
- How is the PRNG seed (123) managed for reproducibility?
- What happens if market condition changes mid-deployment?
- Can deployment windows be customized (e.g., 3 years)?

**Validation:** Cross-reference with `tests/unit/engines/pacing-engine.test.ts`
(336 lines)

---

### Phase 2: Architecture & Infrastructure (3-4 hours)

#### Task 2.1: Sidecar Architecture

**Objective:** Document the ACTUAL sidecar pattern (npm isolation)

**Agent Workflow:**

```
code-explorer (scripts/link-sidecar-packages.mjs) → dx-optimizer → docs-architect
```

**Deliverables:**

1. Architecture diagram (junctions, packages, postinstall flow)
2. Problem statement (Windows Defender + POSIX symlink issues)
3. Package list from `sidecar-packages.json` (31 packages)
4. Troubleshooting guide (from SIDECAR_GUIDE.md)
5. CI/CD behavior (disabled on Vercel/GitHub Actions)

**Key Questions to Answer:**

- Why absolute paths vs relative symlinks?
- What happens if Git Bash is used instead of PowerShell?
- How does doctor script verify junction health?

**Validation:** Read existing `SIDECAR_GUIDE.md` (255 lines) - it's already
accurate!

---

#### Task 2.2: Architectural Decisions

**Objective:** Document actual ADRs and technology choices

**Agent Workflow:**

```
architect-review (DECISIONS.md) → docs-architect
```

**Deliverables:**

1. ADR catalog (current: 3 ADRs, expand with rationale)
2. Technology selection justifications:
   - Why Drizzle ORM? (no ADR exists yet - needs investigation)
   - Why npm workspaces vs Turborepo/Lerna?
   - Why Vitest over Jest?
3. Build system architecture (npm-run-all + concurrently)

**Key Questions to Answer:**

- Was Drizzle selected due to Windows compatibility?
- Why separate test projects (server/client) in Vitest config?
- What drove the Vite + React → Preact optimization path?

**Validation:** Cross-reference with actual files in `/ADR/` directory

---

### Phase 3: Test Strategy & Patterns (2-3 hours)

#### Task 3.1: Property-Based Testing Documentation

**Objective:** Document PBT usage in reserves module

**Agent Workflow:**

```
test-automator (analyze reserves.property.test.ts) → docs-architect
```

**Deliverables:**

1. PBT philosophy statement (why PBT for reserves?)
2. Property catalog (8 properties documented with examples)
3. Arbitrary definitions (complex object generators)
4. Configuration guide (numRuns: 50, timeout: 60s)
5. When to use PBT vs traditional unit tests (decision matrix)

**Key Questions to Answer:**

- Why is PBT only used for DeterministicReserveEngine?
- Should waterfall module adopt PBT for clamping logic?
- What's the cost/benefit of expanding PBT coverage?

**Validation:** Review `fast-check` usage patterns in actual test file

---

#### Task 3.2: Test Organization & Coverage

**Objective:** Document overall test strategy

**Agent Workflow:**

```
pr-test-analyzer → docs-architect
```

**Deliverables:**

1. Test project structure (server/Node.js vs client/jsdom)
2. Test file organization conventions
3. Coverage metrics (current: ~83% pass rate)
4. Testing pyramid (unit → integration → E2E)
5. CI/CD integration (GitHub Actions)

**Key Questions to Answer:**

- What's the target test coverage percentage?
- Which modules have insufficient coverage?
- How are E2E tests structured (Playwright)?

**Validation:** Run `npm test` and analyze output

---

## Part 4: Agent Orchestration Workflow

### Recommended Agent Pairing Strategy

#### Sequential Pairs (Output A → Input B)

1. **code-explorer → waterfall-specialist**
   - Explorer maps current implementation
   - Specialist validates domain logic correctness

2. **code-explorer → architect-review**
   - Explorer maps dependencies
   - Reviewer validates architectural patterns

3. **code-explorer → docs-architect**
   - Explorer extracts code structure
   - Docs writer generates formal documentation

4. **test-automator → docs-architect**
   - Automator analyzes test patterns
   - Docs writer documents testing strategy

#### Parallel Swarms (Independent Tasks)

Run simultaneously for each engine:

```
[
  code-explorer (map API),
  architect-review (validate patterns),
  database-expert (check data layer),
  test-automator (analyze test coverage)
]
```

Then aggregate results before docs-architect generates documentation.

---

### Skills Integration

#### When to Use NotebookLM Skill

**AFTER** accurate documentation is generated, use NotebookLM to:

1. Query domain knowledge (e.g., "What is Exit MOIC on Planned Reserves?")
2. Cross-reference multiple engines (e.g., "Compare all three ReserveEngines")
3. Get citation-backed answers from curated sources

**CRITICAL:** Only ingest VALIDATED documentation into NotebookLM, not
AI-generated content.

#### When to Use Other Skills

- **`brainstorming`**: Before starting each phase, brainstorm edge cases
- **`systematic-debugging`**: If test failures occur during validation
- **`pattern-recognition`**: Find all usage sites of each engine
- **`writing-plans`**: Generate detailed implementation plan before each task

---

## Part 5: Validation Checklist

Before ingesting ANY content into NotebookLM, verify:

### Code Validation

- [ ] Function/class names match actual exports
- [ ] Method signatures verified via TypeScript definitions
- [ ] Constants exist in actual code (no fabricated values)
- [ ] File paths are correct and files exist

### Behavioral Validation

- [ ] Algorithm descriptions match test expectations
- [ ] Invariants are documented in tests (property-based or unit)
- [ ] Edge cases are covered (e.g., daily vs quarterly pacing)
- [ ] Integration points verified (API routes, workers, UI)

### Architectural Validation

- [ ] Technology choices match actual package.json
- [ ] ADR dates match actual files in `/ADR/`
- [ ] Build system matches actual npm scripts
- [ ] Infrastructure descriptions match config files

### Test Validation

- [ ] Test count matches actual test files
- [ ] Testing framework matches (Vitest, fast-check, etc.)
- [ ] Test organization matches actual structure
- [ ] Coverage metrics are current (run `npm test`)

---

## Part 6: Anti-Patterns to Avoid

### 🚫 DO NOT:

1. **Generate documentation from memory** - Always read actual code first
2. **Assume function names** - Verify every export via code-explorer
3. **Invent plausible-sounding constants** - Check actual values
4. **Fabricate ADR dates** - Read actual ADR files
5. **Describe generic patterns** - Document project-specific implementations
6. **Trust AI summaries without validation** - Cross-check with tests

### ✅ DO:

1. **Read source files first** - Use code-explorer agent
2. **Verify with tests** - Cross-reference test expectations
3. **Check git history** - Understand evolution of implementations
4. **Review actual ADRs** - Use architect-review agent
5. **Validate integrations** - Trace API → worker → database flows
6. **Human review final docs** - Expert validation before NotebookLM ingest

---

## Part 7: Success Metrics

### Phase 1 Success Criteria

- [ ] All 3 engines documented with accurate APIs
- [ ] Waterfall systems (both) fully explained with examples
- [ ] Invariants cross-referenced with test cases
- [ ] No fabricated function names or constants

### Phase 2 Success Criteria

- [ ] Sidecar architecture accurately described (npm isolation, NOT legacy
      bridge)
- [ ] Actual ADRs documented with correct dates
- [ ] Technology choices justified with evidence

### Phase 3 Success Criteria

- [ ] PBT strategy documented with property catalog
- [ ] Test organization matches actual file structure
- [ ] Coverage gaps identified and documented

### Overall Success Metric

**Target:** 95%+ factual accuracy on code-checkable claims (function names, file
paths, constants, test counts)

---

## Part 8: Next Steps

### For Next Conversation:

1. **Start with Phase 1, Task 1.1 (Waterfall)**
   - Use code-explorer agent to map both waterfall systems
   - Use waterfall-specialist to validate domain logic
   - Use docs-architect to generate formal documentation

2. **Validation Loop:**

   ```
   For each engine:
     1. Deploy code-explorer (extract actual implementation)
     2. Deploy specialist agent (validate domain correctness)
     3. Deploy test-automator (analyze test coverage)
     4. Aggregate findings
     5. Deploy docs-architect (generate documentation)
     6. Human review (YOU validate accuracy)
     7. Iterate if discrepancies found
   ```

3. **Track Progress:**
   - Use TodoWrite tool to maintain task checklist
   - Mark tasks complete only after validation passes
   - Document any new discoveries in CHANGELOG.md

4. **Final Output:**
   - Consolidated documentation set ready for NotebookLM ingestion
   - Validation report showing 95%+ accuracy
   - Integration guide for agents using NotebookLM content

---

## Part 9: Critical Reminders

### For AI Agents Working on This:

1. **Ground every claim in actual code** - Use Read tool before documenting
2. **Never invent function names** - Verify exports with code-explorer
3. **Cross-reference with tests** - Tests are source of truth for behavior
4. **Document what EXISTS, not what SHOULD exist** - This is forensic, not
   prescriptive

### For Human Reviewer:

1. **Spot-check function signatures** - Run TypeScript compiler to verify
2. **Validate test counts** - Grep for `it(` or `test(` in test files
3. **Verify file paths** - Use Glob tool to confirm files exist
4. **Challenge plausible-sounding details** - If it sounds too perfect, verify
   with git

---

## Part 10: Resources

### Key Files to Reference

- `CLAUDE.md` - Project conventions and patterns
- `DECISIONS.md` - Actual ADRs (3 as of 2025-10-03)
- `SIDECAR_GUIDE.md` - Accurate sidecar documentation (255 lines)
- `client/src/lib/waterfall.ts` - Waterfall UI utilities (149 lines)
- `shared/schemas/waterfall-policy.ts` - Waterfall calculations
- `client/src/core/reserves/` - Three reserve engines (1,212 total lines)
- `client/src/core/pacing/PacingEngine.ts` - Pacing logic (161 lines)
- `vitest.config.ts` - Test configuration (dual projects)

### Agent Roster for Data Collection

- `code-explorer` - Map implementations
- `waterfall-specialist` - Validate waterfall domain logic
- `architect-review` - Validate architectural patterns
- `test-automator` - Analyze test strategies
- `docs-architect` - Generate formal documentation
- `database-expert` - Validate data layer integrations

### Multi-AI Consultation Points

- Use `ai_consensus` when multiple valid documentation approaches exist
- Use `gemini_think_deep` for algorithmic explanations (Exit MOIC, etc.)
- Use `openai_architecture` for high-level system design validation

---

## Conclusion

This handoff memo provides everything needed to execute accurate business logic
documentation for NotebookLM. The key principle is **grounding in actual code**,
validated by agent investigation and cross-referenced with test expectations.

**Previous attempt:** 0% accuracy (complete hallucination) **Target for next
attempt:** 95%+ accuracy (forensically validated)

Start with Phase 1, Task 1.1 (Waterfall documentation) and follow the validation
loop religiously. Good luck! 🚀
