---
description:
  Validate existing documentation for accuracy (95%+ truthfulness via entity
  verification), completeness (AST-based), and helpfulness (LLM-as-judge)
---

# Documentation Validator

Verify documentation claims against actual code to detect AI hallucination and
ensure 95%+ accuracy using DocAgent's proven validation methods.

## Usage

```bash
/doc-validate "docs/waterfall-guide.md"
/doc-validate "docs/notebooklm-sources/reserve-engine.md"
/doc-validate "docs/api/*.md"  # Pattern-based validation
```

## Validation Workflow

### Phase 1: Entity Extraction & Verification (Truthfulness)

**Purpose**: Detect fabricated or outdated entities (prevents AI hallucination)

1. **Extract Entities from Documentation** Parse documentation and identify all
   code references:
   - Function names: `applyWaterfallChange()`, `calculateReserves()`
   - Type names: `WaterfallType`, `ReserveAllocation`
   - Variable names: `DEFAULT_HURDLE_RATE`, `MAX_CARRY`
   - Class names: `ReserveEngine`, `PacingEngine`

2. **Build Ground Truth from Code** Analyze actual source files using AST:

   ```bash
   # For docs/waterfall-guide.md referencing client/src/lib/waterfall.ts
   Use Grep to find: client/src/lib/waterfall.ts
   Parse with @typescript-eslint/parser (AST analysis)
   Extract: Functions, Types, Variables, Classes
   ```

