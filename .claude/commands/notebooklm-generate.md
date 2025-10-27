---
description:
  Generate comprehensive, validated documentation for NotebookLM with 95%+
  accuracy through multi-agent orchestration and topological processing
---

# NotebookLM Documentation Generator

Orchestrate multi-agent workflow to generate accurate, complete documentation
grounded in actual code structure and test assertions (prevents AI
hallucination).

## Usage

```bash
/notebooklm-generate "client/src/lib/waterfall.ts"
/notebooklm-generate "ReserveEngine"  # Auto-finds client/src/core/reserve/ReserveEngine.ts
/notebooklm-generate "waterfall"      # Pattern-based (finds all waterfall-related files)
```

## Workflow Phases

### Phase 1: Dependency Analysis (Topological Processing)

**Purpose**: Build dependency graph to ensure dependencies documented before
dependents (prevents hallucination through proper ordering)

1. **Discover Files**

   ```bash
   # For pattern: "ReserveEngine"
   Find: client/src/core/reserve/ReserveEngine.ts
   Find tests: client/src/core/reserve/__tests__/ReserveEngine.test.ts
   ```

2. **Build Dependency Graph**
   - Use dependency-navigator agent (if available) OR
   - Use Grep to extract imports: `grep -r "import.*ReserveEngine" client/`
   - Identify dependencies (files imported by ReserveEngine)
   - Identify dependents (files that import ReserveEngine)

3. **Topological Sort**
   ```
   Order (dependencies first):
   1. shared/db/schema/reserves.ts (ReserveSchema)
   2. client/src/core/reserve/types.ts (ReserveAllocation type)
   3. client/src/core/reserve/ReserveEngine.ts (base implementation)
   4. client/src/core/reserve/PacingEngine.ts (extends ReserveEngine)
   ```

**Success Criteria**:

- [x] Valid dependency order (no undefined references)
- [x] Completes in <10 seconds

**Research Evidence**: DocAgent ACL 2025 - Topological processing improves
accuracy by 8% (86.75% → 94.64%)

### Phase 2: Code Structure Extraction

**Purpose**: Extract actual code structure via AST analysis (ground truth)

1. **Invoke code-explorer Agent**

   ```
   "Use code-explorer agent to analyze ReserveEngine.ts structure"
   ```

2. **Extract Components**
   - Public functions and signatures
   - Class definitions and methods
   - Type definitions and exports
   - Import dependencies

3. **Build Ground Truth**
   - Function names: `calculateReserves()`, `allocateByStrategy()`
   - Types: `ReserveAllocation`, `ReserveStrategy`
   - Constants: `DEFAULT_RESERVE_CAP`, `MIN_ALLOCATION_PERCENT`

**Success Criteria**:

- [x] All public APIs extracted
- [x] Function signatures captured with types
- [x] Completes in <15 seconds

### Phase 3: Behavioral Specification Extraction

**Purpose**: Extract test assertions as behavioral ground truth

1. **Parse Test Files**

   ```bash
   # Find tests for ReserveEngine
   client/src/core/reserve/__tests__/ReserveEngine.test.ts
   ```

2. **Extract Test Cases** (use behavioral-spec-extractor if available)
   - Test names: `"should allocate reserves based on strategy"`
   - Assertions: `expect(result.total).toBe(expected)`
   - Edge cases: Empty arrays, null values, boundary conditions

3. **Generate Behavioral Specs**

   ```
   From test: "should cap allocation at configured maximum"
   Spec: "calculateReserves() enforces maximum allocation cap defined in configuration"

   From test: "should handle empty portfolio gracefully"
   Spec: "calculateReserves([]) returns { total: 0, allocated: 0, remaining: 0 }"
   ```

**Success Criteria**:

- [x] All test cases extracted
- [x] Edge cases identified
- [x] Assertions mapped to behaviors

### Phase 4: Documentation Generation

**Purpose**: Generate comprehensive documentation using extracted context

1. **Invoke docs-architect Agent**

   ```
   "Use docs-architect agent to generate documentation for ReserveEngine based on:"
   - Code structure from Phase 2
   - Behavioral specs from Phase 3
   - Dependency context from Phase 1
   ```

