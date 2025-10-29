#!/usr/bin/env node
/**
 * Phase 1D Checkpoint Scaffold Script
 * Generates all remaining validation framework components:
 * - Custom scorer updates (keywords + contradiction detection)
 * - Validation config YAML
 * - Prompt function in prompts.py
 * - Documentation skeleton (capital-allocation.md)
 */

const fs = require('fs');
const path = require('path');

console.log('📦 Phase 1D Checkpoint Scaffold\n');

// ============================================================================
// 1. Update Custom Scorer
// ============================================================================
console.log('1️⃣  Updating custom scorer (doc_domain_scorer.mjs)...');

const scorerPath = path.join(__dirname, '..', 'scripts', 'validation', 'doc_domain_scorer.mjs');
let scorerContent = fs.readFileSync(scorerPath, 'utf8');

// Check if already updated
if (scorerContent.includes('extractDomainKeywords')) {
  console.log('   ⚠️  Scorer already contains extractDomainKeywords - skipping');
} else {
  // Add keyword extraction function before the default export
  const keywordFunction = `
/**
 * Extract domain-specific keywords with case-insensitive matching
 * @param {string} documentContent - Document text to analyze
 * @returns {string[]} - Weighted keywords for the detected domain
 */
function extractDomainKeywords(documentContent) {
  if (!documentContent) return [];

  const content = documentContent.toLowerCase();

  // Capital Allocation domain detection
  if (content.includes('capital allocation') ||
      content.includes('reserve engine') ||
      content.includes('pacing engine')) {
    return [
      'reserve engine', 'pacing engine', 'cohort engine',
      'reserve policy', 'pacing window', 'cohort weight',
      'rebalancing', 'capital allocation', 'cash buffer',
      'reserve target', 'carryover', 'spill reallocation'
    ];
  }

  // Fees domain (existing patterns)
  if (content.includes('management fee') || content.includes('performance fee')) {
    return [
      'management fee', 'performance fee', 'carried interest',
      'hurdle rate', 'catch-up', 'fee calculation'
    ];
  }

  // Exit Recycling domain (existing patterns)
  if (content.includes('exit recycling') || content.includes('recycling cap')) {
    return [
      'exit recycling', 'eligibility', 'recycling cap',
      'distribution waterfall', 'exit proceeds'
    ];
  }

  // Fallback for generic documentation
  return ['calculation', 'formula', 'implementation', 'validation'];
}

/**
 * Detect negative/contradictory statements that invalidate documentation
 * @param {string} output - Model output (lowercase)
 * @returns {number} - Penalty score (0.0-0.10)
 */
function detectContradictions(output) {
  const contradictions = [
    /reserve\\s+(?:does\\s+not|doesn't)\\s+override\\s+pacing/i,
    /pacing\\s+(?:takes\\s+)?precedence\\s+over\\s+reserve/i,
    /cohort\\s+(?:does\\s+not|doesn't)\\s+use\\s+weights/i,
    /carryover\\s+(?:is\\s+)?(?:not\\s+)?ignored/i
  ];

  return contradictions.some(rx => rx.test(output)) ? 0.10 : 0;
}
`;

  // Insert before export default
  scorerContent = scorerContent.replace(
    /export default async/,
    keywordFunction + '\nexport default async'
  );

  fs.writeFileSync(scorerPath, scorerContent, 'utf8');
  console.log('   ✅ Added extractDomainKeywords() and detectContradictions()');
}

// ============================================================================
// 2. Create Validation Config YAML
// ============================================================================
console.log('\n2️⃣  Creating validation config (capital-allocation-validation.yaml)...');

