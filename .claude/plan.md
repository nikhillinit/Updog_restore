# Technical Debt Remediation Plan (v3 - Skill-Enhanced)

**Generated:** 2025-12-29
**Branch:** `claude/identify-tech-debt-ucn56`
**Methodology:** Extended Thinking Framework + Inversion Thinking + Pattern Recognition

---

## Extended Thinking Analysis

```xml
<research_thinking>
  <initial_analysis>
    Task: Create actionable tech debt remediation plan for Updog_restore

    Known:
    - 60+ debt items identified across 6 domains
    - Previous PR #313 addressed Issue #309 partially
    - Existing tooling: Phoenix truth cases, TypeScript baseline, schema-drift-checker
    - Team has limited capacity (need prioritization)

    Constraints:
    - Cannot break production calculations (financial accuracy critical)
    - Must maintain backward compatibility during transition
    - Need stakeholder decisions on canonical schemas

    Success Criteria:
    - Prioritized backlog with acceptance criteria
    - Risk mitigation for each high-priority item
    - Integration with existing validation tools
    - Clear ownership and verification commands

    Risks:
    - Schema changes could break data integrity
    - XIRR consolidation could cause calculation drift
    - Type strictness could expose runtime issues
  </initial_analysis>

  <strategy>
    Approach:
    1. Apply inversion-thinking to identify failure modes
    2. Use pattern-recognition to find cross-domain themes
    3. Apply tech-debt-tracker prioritization (impact/effort ratio)
    4. Define verification using existing Phoenix truth cases
    5. Create do-not checklist to gate changes

    Tools:
    - /phoenix-truth for financial calculation validation
    - schema-drift-checker for Drizzle/Zod alignment
    - TypeScript baseline for type safety tracking
    - /test-smart for affected test selection

    Validation:
    - All changes validated against Phoenix truth cases
    - Type baseline must not regress
    - Integration tests must pass
  </strategy>
</research_thinking>
```

---

## Inversion Thinking: Failure Mode Analysis

**Inverted Question:** "What would make this tech debt remediation catastrophically wrong?"

### Do-Not Checklist (Gate All Changes)

| Failure Mode | Do-Not Rule | Verification |
|--------------|-------------|--------------|
| Break financial calculations | Do NOT change XIRR without running Phoenix truth cases | `/phoenix-truth focus=xirr` |
| Data integrity loss | Do NOT change StageSchema without migration plan | Review all 6 files, test with production data |
| Silent type errors | Do NOT enable strict mode without test coverage | Check coverage before strictness |
| Regression in existing functionality | Do NOT merge without baseline comparison | `npm run check` baseline |
| Incomplete migration | Do NOT deprecate without updating ALL consumers | Grep for all usages before deprecation |
| Break backward compatibility | Do NOT remove old schemas until consumers migrated | Add deprecation warnings first |

### Anti-Patterns to Avoid

```
[x] Do NOT fix schema issues file-by-file (creates inconsistency)
[x] Do NOT consolidate XIRR without Excel parity testing
[x] Do NOT delete backup files without checking git history
[x] Do NOT change day-count conventions without stakeholder approval
[x] Do NOT enable type strictness in hot paths without benchmarking
[x] Do NOT skip the schema-drift-checker after Zod changes
```

---

## Pattern Recognition: Cross-Domain Themes

### Pattern 1: Naming Inconsistency (6 locations)

```
Detected: StageSchema naming varies across files
- preseed vs pre_seed vs pre-seed
- series_dplus vs late_stage vs growth

Files: shared/schemas.ts, reserves-schemas.ts, fund-model.ts,
       reserve-engine.contract.ts, types.ts, fund-wire-schema.ts

Root Cause: Organic growth without centralized schema definition
Impact: Data integrity risk, serialization errors, API contract confusion
Pattern Type: SCHEMA_DRIFT
```

### Pattern 2: Duplicate Implementations (3 locations)