2. **Required Sections** (AST-based):
   - **Executive Summary**: Purpose and high-level overview
   - **API Reference**: All public functions with signatures
   - **Type Definitions**: ReserveAllocation, ReserveStrategy types
   - **Usage Examples**: Code snippets from tests
   - **Edge Cases**: Boundary conditions from test assertions
   - **Integration Points**: Dependencies and dependents
   - **Performance Characteristics**: From test benchmarks

3. **Documentation Standards**:
   - Markdown format with syntax highlighting
   - Progressive complexity (overview → details → examples)
   - Cross-references to related components
   - Actual code examples (not fabricated)

**Success Criteria**:

- [x] All required sections present (Completeness: 100%)
- [x] Clear explanations (Helpfulness: 4.0/5.0)
- [x] Generates in <30 seconds

### Phase 5: Validation (95%+ Accuracy Gate)

**Purpose**: Verify documentation claims against actual code (prevent
hallucination)

1. **Entity Verification** (use doc-validator agent if available)
   - Extract entities from documentation:
     - Function names: `calculateReserves`, `allocateByStrategy`
     - Type names: `ReserveAllocation`, `ReserveStrategy`
     - Constants: `DEFAULT_RESERVE_CAP`

   - Verify against AST ground truth (Phase 2)
   - Calculate Existence Ratio: verified / total entities

   **Target: 95%+ Truthfulness**

2. **Completeness Validation**
   - Check all public APIs documented
   - Verify parameter documentation matches signatures
   - Ensure return types documented
   - Confirm edge cases from tests included

   **Target: 100% Completeness**

3. **Helpfulness Evaluation**
   - Clear explanations?
   - Examples provided?
   - Parameters explained with types?
   - Usage context given?

   **Target: 4.0/5.0 Helpfulness**

**Validation Results**:

```
✅ Truthfulness: 96.3% (52/54 entities verified)
⚠️  Unverified entities:
   - "allocateByPriority()" (line 42) - Function not found in code
   - "ReserveValidator" (line 89) - Type not found in code

✅ Completeness: 100% (7/7 required sections present)
✅ Helpfulness: 4.2/5.0 (clear examples, good parameter docs)

❌ VALIDATION FAILED: Truthfulness < 95% threshold
Action: Trigger Phase 6 (Iterative Refinement)
```

**Success Criteria**:

- [x] Truthfulness ≥ 95%
- [x] Completeness = 100%
- [x] Helpfulness ≥ 4.0/5.0
- [x] Validation completes in <10 seconds

### Phase 6: Iterative Refinement (If <95% Accuracy)

**Purpose**: Fix validation failures through additional context gathering

1. **Identify Missing Context**
   - Unverified entities: `allocateByPriority`, `ReserveValidator`
   - Possible causes: Fabricated by LLM, or actual code not captured in Phase 2

2. **Re-Extract Context**

   ```
   "Use code-explorer to search for 'allocateByPriority' in ReserveEngine.ts"
   "Search for 'ReserveValidator' type definition"
   ```

3. **Regenerate Documentation**
   - If entities don't exist: Remove from documentation
   - If entities exist but were missed: Add to documentation with correct
     signatures

4. **Re-Validate**
   - Run Phase 5 validation again
   - Confirm 95%+ accuracy

**Loop Limit**: Max 3 iterations to prevent runaway

**Success Criteria**:

- [x] Achieves 95%+ accuracy within 3 iterations
- [x] Iteration completes in <2 minutes

### Phase 7: Final Assembly

**Purpose**: Assemble validated documentation for NotebookLM ingestion

1. **Format for NotebookLM**

   ```markdown
   # ReserveEngine Documentation

   **File**: client/src/core/reserve/ReserveEngine.ts **Generated**: 2025-10-26
   **Accuracy**: 96.3% (52/54 entities verified) **Test Coverage**: 18 test
   cases documented

   ## Executive Summary

   [Generated content from Phase 4]

   ## API Reference

   [Verified functions with signatures]

   ## Type Definitions

   [Verified types from AST]

   ## Usage Examples

   [From actual test files]

   ## Edge Cases

   [From test assertions]

   ## Integration Points

   Dependencies: [From Phase 1 topological analysis] Dependents: [Components
   that import this]
   ```

2. **Save Output**

   ```bash
   docs/notebooklm-sources/reserve-engine.md
   ```

