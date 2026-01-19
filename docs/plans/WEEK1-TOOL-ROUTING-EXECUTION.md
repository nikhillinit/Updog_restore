---
status: ACTIVE
last_updated: 2026-01-19
---

# Week 1 Tech Debt - Tool Routing Execution Plan

**Created**: 2025-12-19
**Status**: READY FOR EXECUTION
**Branch**: `claude/review-tech-debt-b2hJS`

## Tool Routing Philosophy

Each stage uses the **optimal combination** of:
- **Phoenix Agents** - VC fund domain expertise (truth cases, precision, waterfall)
- **Workflow Engine Skills** - Automated scanning (<100ms execution)
- **Workflow Engine Agents** - TypeScript/security expertise
- **wshobson Commands** - Comprehensive analysis templates
- **Repo Slash Commands** - `/fix-auto`, `/test-smart`, `/deploy-check`

---

## Day 1: Security Patches

### Stage 1.1: Security Scanning
**Tool Routing:**
```
PRIMARY:   security-scanner (workflow-engine skill)
SECONDARY: deps-audit (wshobson command)
VALIDATE:  /deploy-check (repo command)
```

**Execution Sequence:**
1. `security-scanner --operation scan-all` → OWASP + secrets + vulnerabilities
2. `deps-audit` analysis → CVE scanning + license compliance
3. `/deploy-check` → validate build integrity after patches

**Why This Combination:**
- security-scanner: Fast automated scanning (<500ms)
- deps-audit: Detailed remediation guidance with CVE references
- /deploy-check: Ensures patches don't break build

### Stage 1.2: vite.config.ts Security Hardening
**Tool Routing:**
```
PRIMARY:   security-engineer (workflow-engine agent)
SECONDARY: typescript-pro (wshobson agent, model: opus)
VALIDATE:  phoenix-precision-guardian (Phoenix agent)
```

**Execution Sequence:**
1. `security-engineer` → Review ESBuild strictness override implications
2. `typescript-pro` → Recommend strict TypeScript configuration
3. `phoenix-precision-guardian` → Ensure no precision regressions

**Why This Combination:**
- security-engineer: Security-focused review expertise
- typescript-pro (opus): Advanced type system knowledge
- phoenix-precision-guardian: Ensures financial calculations unaffected

### Stage 1.3: ESLint Security Rules
**Tool Routing:**
```
PRIMARY:   /fix-auto (repo command)
SECONDARY: code-formatter (workflow-engine skill)
VALIDATE:  code-reviewer (workflow-engine agent)
```

**Execution Sequence:**
1. Uncomment security config in eslint.config.js
2. `/fix-auto` → Auto-fix lint issues
3. `code-formatter` → Ensure consistent formatting
4. `code-reviewer` → Quality gate review

---

## Day 2: Express Type Consolidation

### Stage 2.1: Type Conflict Analysis
**Tool Routing:**
```
PRIMARY:   typescript-pro (wshobson agent, model: opus)
SECONDARY: schema-drift-checker (Phoenix agent)
TERTIARY:  documentation-sync (workflow-engine skill)
```

**Execution Sequence:**
1. `typescript-pro` → Analyze 4 conflicting Express type files
2. `schema-drift-checker` → Verify type alignment across layers
3. `documentation-sync` → Check if JSDoc matches implementation

**Why This Combination:**
- typescript-pro: Deep TypeScript expertise for namespace vs module augmentation
- schema-drift-checker: Validates Drizzle → Zod → Express type chain
- documentation-sync: Ensures docs reflect type changes

### Stage 2.2: Type Consolidation Implementation
**Tool Routing:**
```
PRIMARY:   legacy-modernizer (wshobson agent)
SECONDARY: typescript-pro (workflow-engine agent)
VALIDATE:  /deploy-check (repo command)
```

**Execution Sequence:**
1. `legacy-modernizer` → Apply strangler fig pattern for gradual migration
2. `typescript-pro` → Implement consolidated type definitions
3. `/deploy-check` → Verify build passes with consolidated types