```
Detected: Multiple implementations of same concept
- XIRR: 2 implementations (365 vs 365.25 day-count)
- ReserveInputSchema: 2 definitions (completely different structures)
- Fund calculation: v1 and v2 coexist

Root Cause: Incremental development without consolidation
Impact: Calculation drift, maintenance burden, confusion
Pattern Type: CODE_DUPLICATION
```

### Pattern 3: Layer Violations (4 locations)

```
Detected: Cross-boundary imports
- server/routes.ts imports from client/src/core/
- Engines not in shared package

Related Issues: #309 (partially addressed in PR #313)
Root Cause: Rapid development, engines started in client
Impact: Build coupling, deployment complexity
Pattern Type: ARCHITECTURE_VIOLATION
```

### Pattern 4: Type Safety Bypass (150+ files)

```
Detected: Systematic eslint-disable for any types
- 50+ server files
- 100+ client files
- Storage interface uses any
- WebSocket handlers untyped

Root Cause: Technical debt accumulation, deadline pressure
Impact: Runtime errors, IDE degradation, refactoring difficulty
Pattern Type: TYPE_EROSION
```

### Cross-Pattern Synthesis

```
Theme: Organic growth without consolidation checkpoints
→ Multiple schemas evolved independently
→ Multiple implementations exist for same concepts
→ Type safety was bypassed for speed

Recommendation: Establish "consolidation checkpoints" in development workflow
→ Before major releases, audit for duplicate implementations
→ Run schema-drift-checker weekly
→ Track type safety baseline trends
```

---

## SQALE-Based Prioritization

Using tech-debt-tracker methodology: **Impact/Effort Ratio**

### Tier 0: Quick Wins (< 1 hour each, high signal)

| Item | Impact | Effort | Ratio | Verification |
|------|--------|--------|-------|--------------|
| Delete `lp-api.ts.backup` | 2 | 0.1h | 20 | `git status` clean |
| Pin pgAdmin Docker version | 2 | 0.1h | 20 | `docker-compose.yml` updated |
| Fix sourcemap always-true | 2 | 0.1h | 20 | `vite.config.ts:314` |
| Add *.backup to .gitignore | 2 | 0.1h | 20 | `.gitignore` updated |

**Total: 0.4 hours, 4 items resolved**

### Tier 1: High Impact, Low Effort (1-4 hours each)

| Item | Impact | Effort | Ratio | Verification |
|------|--------|--------|-------|--------------|
| Rename duplicate ReserveInputSchema | 8 | 1h | 8.0 | No type errors, tests pass |
| Replace Docker hardcoded passwords | 7 | 1h | 7.0 | All `${ENV_VAR:-default}` |
| Type storage.ts interface (3 methods) | 6 | 2h | 3.0 | `any` removed from interface |
| Type WebSocket handlers | 6 | 2h | 3.0 | Zod-aligned event types |

**Total: 6 hours, 4 items resolved**

### Tier 2: High Impact, Medium Effort (1-2 days each)

| Item | Impact | Effort | Ratio | Verification |
|------|--------|--------|-------|--------------|
| Unify StageSchema (6 files) | 9 | 8h | 1.1 | Single canonical, Phoenix passes |
| Consolidate XIRR (365.25 canonical) | 9 | 6h | 1.5 | 50 golden tests pass, Phoenix XIRR |
| Complete Issue #309 (engine move) | 8 | 16h | 0.5 | No cross-boundary imports |

**Total: 30 hours, 3 items resolved**

### Tier 3: Strategic (Multi-sprint)

| Item | Impact | Effort | Ratio | Approach |
|------|--------|--------|-------|----------|
| 150+ files with `any` | 10 | 40h+ | 0.25 | Incremental, 10 files/sprint |
| Split routes.ts (857 lines) | 6 | 12h | 0.5 | Extract by resource |
| Test coverage (34/37 routes) | 8 | 30h+ | 0.27 | Critical paths first |

---

## Refined Sprint Plan with Verification

### Sprint 1: Quick Wins + Foundation (2 days)

**Goal:** Resolve all Tier 0 + start Tier 1