3. **Generate Summary**

   ```
   📄 Documentation Generated: ReserveEngine

   ✅ Truthfulness: 96.3% (52/54 entities verified)
   ✅ Completeness: 100% (7/7 sections present)
   ✅ Helpfulness: 4.2/5.0
   ✅ Test Coverage: 18 test cases documented
   ✅ Total Time: 2m 14s

   Output: docs/notebooklm-sources/reserve-engine.md

   ⏸️ HUMAN REVIEW CHECKPOINT
   Please review documentation before ingesting into NotebookLM.
   ```

**Success Criteria**:

- [x] Markdown formatted correctly
- [x] Metadata included (accuracy, test coverage)
- [x] Saved to docs/notebooklm-sources/

### Phase 8: Human Review Checkpoint

**Purpose**: Expert validation before NotebookLM ingestion

**Review Checklist**:

- [x] Technical accuracy (domain expert review)
- [x] Completeness (all APIs documented)
- [x] Clarity (understandable by target audience)
- [x] Examples (correct and runnable)
- [x] Edge cases (match actual test coverage)

**Actions**:

- **APPROVE**: Ready for NotebookLM ingestion
- **REVISE**: Use /doc-validate to identify specific issues
- **REJECT**: Re-run /notebooklm-generate with different approach

## Examples

### Example 1: Single File Documentation

```bash
/notebooklm-generate "client/src/lib/waterfall.ts"

# Executes:
Phase 1: Dependency Analysis
  - Found: waterfall.ts imports from shared/db/schema/waterfalls.ts
  - Order: 1) WaterfallSchema, 2) waterfall.ts

Phase 2: Code Structure Extraction
  - Functions: applyWaterfallChange, changeWaterfallType
  - Types: WaterfallType, WaterfallField
  - 19 test cases in waterfall.test.ts

Phase 3: Behavioral Spec Extraction
  - "should clamp hurdle rate to [0,1]"
  - "should return same reference for no-op"
  - "should validate AMERICAN waterfall schema"

Phase 4: Documentation Generation
  - Generated 487 lines of documentation
  - Includes: Summary, API Reference, Types, Examples, Edge Cases

Phase 5: Validation
  ✅ Truthfulness: 98.1% (51/52 entities verified)
  ✅ Completeness: 100%
  ✅ Helpfulness: 4.5/5.0
  ✅ PASSED

Phase 7: Final Assembly
  Output: docs/notebooklm-sources/waterfall.md

Total Time: 1m 47s
```

### Example 2: Engine Family (Multiple Files)

```bash
/notebooklm-generate "ReserveEngine"

# Discovers:
- client/src/core/reserve/ReserveEngine.ts
- client/src/core/reserve/PacingEngine.ts (extends ReserveEngine)
- client/src/core/reserve/CohortEngine.ts (uses ReserveEngine)

# Topological Order:
1. ReserveEngine.ts (base class)
2. PacingEngine.ts (derived class)
3. CohortEngine.ts (consumer)

# Generates 3 separate documents:
- docs/notebooklm-sources/reserve-engine.md
- docs/notebooklm-sources/pacing-engine.md
- docs/notebooklm-sources/cohort-engine.md

Total Time: 4m 32s (3 components in sequence)
```

### Example 3: Pattern-Based Discovery

```bash
/notebooklm-generate "waterfall"

# Discovers:
- shared/db/schema/waterfalls.ts (WaterfallSchema)
- client/src/lib/waterfall.ts (helpers)
- client/src/components/carry/WaterfallConfig.tsx (UI)
- tests/unit/waterfall.test.ts (behavioral specs)

# Topological Order (dependencies first):
1. WaterfallSchema
2. waterfall.ts helpers
3. WaterfallConfig.tsx UI
4. Test specifications (cross-reference all above)

Total Time: 3m 18s (4 files)
```

## Performance Targets

- **Phase 1 (Dependencies)**: <10 seconds
- **Phase 2 (Code Extraction)**: <15 seconds
- **Phase 3 (Test Specs)**: <10 seconds
- **Phase 4 (Generation)**: <30 seconds
- **Phase 5 (Validation)**: <10 seconds
- **Phase 6 (Refinement)**: <2 minutes (if needed)
- **Phase 7 (Assembly)**: <5 seconds