**Why This Combination:**
- legacy-modernizer: Safe migration patterns, backward compatibility
- typescript-pro: Type-safe implementation
- /deploy-check: Build validation

---

## Day 3: Engine Test Re-enablement

### Stage 3.1: Test Discovery & Baseline
**Tool Routing:**
```
PRIMARY:   test-first-change (workflow-engine skill)
SECONDARY: phoenix-truth-case-runner (Phoenix agent)
TERTIARY:  tech-debt-tracker (workflow-engine skill)
```

**Execution Sequence:**
1. `test-first-change` → Discover all skipped tests, establish baseline
2. `phoenix-truth-case-runner` → Run truth case suite, compute pass rates
3. `tech-debt-tracker` → Quantify testing debt metrics

**Why This Combination:**
- test-first-change: Test discovery before code changes (TDD principle)
- phoenix-truth-case-runner: 119 truth cases for validation
- tech-debt-tracker: Metrics for tracking progress

### Stage 3.2: Engine Test Re-enablement
**Tool Routing:**
```
PRIMARY:   test-automator (workflow-engine agent)
SECONDARY: waterfall-specialist (Phoenix agent) [if waterfall tests]
SECONDARY: xirr-fees-validator (Phoenix agent) [if XIRR tests]
VALIDATE:  /test-smart (repo command)
```

**Execution Sequence:**
1. `test-automator` → Strategy for re-enabling 5 describe.skip blocks
2. `waterfall-specialist` → Validate ReserveEngine/PacingEngine semantics
3. `xirr-fees-validator` → Validate edge case calculations
4. `/test-smart` → Run only affected tests

**Target Files:**
- `tests/api/engines.test.ts:5` - ReserveEngine
- `tests/api/engines.test.ts:69` - PacingEngine
- `tests/api/cohort-engine.test.ts:5` - CohortEngine
- `tests/api/edge-cases.test.ts:6` - Edge Cases - ReserveEngine
- `tests/api/edge-cases.test.ts:203` - Edge Cases - PacingEngine

**Why This Combination:**
- test-automator: Test strategy and coverage expertise
- Phoenix specialists: Domain knowledge for VC fund calculations
- /test-smart: Efficient test selection

---

## Day 4: Validation Pipeline

### Stage 4.1: Validation Middleware Fix
**Tool Routing:**
```
PRIMARY:   phoenix-precision-guardian (Phoenix agent)
SECONDARY: typescript-pro (wshobson agent)
TERTIARY:  schema-drift-checker (Phoenix agent)
```

**Execution Sequence:**
1. `phoenix-precision-guardian` → Fix validation.ts:39 type coercion
2. `typescript-pro` → Ensure type safety in req.query/req.params
3. `schema-drift-checker` → Verify Zod → Express type alignment

**Target File:** `server/middleware/validation.ts`
- Line 39: Fix `req.query = result.data as Record<string, string | string[]>;`
- Lines 23, 37, 51, 62: Fix bracket notation `res["status"](400)`

**Why This Combination:**
- phoenix-precision-guardian: Coercion patterns, precision enforcement
- typescript-pro: Type safety for validation results
- schema-drift-checker: End-to-end type alignment

### Stage 4.2: Coercion Helpers
**Tool Routing:**
```
PRIMARY:   phoenix-precision-guardian (Phoenix agent)
SECONDARY: documentation-sync (workflow-engine skill)
TERTIARY:  phoenix-docs-scribe (Phoenix agent)
```

**Execution Sequence:**
1. `phoenix-precision-guardian` → Add toBoolean to shared/booleans.ts
2. `documentation-sync` → Detect code/docs drift
3. `phoenix-docs-scribe` → Sync JSDoc with implementation

**Existing Helpers (no need to create):**
- `shared/booleans.ts` → `zBooleanish` exists
- `shared/number.ts` → `zNumberish`, `toNumber` exist