```bash
# Day 1: Quick Wins
rm server/routes/lp-api.ts.backup
echo "*.backup" >> .gitignore
# Fix vite.config.ts:314 sourcemap conditional
# Pin pgAdmin version in docker-compose.yml

# Verification
git status  # Should be clean after commit
npm run check  # Baseline unchanged

# Day 2: ReserveInputSchema rename
# shared/schemas.ts:32 → ReserveAllocationInputSchema
# shared/types.ts:89 → ReserveCompanyInputSchema
# Update all imports

# Verification
npm test  # All tests pass
npm run check  # No new errors
```

**Acceptance Criteria:**
- [ ] No backup files in repository
- [ ] .gitignore includes *.backup pattern
- [ ] pgAdmin version pinned
- [ ] sourcemap config simplified
- [ ] ReserveInputSchema split into two distinct schemas
- [ ] All tests pass

### Sprint 2: Schema Unification (4 days)

**Goal:** Create canonical StageSchema

```bash
# Step 1: Create shared/schemas/common.ts with canonical schema
# Canonical: ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'growth', 'late_stage']

# Step 2: Add normalization utility
export function normalizeStage(input: string): CanonicalStage {
  const normalized = input.toLowerCase()
    .replace(/-/g, '_')
    .replace('preseed', 'pre_seed')
    .replace('series_dplus', 'late_stage');
  return CanonicalStageSchema.parse(normalized);
}

# Step 3: Update all 6 files with deprecation warnings

# Verification
/phoenix-truth focus=all
npm run check
npm test
```

**Acceptance Criteria:**
- [ ] Single `CanonicalStageSchema` in `shared/schemas/common.ts`
- [ ] Normalization utility handles all legacy formats
- [ ] All 6 files updated to import from common.ts
- [ ] Deprecation warnings on old exports
- [ ] Phoenix truth cases pass
- [ ] schema-drift-checker reports clean

### Sprint 3: XIRR Consolidation (3 days)

**Goal:** Single XIRR implementation with verified Excel parity

```bash
# Step 1: Verify finance/xirr.ts is canonical
npm test -- --project=server --grep="xirr"
npm test -- --project=server --grep="golden"

# Step 2: Add deprecation to lib/xirr.ts
/** @deprecated Use @/lib/finance/xirr instead */

# Step 3: Update all imports
# Find: from '@/lib/xirr'
# Replace: from '@/lib/finance/xirr'

# Verification
/phoenix-truth focus=xirr
npm test -- --grep="xirr"
```

**Acceptance Criteria:**
- [ ] All 50 XIRR golden tests pass
- [ ] `lib/xirr.ts` marked deprecated
- [ ] All imports use `finance/xirr.ts`
- [ ] Phoenix XIRR truth cases pass
- [ ] No calculation drift (diff reports clean)

### Sprint 4: Type Safety Foundation (1 week)

**Goal:** Establish type safety baseline

```bash
# Step 1: Type storage.ts interface
createInvestment(investment: InsertInvestment): Promise<Investment>;
addInvestmentRound(investmentId: number, round: InvestmentRoundInput): Promise<InvestmentRound>;
addPerformanceCase(investmentId: number, caseData: PerformanceCaseInput): Promise<PerformanceCase>;

# Step 2: Type WebSocket handlers
interface SubscribeData { fundId: number; eventTypes?: string[]; }
socket.on('subscribe:fund', async (data: SubscribeData, callback: SubscribeCallback) => {...});

# Step 3: Enable strict mode on 10 shared/ files

# Verification
npm run check  # Baseline reduced by 10%
npm test
```

**Acceptance Criteria:**
- [ ] storage.ts interface fully typed (no `any`)
- [ ] WebSocket handlers typed with Zod-aligned interfaces
- [ ] 10 files in `shared/` have strict mode enabled
- [ ] TypeScript baseline errors reduced by 10%
- [ ] All tests pass

---

## Risk Mitigation Matrix