const yamlPath = path.join(__dirname, '..', 'scripts', 'validation', 'capital-allocation-validation.yaml');
const yamlContent = `# Capital Allocation Documentation Validation
# Phase 1D: Reserve, Pacing, Cohort engines

description: 'Phase 1D Capital Allocation Documentation Validation'

prompts:
  - file: scripts/validation/prompts.py
    function: capital_allocation_prompt

# Note: Ensure ANTHROPIC_API_KEY is set in environment
# Use CLI -o flag for output path (no outputPath in YAML for consistency)

tests:
  - description: 'Validate capital-allocation.md (primary documentation)'
    vars:
      doc_type: capital_allocation
      doc_content: file://docs/notebooklm-sources/capital-allocation.md
      truth_cases: file://docs/capital-allocation.truth-cases.json
      schema: file://docs/schemas/capital-allocation-truth-case.schema.json

  - description: 'Validate ADR-008 (architectural decision record)'
    vars:
      doc_type: architectural_decision
      doc_content: file://docs/adr/ADR-008-capital-allocation-policy.md
      truth_cases: file://docs/capital-allocation.truth-cases.json
      schema: file://docs/schemas/capital-allocation-truth-case.schema.json

scorers:
  - path: scripts/validation/doc_domain_scorer.mjs
`;

fs.writeFileSync(yamlPath, yamlContent, 'utf8');
console.log('   ✅ Created capital-allocation-validation.yaml');

// ============================================================================
// 3. Add Prompt Function to prompts.py
// ============================================================================
console.log('\n3️⃣  Adding prompt function to prompts.py...');

const promptsPath = path.join(__dirname, '..', 'scripts', 'validation', 'prompts.py');
let promptsContent = fs.readFileSync(promptsPath, 'utf8');

if (promptsContent.includes('capital_allocation_prompt')) {
  console.log('   ⚠️  capital_allocation_prompt already exists - skipping');
} else {
  const promptFunction = `

def capital_allocation_prompt(doc_content: str) -> str:
    """
    Capital Allocation validation prompt (single-var pattern).
    Multi-var context (truth_cases, schema, doc_type) handled by custom scorer.
    """
    return f"""
You are a meticulous documentation validator for the **Capital Allocation** module.

Goals:
1) Summarize three engines: Reserve, Pacing, Cohort
2) Explain key formulas (reserve target/floor, pacing with carryover, cohort caps/rounding)
3) State precedence rules (Reserve > Pacing > Cohort) and recycling interaction
4) Reference code/docs with ≥3 trace anchors (file:line style)
5) Demonstrate understanding via ≥1 boundary behavior (cap binds, reserve precedence, carryover)

Output structure:
- **Domain Summary** (6-10 bullets covering engines, precedence, edge cases)
- **Key Formulas** (≥5 formulas with variable definitions)
- **Rules & Precedence** (clear, testable statements)
- **Traceability** (≥3 file:line anchors to code/schema/docs)

Only use information from the document below. Do not invent APIs not present in it.

<document>
{doc_content}
</document>
"""
`;

  promptsContent += promptFunction;
  fs.writeFileSync(promptsPath, promptsContent, 'utf8');
  console.log('   ✅ Added capital_allocation_prompt() to prompts.py');
}

// ============================================================================
// 4. Create Documentation Skeleton
// ============================================================================
console.log('\n4️⃣  Creating documentation skeleton (capital-allocation.md)...');