**Why This Combination:**
- phoenix-precision-guardian: Precision in type coercion
- documentation-sync: Ensures docs stay current
- phoenix-docs-scribe: JSDoc synchronization

---

## Day 5: Final Validation

### Stage 5.1: Lint & Format Cleanup
**Tool Routing:**
```
PRIMARY:   /fix-auto (repo command)
SECONDARY: code-formatter (workflow-engine skill)
TERTIARY:  tech-debt-tracker --operation prioritize (workflow-engine skill)
```

**Execution Sequence:**
1. `/fix-auto` → Automated lint/format/test fixes
2. `code-formatter` → ESLint + Prettier automation
3. `tech-debt-tracker --operation prioritize` → Verify debt reduction

### Stage 5.2: Final Quality Gate
**Tool Routing:**
```
PRIMARY:   code-reviewer (workflow-engine agent)
SECONDARY: phoenix-truth-case-runner (Phoenix agent)
TERTIARY:  /deploy-check (repo command)
```

**Execution Sequence:**
1. `code-reviewer` → Full review of Week 1 changes
2. `phoenix-truth-case-runner` → Verify no truth case regressions
3. `/deploy-check` → Comprehensive build + bundle + smoke tests

**Success Criteria:**
- [ ] All 5 engine test suites re-enabled and passing
- [ ] Express types consolidated to 1 file
- [ ] vite.config.ts strictness overrides removed
- [ ] ESLint security config re-enabled
- [ ] Truth case pass rates unchanged or improved

---

## Tool Invocation Reference

### Workflow Engine Skills (Fast, Deterministic)
```bash
# Tech Debt Analysis
python3 .claude/skills/workflow-engine/tech-debt-tracker/scripts/main.py \
  '{"operation": "scan", "project_dir": "."}'

# Security Scanning
python3 .claude/skills/workflow-engine/security-scanner/scripts/main.py \
  --operation scan-all --path .

# Test Discovery
# Uses test-first-change skill for baseline establishment
```

### Phoenix Agents (Domain Expertise)
```bash
# Truth Case Validation
Task("phoenix-truth-case-runner", "Run full truth case suite and compute pass rates")

# Precision Enforcement
Task("phoenix-precision-guardian", "Scan validation.ts for type coercion issues")

# Waterfall Semantics
Task("waterfall-specialist", "Validate ReserveEngine tests after re-enablement")
```

### wshobson Agents (Advanced Analysis)
```bash
# TypeScript Expertise (model: opus)
Task("typescript-pro", "Consolidate Express type definitions and remove conflicts")

# Legacy Migration
Task("legacy-modernizer", "Apply strangler fig pattern for type consolidation")

# Comprehensive Debt Analysis
# Follow .claude/commands/wshobson/tech-debt.md template
```

### Repo Slash Commands
```bash
/fix-auto          # Automated lint/format/test fixes
/test-smart        # Intelligent test selection
/deploy-check      # Build + bundle + smoke tests
/phoenix-truth     # Truth case validation
```

---

## Routing Decision Tree

```
START: What task are we doing?

├─ Security scanning?
│  → security-scanner skill (fast) + deps-audit command (detailed)
│
├─ TypeScript type issues?
│  → typescript-pro agent (wshobson, opus) + schema-drift-checker (Phoenix)
│
├─ Test re-enablement?
│  → test-first-change skill + test-automator agent + Phoenix specialists
│
├─ Validation/coercion?
│  → phoenix-precision-guardian + typescript-pro agent
│
├─ Documentation sync?
│  → documentation-sync skill + phoenix-docs-scribe
│
├─ Final validation?
│  → code-reviewer agent + phoenix-truth-case-runner + /deploy-check
│
└─ Quick fixes needed?
   → /fix-auto + code-formatter skill
```

---

## Execution Authorization

**To begin Day 1 execution with the tool routing above, confirm:**
- [ ] Proceed with Stage 1.1 (Security Scanning)
- [ ] Proceed with full Day 1 (all 3 stages)
- [ ] Proceed with full Week 1 (all 5 days)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-19