| Risk | Probability | Impact | Mitigation | Contingency |
|------|-------------|--------|------------|-------------|
| StageSchema breaks production data | Medium | Critical | Normalization layer, staged rollout | Revert to legacy schemas |
| XIRR consolidation causes drift | Low | Critical | Phoenix truth validation, diff reports | Keep both implementations with feature flag |
| Type strictness exposes runtime bugs | Medium | Medium | Enable file-by-file with test coverage | Revert strictness, add tests first |
| Docker password change breaks dev | Low | Low | Document env var requirements | Provide .env.example |
| routes.ts split breaks API | Low | Medium | API integration tests | Gradual extraction, keep old route as facade |

---

## Continuous Improvement: Reflection Prompts

After each sprint, answer:

1. **What Worked Well?**
   - Which verification commands caught issues early?
   - Which tools were most effective?

2. **What Was Inefficient?**
   - Where did we get stuck?
   - What required multiple attempts?

3. **Surprising Insights?**
   - What assumptions were wrong?
   - What edge cases emerged?

4. **Clarity Improvements?**
   - What should be documented better?
   - What naming could be clearer?

5. **Changes for Next Sprint?**
   - What patterns will we adopt?
   - What anti-patterns will we avoid?

---

## Integration with Existing Tools

### Before Any Change

```bash
# Capture baseline state
npm run check > baseline-before.txt
npm test -- --reporter=json > tests-before.json
```

### After Schema Changes

```bash
# Run schema drift checker
# Invoke: schema-drift-checker agent

# Verify Phoenix truth cases
/phoenix-truth focus=all
```

### After Financial Calculation Changes

```bash
# Run XIRR validation
/phoenix-truth focus=xirr

# Run golden tests
npm test -- --project=server --grep="golden"
```

### After Type Changes

```bash
# Verify baseline
npm run check
# Compare to baseline-before.txt

# Run affected tests
/test-smart
```

---

## Metrics Dashboard

| Metric | Current | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 |
|--------|---------|----------|----------|----------|----------|
| StageSchema definitions | 6 | 6 | 1 | 1 | 1 |
| XIRR implementations | 2 | 2 | 2 | 1 | 1 |
| ReserveInputSchema dups | 2 | 1 | 1 | 1 | 1 |
| Files with `any` disable | 150+ | 150 | 145 | 140 | 130 |
| TypeScript baseline errors | ~45 | 45 | 43 | 40 | 35 |
| Backup files in repo | 1 | 0 | 0 | 0 | 0 |
| Docker hardcoded passwords | 3 | 0 | 0 | 0 | 0 |

---

## Decisions Required (Stakeholder Input)

### Decision 1: Canonical StageSchema Values

**Options:**
- A: `['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'growth', 'late_stage']`
- B: Keep domain-specific variants with normalization layer

**Recommendation:** Option A with normalization for legacy data

**Impact:** All 6 schema files, database records, API contracts

### Decision 2: XIRR Day-Count Convention

**Options:**
- A: 365 (documentation says this)
- B: 365.25 (matches Excel empirically per finance/xirr.ts comment)

**Recommendation:** Option B (365.25) - matches Excel, has 50 golden tests

**Impact:** All XIRR calculations, fund IRR reports

### Decision 3: Type Strictness Timeline

**Options:**
- A: Aggressive (20 files/sprint)
- B: Conservative (10 files/sprint)
- C: Critical paths only

**Recommendation:** Option B - balanced risk/progress

**Impact:** Development velocity, bug discovery rate

---

## Quality Gate: Pre-Merge Checklist

Before merging ANY tech debt PR:

- [ ] All affected Phoenix truth cases pass
- [ ] TypeScript baseline does not regress
- [ ] All tests pass (`npm test`)
- [ ] schema-drift-checker reports clean (if schema changes)
- [ ] No new `any` types introduced
- [ ] Deprecation warnings added before removal
- [ ] CHANGELOG.md updated
- [ ] PR description includes verification evidence

---

## Notes

- Plan created using Extended Thinking Framework
- Failure modes identified via Inversion Thinking
- Cross-domain patterns detected via Pattern Recognition
- Prioritization uses SQALE-based Impact/Effort ratio from tech-debt-tracker skill
- All verification integrates with existing Phoenix truth cases and baseline systems