**Total Target**: <5 minutes per component (single file)

## Integration

This command works with:

### Existing Agents (Orchestrates)

- **code-explorer**: Code structure extraction (Phase 2)
- **docs-architect**: Documentation generation (Phase 4)
- **waterfall-specialist**: Domain-specific validation for waterfall docs
- **test-automator**: Test coverage analysis
- **architect-review**: Architectural context

### New Agents (If Available)

- **dependency-navigator**: Topological sorting (Phase 1)
- **behavioral-spec-extractor**: Test spec extraction (Phase 3)
- **doc-validator**: Accuracy validation (Phase 5)
- **doc-assembly-orchestrator**: Workflow coordination

### Existing Commands

- **/test-smart**: Identifies test files for Phase 3
- **/fix-auto**: Fixes documentation formatting issues
- **/deploy-check**: Can include doc validation as Phase

### Memory System

- **/log-change**: Document when docs generated
- Update CHANGELOG.md with accuracy metrics

## Special Cases

### Waterfall Documentation

```bash
/notebooklm-generate "waterfall"

# Special handling:
- Document AMERICAN vs EUROPEAN types separately
- Include schema validation patterns
- Cross-reference WaterfallConfig UI component
- Document clamping behavior (hurdle, catchUp to [0,1])
```

### Database Schema Changes

```bash
/notebooklm-generate "shared/db/schema/funds.ts"

# Triggers:
- db-migration agent for schema validation
- Full test suite (schema affects everything)
- Cross-reference all components using FundSchema
```

### API Routes

```bash
/notebooklm-generate "server/routes/funds.ts"

# Includes:
- Zod validation schemas
- Request/response types
- Error handling patterns
- API endpoint documentation
```

## Accuracy Benchmarks

Based on DocAgent ACL 2025 Research:

| Processing Method | Truthfulness | Source                    |
| ----------------- | ------------ | ------------------------- |
| Random Order      | 86.75%       | DocAgent baseline         |
| Topological Order | 94.64%       | DocAgent (8% improvement) |
| **Our Target**    | **95%+**     | With validation loops     |

**Key Success Factor**: Topological processing + AST validation + iterative
refinement

## Failure Handling

### Validation Fails (<95% Accuracy)

```
❌ Validation Failed: 87.2% accuracy (45/52 entities)

Unverified Entities (7):
- "calculateDefaults()" - Function not found
- "ReserveValidator" - Type not found
[...]

Action: Entering Phase 6 (Iterative Refinement)
- Searching for unverified entities in codebase
- Will re-generate documentation if entities found
- Will remove fabricated entities if not found

Loop 1 of 3...
```

### No Tests Found

```
⚠️ Warning: No tests found for ReserveEngine.ts

Proceeding without behavioral specs from tests.
Accuracy may be lower (code-only documentation).

Recommendation: Create tests first, then re-run /notebooklm-generate
```

### Circular Dependencies Detected

```
⚠️ Circular dependency detected:
- utils.ts → validators.ts
- validators.ts → utils.ts

Resolution: Documenting as single combined unit
Output: docs/notebooklm-sources/utils-validators-combined.md
```

## Troubleshooting

### Issue: "Validation always fails at 60-70% accuracy"

**Cause**: Not using topological processing (random order) **Solution**: Ensure
Phase 1 completes successfully before Phase 4

### Issue: "Documentation missing edge cases"

**Cause**: Test files not found or not parsed **Solution**: Verify test file
location matches pattern `**/__tests__/*.test.ts`

### Issue: "Execution time exceeds 5 minutes"

**Cause**: Large component with many dependencies **Solution**: Break into
smaller units, document dependencies separately

### Issue: "Fabricated function names in output"

**Cause**: Phase 5 validation skipped or failed **Solution**: Check validation
output, use /doc-validate to identify issues

## Notes

- Run **after code is stable** (not during active development)
- Best for **quarterly documentation updates** (not every commit)
- Complements code comments (not a replacement)
- Output designed for **NotebookLM ingestion** (structured markdown)
- Human review **required** before production use

## Related Documentation

- DocAgent ACL 2025: Topological processing (8% accuracy improvement)
- /doc-validate: Validate existing documentation
- /behavioral-spec: Extract test specifications
- CLAUDE.md: NotebookLM documentation guidelines