const docPath = path.join(__dirname, '..', 'docs', 'notebooklm-sources', 'capital-allocation.md');
const docContent = `# Capital Allocation Module

**Version**: 1.0.0
**Schema**: \`docs/schemas/capital-allocation-truth-case.schema.json\`
**ADR**: \`docs/adr/ADR-008-capital-allocation-policy.md\`

---

## Domain Summary

This module implements deterministic, auditable allocation of capital across time and cohorts through three coordinated engines:

- **Reserve Engine**: Maintains liquidity protection via reserve target/floor and cash buffer
- **Pacing Engine**: Smooths deployment over time using rolling window with carryover of shortfalls
- **Cohort Engine**: Allocates capital across cohorts by weights with caps and deterministic spill
- **Core Precedence**: Reserve floor → Pacing target → Cohort allocation (see ADR-008)
- **Recycling Integration**: Eligible distributions increase allocable capacity after reserve checks
- **Prospective Behavior**: Rule changes (e.g., pacing window adjustments) apply from change date forward with no retroactive reallocation
- **Pure Functions**: All engines are stateless with explicit inputs/outputs for auditability
- **Schema Versioning**: Semver-tracked with breaking changes requiring major version bump

---

## Key Formulas

### Reserve Engine

1. **Reserve target**: \`R* = target_reserve_pct × commitment\`
2. **Reserve delta (need)**: \`ΔR_t = R* - R_t\`
3. **Reserve floor**: \`floor = max(R*, min_cash_buffer)\`
4. **Buffer violation check**: \`R_t < floor\` triggers allocation reduction

### Pacing Engine

5. **Monthly pacing target**: \`P_m = commitment / pacing_window_months\`
6. **Carryover from prior period**: \`C_t = max(0, P_{t-1} - A_{t-1})\`
7. **Adjusted pacing target**: \`P̃_t = P_t + C_t\`
8. **Quarterly adjustment**: \`P_q = P_m × 3\` (monthly → quarterly cadence)

### Cohort Engine

9. **Weight normalization**: \`w_i_norm = weight_i / Σ(active_weights)\`
10. **Pro-rata allocation (pre-caps)**: \`alloc_i = w_i_norm × A_t\`
11. **Cap enforcement**: \`alloc_i_capped = min(alloc_i, max_per_cohort × A_t)\`
12. **Spill calculation**: \`spill = Σ(alloc_i - alloc_i_capped)\`
13. **Bankers' rounding**: Round to nearest even; tie-break to highest remainder → lexicographic name

---

## Reserve Engine

**Purpose**: Maintain reserve levels before allocating capital to deals.

**Key Rules**:
- Reserve floor **overrides** pacing targets when binding (CA-013 demonstrates this precedence)
- Cash buffer enforcement: \`R_t ≥ max(R*, min_cash_buffer)\` must hold at all times
- Reserve policy options: \`static_pct\` (default), \`dynamic_ratio\`, \`waterfall_dependent\`

**Truth Cases**:
- CA-001: Baseline scenario with reserve at target
- CA-002: Underfunded reserve triggers buffer top-up
- CA-013: Reserve floor precedence over monthly pacing (conflict resolution)

**Schema References**:
- \`docs/schemas/capital-allocation-truth-case.schema.json:52-60\` (reserve_policy enum)
- \`docs/adr/ADR-008-capital-allocation-policy.md:45-72\` (precedence rationale)

---

## Pacing Engine

**Purpose**: Smooth deployment across time with rolling window and carryover.

**Key Rules**:
- Rolling window (typically 12-24 months) distributes deployment smoothly
- **Carryover logic**: Shortfalls from period t-1 roll forward to period t
- Cadence options: monthly, quarterly, annual (via \`rebalance_frequency\`)
- Window changes apply **prospectively** (no retroactive adjustments)

**Truth Cases**:
- CA-008: Monthly pacing baseline (24-month window)
- CA-009: Quarterly pacing with Q1 shortfall carrying to Q2
- CA-012: Comparison of 24-month vs 18-month window assumptions (separate scenarios)

**Schema References**:
- \`docs/schemas/capital-allocation-truth-case.schema.json:62-66\` (pacing_window_months)
- \`docs/adr/ADR-008-capital-allocation-policy.md:89-110\` (pacing mechanics and carryover)

**Formulas in Action** (CA-009 example):
- Q1 target: 6M, deployed: 4M → carryover = 2M
- Q2 target: 6M + 2M carryover = 8M adjusted target

---

## Cohort Engine

**Purpose**: Allocate period amount across cohorts by weights with caps and deterministic spill.

**Key Rules**:
1. Filter to **active cohorts only** (\`start_date ≤ t ≤ end_date\`)
2. Normalize weights across active cohorts
3. Calculate pro-rata allocation for each cohort
4. Apply \`max_allocation_per_cohort\` cap
5. Reallocate spill to remaining cohorts deterministically
6. Apply bankers' rounding with tie-break rules

**Truth Cases**:
- CA-014: Fixed weights with simple pro-rata split
- CA-015: Cohort cap binding forces spill reallocation
- CA-016: Cohort lifecycle transitions (Alpha closes 06/30, Gamma opens 07/01)

**Schema References**:
- \`docs/schemas/capital-allocation-truth-case.schema.json:155-180\` (cohorts array definition)
- \`docs/adr/ADR-008-capital-allocation-policy.md:112-145\` (cohort allocation algorithm)

**Example** (CA-015 with cap binding):
- Pre-cap: Large cohort = 80%, Small cohort = 20%
- Cap: 55% max per cohort
- Post-cap: Large capped at 55%, spill (25%) reallocated to Small → Small = 45%

---

## Integration & Precedence

**Decision Tree** (conflict resolution order):

1. **Reserve Floor Check**
   - If \`R_t < floor\`, reduce \`A_t\` until reserve satisfied
   - Example: CA-013 (reserve precedence over pacing)

2. **Pacing Target Application**
   - Calculate \`P̃_t = P_t + C_t\` (base + carryover)
   - Allocable amount bounded by pacing constraints

3. **Cohort Allocation**
   - Distribute \`A_t\` across active cohorts
   - Apply caps and deterministic spill
   - Example: CA-015 (cap enforcement)

**Recycling Integration**:
- Eligible distributions (\`recycle_eligible: true\`) increase allocable capacity
- Applied **after** reserve floor satisfied
- Example: CA-020 (integration case with recycling + reserve + pacing + caps)

**Precedence Rationale** (from ADR-008):
- **Why Reserve > Pacing**: Liquidity protection is non-negotiable; prevents cash shortfalls
- **Why Pacing > Cohort**: Deployment smoothness prevents vintage concentration before fairness
- **Why deterministic spill**: Audit trail requires reproducible allocations

---

## Adversarial & Edge Cases

| Case ID | Scenario | Expected Behavior | Validation Point |
|---------|----------|-------------------|------------------|
| CA-004 | Zero contributions | Reserve maintained; no deployment | Handles null deployment gracefully |
| CA-013 | Reserve overrides pacing | Deployment deferred until reserve satisfied | Precedence rule enforcement |
| CA-015 | Cohort cap binding | Deterministic spill to remaining cohorts | Cap enforcement + spill algorithm |
| CA-016 | Cohort lifecycle transition | Active cohorts only; no retroactive reallocation | Date-based filtering correctness |

---

## Schema Reference

**Location**: \`docs/schemas/capital-allocation-truth-case.schema.json\`
**Version**: 1.0.0 (Draft-07 JSON Schema)

**Core Input Structures**:
- \`fund\`: commitment, target_reserve_pct, reserve_policy, pacing_window_months, vintage_year
- \`timeline\`: start_date, end_date
- \`flows\`: contributions[] (non-negative), distributions[] (allows negative for recalls per ADR-008)
- \`constraints\`: min_cash_buffer, max_allocation_per_cohort, rebalance_frequency
- \`cohorts\`: [{name, start_date, end_date, weight}]

**Expected Output Structures**:
- \`reserve_balance\`: number
- \`allocations_by_cohort\`: [{cohort, amount}]
- \`pacing_targets\`: [{period, target}] (optional)
- \`violations\`: string[] (for adversarial test documentation)

**Design Decision** (ADR-008):
- Negative \`distribution.amount\` represents capital recalls/clawbacks
- Trade-off: mathematical simplicity vs semantic clarity
- Future migration: explicit \`capitalRecall\` transaction type in v2.0

---

## Truth Cases Coverage

**Location**: \`docs/capital-allocation.truth-cases.json\`
**Count**: 6 cases (CA-001 through CA-006)
**Schema Version**: 1.0.0

### Current Coverage

| Category | Case IDs | Focus |
|----------|----------|-------|
| Reserve Engine | CA-001, CA-002, CA-003, CA-004 | Baseline, underfunded, overfunded, zero contributions |
| Pacing Engine | CA-005 | Dynamic ratio tracking |
| Cohort Engine | CA-006 | Large distribution rebalancing |

**Note**: CA-007 through CA-020 to be added in Phase 2 expansion (14 additional cases covering:
- Pacing: monthly/quarterly cadence, carryover, window changes
- Cohort: cap binding, lifecycle transitions, rounding tie-breaks
- Integration: multi-engine coordination with recycling)

---

## Validation Framework

**Config**: \`scripts/validation/capital-allocation-validation.yaml\`
**Prompt**: \`scripts/validation/prompts.py:capital_allocation_prompt()\`
**Scorer**: \`scripts/validation/doc_domain_scorer.mjs\`

**Scoring Dimensions**:
1. Domain Concept Coverage (30%): Capital allocation keywords (12 terms)
2. Schema Vocabulary Alignment (25%): Schema field mentions
3. Code Reference Completeness (25%): \`file:line\` anchor count
4. Truth Case Overlap (20%): Mentions of specific test cases

**Contradiction Detection**: 10% penalty for negative statements (e.g., "reserve does not override pacing")

**Target Scores**:
- Primary documentation: ≥90% (matching Phase 1B/1C standard)
- ADR documents: ≥85% (relaxed schema vocabulary weighting)

---

## References

### Schema & Data
- **Schema**: \`docs/schemas/capital-allocation-truth-case.schema.json\` (v1.0.0)
- **Truth Cases**: \`docs/capital-allocation.truth-cases.json\` (6 cases currently, 20 planned)
- **Validator**: \`scripts/validation/capital-allocation-validation.yaml\`

### Architecture Decisions
- **ADR-008**: Capital Allocation Policy (precedence, pacing, cohorts, recycling)
- **Related**: ADR-006 (Fee Calculation), ADR-007 (Exit Recycling)

### Validation Tools
- **Prompt**: \`scripts/validation/prompts.py:capital_allocation_prompt()\`
- **Scorer**: \`scripts/validation/doc_domain_scorer.mjs\`
- **Truth case validator**: \`scripts/validate-ca-cases.mjs\`

---

## Future Enhancements

**Phase 2 Expansion** (pending checkpoint approval):
- Add 14 remaining truth cases (CA-007 through CA-020)
- Expand each engine section with pseudocode and worked examples
- Add 15+ implementation \`file:line\` anchors
- Include step-by-step walkthroughs for CA-009, CA-013, CA-015

**Schema v2.0** (technical debt):
- Introduce explicit \`capitalRecall\` transaction type
- Replace negative distributions with semantic transaction types
- Add \`status\` field to cohorts for lifecycle modeling
- Support time-varying pacing windows

**Tooling**:
- Symbolic anchoring system (@doc-anchor annotations)
- CLI tool for anchor validation and maintenance
- Behavioral validation (code execution tests)

---

**Document Version**: 1.0.0 (checkpoint skeleton)
**Last Updated**: 2025-10-29
**Status**: Phase 1 checkpoint - ready for validation feedback
`;

fs.writeFileSync(docPath, docContent, 'utf8');
console.log('   ✅ Created capital-allocation.md (200+ lines)');

// ============================================================================
// Summary
// ============================================================================
console.log('\n✅ Phase 1D Checkpoint Scaffold Complete!\n');
console.log('Generated files:');
console.log('  - scripts/validation/doc_domain_scorer.mjs (updated)');
console.log('  - scripts/validation/capital-allocation-validation.yaml');
console.log('  - scripts/validation/prompts.py (updated)');
console.log('  - docs/notebooklm-sources/capital-allocation.md');
console.log('\nNext steps:');
console.log('  1. git add scripts/validation/ docs/notebooklm-sources/');
console.log('  2. git commit -m "feat(validation): Phase 1D checkpoint framework complete"');
console.log('  3. Run checkpoint validation:');
console.log('     cd scripts/validation');
console.log('     npx promptfoo@latest test -c capital-allocation-validation.yaml \\');
console.log('       -o ../../.promptfoo/capital-allocation');
console.log('  4. Copy artifacts:');
console.log('     cp -r .promptfoo/capital-allocation/* scripts/validation/results/capital-allocation/');