3. **Calculate Existence Ratio** (DocAgent's Truthfulness Metric)

   ```
   Verified Entities / Total Entities = Existence Ratio

   Example:
   - Total entities in documentation: 52
   - Verified in code: 50
   - Existence Ratio: 50/52 = 96.2% ✅ (exceeds 95% threshold)
   ```

**Success Criteria**:

- [x] Truthfulness ≥ 95% (Existence Ratio)

### Phase 2: Completeness Validation (AST-Based)

**Purpose**: Ensure all required documentation sections present

1. **Identify Required Sections from Code** Based on code structure, determine
   what MUST be documented:

   **For Functions**:
   - [ ] Summary (purpose of function)
   - [ ] Parameters (name, type, description for each)
   - [ ] Returns (type and meaning)
   - [ ] Throws (error conditions)
   - [ ] Examples (usage code)

   **For Classes**:
   - [ ] Summary (class purpose)
   - [ ] Constructor (parameters and usage)
   - [ ] Properties (public fields)
   - [ ] Methods (public methods with signatures)
   - [ ] Examples (instantiation and usage)

   **For Types**:
   - [ ] Summary (type purpose)
   - [ ] Fields (each field with type and meaning)
   - [ ] Usage (how to construct/use)
   - [ ] Examples (actual usage)

2. **Check Present Sections in Documentation** Parse markdown headers and
   content:
   - Extract section headers (## Parameters, ## Returns, etc.)
   - Verify each required section has content
   - Confirm parameter count matches function signature

3. **Calculate Completeness Score**

   ```
   Present Sections / Required Sections = Completeness

   Example:
   - Required sections: 7 (Summary, Parameters (3), Returns, Throws, Examples)
   - Present sections: 7
   - Completeness: 7/7 = 100% ✅
   ```

**Success Criteria**:

- [x] Completeness = 100% (all required sections present)

### Phase 3: Helpfulness Evaluation (LLM-as-Judge)

**Purpose**: Assess documentation usefulness and clarity

1. **Structured Evaluation Criteria** Rate documentation on 5-point Likert scale
   for:
   - **Clarity** (1-5): Is the explanation clear and understandable?
   - **Examples** (1-5): Are code examples provided and helpful?
   - **Parameters** (1-5): Are parameters explained with types and purpose?
   - **Context** (1-5): Is usage context and integration guidance provided?

2. **LLM-as-Judge Prompt**

   ```
   Evaluate this documentation on a 5-point Likert scale:

   [Documentation content]

   For each criterion:
   1 = Poor (missing or confusing)
   2 = Below average (minimal or unclear)
   3 = Average (adequate but could be better)
   4 = Good (clear and helpful)
   5 = Excellent (comprehensive and exemplary)

   Provide:
   - Score for each criterion (Clarity, Examples, Parameters, Context)
   - Brief rationale (chain-of-thought)
   - Overall average score
   ```

3. **Calculate Helpfulness Score**

   ```
   Average(Clarity, Examples, Parameters, Context) = Helpfulness

   Example:
   - Clarity: 4 (clear explanations)
   - Examples: 5 (excellent code samples)
   - Parameters: 4 (well-documented)
   - Context: 3 (could use more integration guidance)
   - Helpfulness: (4+5+4+3)/4 = 4.0/5.0 ✅
   ```

**Success Criteria**:

- [x] Helpfulness ≥ 4.0/5.0 (Good to Excellent)

## Validation Report

```
╔══════════════════════════════════════════════════════════╗
║              DOCUMENTATION VALIDATION REPORT              ║
╠══════════════════════════════════════════════════════════╣
║ File: docs/waterfall-guide.md                            ║
║ Source: client/src/lib/waterfall.ts                      ║
║ Generated: 2025-10-26 14:23:15                           ║
╠══════════════════════════════════════════════════════════╣
║                                                           ║
║ 📊 TRUTHFULNESS (Entity Verification)                    ║
║    ✅ 96.2% (50/52 entities verified)                    ║
║                                                           ║
║    Verified Entities (50):                               ║
║    ✓ applyWaterfallChange (function)                     ║
║    ✓ changeWaterfallType (function)                      ║
║    ✓ WaterfallType (type)                                ║
║    ✓ DEFAULT_HURDLE_RATE (constant)                      ║
║    [... 46 more verified entities]                       ║
║                                                           ║
║    ⚠️  Unverified Entities (2):                          ║
║    ✗ applyWaterfallDefaults (line 42) - Not found       ║
║    ✗ WaterfallValidator (line 89) - Not found           ║
║                                                           ║
╠══════════════════════════════════════════════════════════╣
║                                                           ║
║ 📋 COMPLETENESS (Required Sections)                      ║
║    ✅ 100% (7/7 required sections present)               ║
║                                                           ║
║    ✓ Summary                                             ║
║    ✓ API Reference (applyWaterfallChange)                ║
║    ✓ Parameters (waterfall, field, value)                ║
║    ✓ Returns (WaterfallType)                             ║
║    ✓ Type Definitions (WaterfallType, WaterfallField)    ║
║    ✓ Usage Examples (3 code samples)                     ║
║    ✓ Edge Cases (hurdle clamping, type switching)        ║
║                                                           ║
╠══════════════════════════════════════════════════════════╣
║                                                           ║
║ 💡 HELPFULNESS (LLM-as-Judge)                            ║
║    ✅ 4.2/5.0 (Good to Excellent)                        ║
║                                                           ║
║    Clarity:     4/5 (Clear explanations)                 ║
║    Examples:    5/5 (Excellent code samples)             ║
║    Parameters:  4/5 (Well-documented with types)         ║
║    Context:     4/5 (Good integration guidance)          ║
║                                                           ║
╠══════════════════════════════════════════════════════════╣
║ ✅ VALIDATION PASSED                                     ║
║                                                           ║
║ Overall Quality: EXCELLENT                               ║
║ - Truthfulness exceeds 95% threshold                     ║
║ - All required sections present                          ║
║ - Helpful and clear documentation                        ║
║                                                           ║
║ ⚠️  Minor Issues (2 unverified entities):                ║
║ 1. Remove "applyWaterfallDefaults" (fabricated)          ║
║ 2. Remove "WaterfallValidator" (fabricated)              ║
║                                                           ║
║ Recommended Action:                                      ║
║ - Update documentation to remove fabricated entities     ║
║ - Re-validate to achieve 100% accuracy                   ║
╚══════════════════════════════════════════════════════════╝
```

## Examples

### Example 1: Perfect Documentation (100% Pass)

```bash
/doc-validate "docs/waterfall-guide.md"

# Validation Results:
✅ Truthfulness: 100% (52/52 entities verified)
   All functions, types, and constants exist in code

✅ Completeness: 100% (7/7 sections present)
   Summary, API Reference, Parameters, Returns, Examples, Edge Cases, Integration

✅ Helpfulness: 4.5/5.0 (Excellent)
   Clear explanations, comprehensive examples, well-documented parameters

✅ VALIDATION PASSED - Documentation is production-ready
```

### Example 2: Fabricated Entities Detected (Fail)

```bash
/doc-validate "docs/reserve-allocation.md"

# Validation Results:
❌ Truthfulness: 87.5% (42/48 entities verified)
   BELOW 95% THRESHOLD

Unverified Entities (6):
- "calculateDefaults()" (line 23) - Function not found in ReserveEngine.ts
- "ReserveValidator" (line 45) - Type not found in codebase
- "MINIMUM_RESERVE_THRESHOLD" (line 67) - Constant not found
- "PriorityAllocation" (line 89) - Type not found
- "allocateByPriority()" (line 102) - Method not found
- "validateReserveConfig()" (line 134) - Function not found

✅ Completeness: 100% (9/9 sections present)

✅ Helpfulness: 4.0/5.0 (Good)

❌ VALIDATION FAILED
Reason: Truthfulness 87.5% < 95% threshold

Recommendation:
- Review unverified entities (likely AI hallucination)
- Verify against actual code: client/src/core/reserve/ReserveEngine.ts
- Remove fabricated entities or add to code if intentional
- Re-run /doc-validate after corrections
```

### Example 3: Missing Required Sections (Partial Fail)

```bash
/doc-validate "docs/pacing-analysis.md"

# Validation Results:
✅ Truthfulness: 98.0% (49/50 entities verified)

❌ Completeness: 57% (4/7 sections present)
   Missing:
   - Parameters documentation (function takes 3 params, 0 documented)
   - Returns documentation (return type not explained)
   - Examples (no code samples provided)

⚠️  Helpfulness: 2.8/5.0 (Below Average)
   Clarity: 3/5 (adequate but terse)
   Examples: 1/5 (no examples provided)
   Parameters: 2/5 (missing parameter docs)
   Context: 4/5 (good integration guidance)

❌ VALIDATION FAILED
Reasons:
- Completeness 57% < 100% required
- Helpfulness 2.8 < 4.0 threshold

Recommendation:
- Add parameter documentation for analyzePacing(portfolio, config, options)
- Document return type: PacingAnalysisResult
- Include at least 2 code examples showing usage
- Re-run /doc-validate after additions
```

### Example 4: Pattern-Based Validation (Multiple Files)

```bash
/doc-validate "docs/notebooklm-sources/*.md"

# Validates all markdown files in directory:
1. reserve-engine.md      ✅ PASS (97.2% truthfulness, 100% complete, 4.3/5.0 helpful)
2. pacing-engine.md       ✅ PASS (96.5% truthfulness, 100% complete, 4.1/5.0 helpful)
3. cohort-engine.md       ❌ FAIL (89.3% truthfulness - 6 fabricated entities)
4. waterfall-config.md    ✅ PASS (98.7% truthfulness, 100% complete, 4.4/5.0 helpful)

Summary:
- 3/4 files passed validation
- 1 file requires correction (cohort-engine.md)
- Average truthfulness: 95.4%
- Average helpfulness: 4.3/5.0

Action Required:
Fix cohort-engine.md (remove fabricated entities)
```

## Integration

This command works with:

### Existing Commands

- **/notebooklm-generate**: Automatically invokes /doc-validate in Phase 5
- **/fix-auto**: Can fix formatting issues identified during validation
- **/test-smart**: Validates test assertions match documented behavior

### Agents

- **doc-validator** (if available): Performs AST-based validation
- **code-explorer**: Locates source files referenced in documentation
- **waterfall-specialist**: Domain-specific validation for waterfall docs

### Memory System

- **/log-change**: Log validation results in CHANGELOG.md
- Track accuracy trends over time (weekly drift detection)

## Validation Modes

### Strict Mode (Default)

```bash
/doc-validate "docs/file.md"  # Uses strict thresholds

Thresholds:
- Truthfulness: ≥ 95%
- Completeness: = 100%
- Helpfulness: ≥ 4.0/5.0
```

### Permissive Mode

```bash
/doc-validate "docs/file.md" --permissive

Thresholds:
- Truthfulness: ≥ 90%
- Completeness: ≥ 90%
- Helpfulness: ≥ 3.5/5.0

Use for: Legacy documentation, draft documentation
```

### Fast Mode (Truthfulness Only)

```bash
/doc-validate "docs/file.md" --fast

Checks:
- Truthfulness only (entity verification)
- Skips completeness and helpfulness
- Completes in <5 seconds

Use for: Quick hallucination detection
```

## Performance Targets

- **Entity Extraction**: <1 second per document
- **AST Parsing**: <2 seconds per source file
- **Truthfulness Validation**: <5 seconds
- **Completeness Check**: <2 seconds
- **Helpfulness Evaluation**: <5 seconds

**Total Target**: <15 seconds per document

## Special Cases

### Waterfall Documentation

```bash
/doc-validate "docs/waterfall-guide.md"

# Special checks:
- Verifies AMERICAN vs EUROPEAN types correctly distinguished
- Validates clamping behavior (hurdle, catchUp to [0,1])
- Checks schema validation patterns documented
- Ensures applyWaterfallChange vs changeWaterfallType distinction clear
```

### API Route Documentation

```bash
/doc-validate "docs/api/funds-routes.md"

# Special checks:
- Zod validation schemas documented
- Request/response types match actual API
- Error codes match server implementation
- Authentication requirements documented
```

### Database Schema Documentation

```bash
/doc-validate "docs/schema/reserves.md"

# Special checks:
- Table names match Drizzle schema definitions
- Column types match schema types
- Foreign keys documented correctly
- Indexes mentioned in performance notes
```

## Troubleshooting

### Issue: "High false positive rate (valid entities marked as unverified)"

**Cause**: Source file path incorrect or not detected **Solution**:

```bash
# Manually specify source file:
/doc-validate "docs/file.md" --source="client/src/lib/waterfall.ts"
```

### Issue: "Completeness always shows 0%"

**Cause**: Required section detection failing (AST parser issue) **Solution**:
Check that source file is valid TypeScript and parseable

### Issue: "Helpfulness scores very low (1-2/5.0) for good documentation"

**Cause**: LLM-as-judge prompt needs tuning **Solution**: Re-run with --verbose
to see judge reasoning, adjust criteria

### Issue: "Validation takes >30 seconds"

**Cause**: Large documentation file or many source files **Solution**: Use
--fast mode for quick truthfulness check only

## Accuracy Benchmarks

Based on DocAgent ACL 2025 Research:

| Metric           | Target  | Source                                     |
| ---------------- | ------- | ------------------------------------------ |
| **Truthfulness** | 95%+    | DocAgent Existence Ratio (94.64% achieved) |
| **Completeness** | 100%    | AST-based required sections                |
| **Helpfulness**  | 4.0/5.0 | LLM-as-judge with rubrics                  |

**Our Target**: Exceed DocAgent research benchmarks through iterative refinement

## Output Formats

### Console Report (Default)

```
📊 Validation Report: docs/waterfall-guide.md

✅ Truthfulness: 96.2% (50/52 entities verified)
✅ Completeness: 100% (7/7 sections present)
✅ Helpfulness: 4.2/5.0

✅ VALIDATION PASSED
```

### JSON Format (For CI/CD)

```bash
/doc-validate "docs/file.md" --json

{
  "file": "docs/waterfall-guide.md",
  "source": "client/src/lib/waterfall.ts",
  "timestamp": "2025-10-26T14:23:15Z",
  "truthfulness": 0.962,
  "completeness": 1.0,
  "helpfulness": 4.2,
  "passed": true,
  "unverifiedEntities": [
    {"entity": "applyWaterfallDefaults", "line": 42, "type": "function"},
    {"entity": "WaterfallValidator", "line": 89, "type": "type"}
  ]
}
```

### Detailed Report (For Human Review)

```bash
/doc-validate "docs/file.md" --detailed

# Outputs full ASCII-art report (shown above) with:
- Complete entity list (verified + unverified)
- Section-by-section completeness breakdown
- Helpfulness scoring rationale
- Specific recommendations for improvement
```

## Notes

- Run **weekly** to detect documentation drift (code changes invalidate docs)
- Integrate with **CI/CD** to validate docs on PR
- Use `/doc-validate --json` for automation
- Human review **recommended** even for passing documentation
- Complements `/notebooklm-generate` (validates its output)

## Related Documentation

- DocAgent ACL 2025: Verifier module (Entity Verification)
- /notebooklm-generate: Uses /doc-validate in Phase 5
- /behavioral-spec: Validates test assertions match documented behavior
- CLAUDE.md: Documentation accuracy standards (95%+ target)
