---
description:
  Extract behavioral specifications from Vitest test files (tests are ground
  truth - convert assertions to documentation)
---

# Behavioral Specification Extractor

Parse Vitest test files to extract behavioral specifications, edge cases, and
test assertions that serve as ground truth for documentation validation.

## Usage

```bash
/behavioral-spec "client/src/lib/__tests__/waterfall.test.ts"
/behavioral-spec "tests/unit/reserve-engine.test.ts"
/behavioral-spec "waterfall"  # Pattern-based (finds all waterfall test files)
```

## Extraction Workflow

### Phase 1: Test File Discovery

**Purpose**: Locate test files matching the pattern or file path

1. **Direct File Path**

   ```bash
   /behavioral-spec "client/src/lib/__tests__/waterfall.test.ts"
   # Uses exact path
   ```

2. **Pattern-Based Discovery**

   ```bash
   /behavioral-spec "waterfall"

   # Searches for test files:
   - client/src/lib/__tests__/waterfall.test.ts
   - client/src/components/carry/__tests__/WaterfallConfig.test.tsx
   - tests/integration/waterfall-api.test.ts
   ```

3. **Auto-Detection from Source File**

   ```bash
   /behavioral-spec "client/src/lib/waterfall.ts"

   # Automatically finds corresponding test:
   - client/src/lib/__tests__/waterfall.test.ts
   ```

**Success Criteria**:

- [x] Finds all matching test files
- [x] Completes in <2 seconds

### Phase 2: Test Structure Parsing

**Purpose**: Extract test suites, test cases, and test metadata

1. **Identify Test Suites** (`describe` blocks)

   ```typescript
   describe('applyWaterfallChange', () => {
     // Test suite for applyWaterfallChange function
   });

   describe('changeWaterfallType', () => {
     // Test suite for changeWaterfallType function
   });
   ```

2. **Extract Test Cases** (`it` / `test` blocks)

   ```typescript
   it('should clamp hurdle rate to [0,1]', () => {
     const result = applyWaterfallChange(waterfall, 'hurdle', 1.5);
     expect(result.hurdle).toBe(1.0);
   });
   ```

   **Extracted**:
   - Test name: "should clamp hurdle rate to [0,1]"
   - Function tested: `applyWaterfallChange`
   - Input: `waterfall, 'hurdle', 1.5`
   - Expected: `result.hurdle === 1.0`

3. **Categorize Tests**
   - **Unit Tests**: Single function behavior
   - **Integration Tests**: Multiple functions working together
   - **Edge Cases**: Boundary conditions, empty inputs, null handling
   - **Error Cases**: Expected exceptions, validation failures

**Success Criteria**:

- [x] All `describe` blocks identified
- [x] All `it`/`test` blocks extracted
- [x] Test names captured verbatim

### Phase 3: Assertion Analysis

**Purpose**: Extract expected behaviors from `expect()` statements

1. **Parse Expect Statements**

   ```typescript
   // Test code:
   expect(result.hurdle).toBe(1.0);
   expect(result.catchUp).toBeGreaterThanOrEqual(0);
   expect(() => changeWaterfallType(waterfall, 'INVALID')).toThrow();
   expect(result).toEqual({ total: 0, allocated: 0, remaining: 0 });
   ```

   **Assertion Types**:
   - `.toBe(value)` → Strict equality
   - `.toEqual(value)` → Deep equality
   - `.toThrow()` → Exception expected
   - `.toBeTruthy()` / `.toBeFalsy()` → Boolean checks
   - `.toBeGreaterThan()` / `.toBeLessThan()` → Comparisons

2. **Extract Expected Values**

   ```typescript
   from: expect(result.hurdle).toBe(1.0)
   →
   {
     subject: 'result.hurdle',
     assertion: 'toBe',
     expected: 1.0,
     type: 'equality'
   }
   ```

3. **Identify Edge Cases**

   ```typescript
   // Input value exceeds maximum:
   it('should clamp hurdle rate to [0,1]', () => {
     const result = applyWaterfallChange(waterfall, 'hurdle', 1.5);
     expect(result.hurdle).toBe(1.0);
   });

   // Edge case detected:
   {
     input: 1.5,        // Exceeds maximum
     expected: 1.0,      // Clamped to max
     edgeCase: true,
     category: 'Boundary Condition'
   }
   ```

**Success Criteria**:

- [x] All `expect()` statements extracted
- [x] Expected values captured correctly
- [x] Edge cases identified from test setups

### Phase 4: Behavioral Specification Generation

**Purpose**: Convert test names and assertions into structured specifications

1. **Test Name → Behavioral Spec**

   ```
   Test: "should clamp hurdle rate to [0,1]"
   →
   Spec: "applyWaterfallChange() clamps hurdle rate to [0,1] range"

   Test: "should return same reference for no-op changes"
   →
   Spec: "applyWaterfallChange() returns same object reference when value unchanged (performance optimization)"

   Test: "should validate AMERICAN waterfall schema"
   →
   Spec: "changeWaterfallType('AMERICAN') validates result using WaterfallSchema.parse()"
   ```

2. **Assertion → Expected Behavior**

   ```
   from: expect(result.hurdle).toBe(1.0)
   when: input = 1.5
   →
   Behavior: "Clamps hurdle rate to maximum value of 1.0 when input exceeds range"

   from: expect(() => changeWaterfallType(waterfall, 'INVALID')).toThrow()
   →
   Behavior: "Throws error for invalid waterfall type"
   ```

3. **Generate Structured Output**
   ```typescript
   {
     function: 'applyWaterfallChange',
     specs: [
       {
         name: 'Hurdle rate clamping',
         behavior: 'Clamps hurdle rate to [0,1] range',
         input: { field: 'hurdle', value: 1.5 },
         expected: { hurdle: 1.0 },
         edgeCase: true,
         category: 'Validation',
         testFile: 'client/src/lib/__tests__/waterfall.test.ts',
         testLine: 23
       },
       {
         name: 'No-op reference preservation',
         behavior: 'Returns same object reference for unchanged values',
         input: { field: 'hurdle', value: 0.08 },
         expected: 'Same reference',
         edgeCase: false,
         category: 'Performance',
         testFile: 'client/src/lib/__tests__/waterfall.test.ts',
         testLine: 45
       }
     ]
   }
   ```

**Success Criteria**:

- [x] All test cases converted to behavioral specs
- [x] Edge cases categorized correctly
- [x] Assertions mapped to expected behaviors

### Phase 5: Dependency Mapping

**Purpose**: Map test files to implementation files

1. **Extract Imports from Test File**

   ```typescript
   import { applyWaterfallChange, changeWaterfallType } from '../waterfall';
   import type { WaterfallType } from '../waterfall';

   // Resolves to: client/src/lib/waterfall.ts
   ```

2. **Build Test → Code Mapping**

   ```typescript
   {
     testFile: 'client/src/lib/__tests__/waterfall.test.ts',
     implementationFile: 'client/src/lib/waterfall.ts',
     testedFunctions: [
       'applyWaterfallChange',
       'changeWaterfallType'
     ],
     testCount: 19,
     edgeCaseCount: 7
   }
   ```

3. **Identify Coverage Gaps**

   ```
   Tested Functions (from tests):
   - applyWaterfallChange ✓ (19 test cases)
   - changeWaterfallType ✓ (8 test cases)

   Exported Functions (from code):
   - applyWaterfallChange ✓
   - changeWaterfallType ✓
   - validateWaterfallField ✗ (NOT TESTED - coverage gap)

   Coverage: 67% (2/3 functions tested)
   ```

**Success Criteria**:

- [x] All imports mapped to source files
- [x] Coverage gaps identified
- [x] Function → test count calculated

## Specification Report

```
╔══════════════════════════════════════════════════════════╗
║         BEHAVIORAL SPECIFICATIONS EXTRACTED              ║
╠══════════════════════════════════════════════════════════╣
║ Test File: client/src/lib/__tests__/waterfall.test.ts   ║
║ Source: client/src/lib/waterfall.ts                     ║
║ Extracted: 2025-10-26 14:45:32                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║ 📊 SUMMARY                                               ║
║    Total Test Cases: 19                                 ║
║    Behavioral Specs: 19                                 ║
║    Edge Cases: 7                                        ║
║    Functions Tested: 2                                  ║
║    Test Coverage: 67% (2/3 exported functions)          ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║ 🧪 BEHAVIORAL SPECIFICATIONS                             ║
║                                                          ║
║ applyWaterfallChange() [19 test cases]                  ║
║ ────────────────────────────────────────────────────     ║
║                                                          ║
║ 1. Hurdle Rate Clamping                                 ║
║    Behavior: Clamps hurdle rate to [0,1] range          ║
║    Input: { field: 'hurdle', value: 1.5 }               ║
║    Expected: { hurdle: 1.0 }                            ║
║    Category: Validation (Edge Case)                     ║
║    Test: Line 23                                        ║
║                                                          ║
║ 2. Hurdle Rate Minimum Clamping                         ║
║    Behavior: Clamps hurdle rate to minimum 0.0          ║
║    Input: { field: 'hurdle', value: -0.5 }              ║
║    Expected: { hurdle: 0.0 }                            ║
║    Category: Validation (Edge Case)                     ║
║    Test: Line 34                                        ║
║                                                          ║
║ 3. No-Op Reference Preservation                         ║
║    Behavior: Returns same reference when value unchanged║
║    Input: { field: 'hurdle', value: 0.08 }              ║
║    Expected: Same object reference                      ║
║    Category: Performance                                ║
║    Test: Line 45                                        ║
║                                                          ║
║ 4. Catch-Up Rate Clamping                               ║
║    Behavior: Clamps catchUp rate to [0,1] range         ║
║    Input: { field: 'catchUp', value: 1.2 }              ║
║    Expected: { catchUp: 1.0 }                           ║
║    Category: Validation (Edge Case)                     ║
║    Test: Line 56                                        ║
║                                                          ║
║ [... 15 more specifications]                            ║
║                                                          ║
║ changeWaterfallType() [8 test cases]                    ║
║ ────────────────────────────────────────────────────     ║
║                                                          ║
║ 1. AMERICAN Type Switching                              ║
║    Behavior: Switches to AMERICAN type with schema      ║
║    Input: { type: 'AMERICAN' }                          ║
║    Expected: WaterfallSchema validation passes          ║
║    Category: Type System                                ║
║    Test: Line 123                                       ║
║                                                          ║
║ 2. EUROPEAN Type Switching                              ║
║    Behavior: Switches to EUROPEAN type with schema      ║
║    Input: { type: 'EUROPEAN' }                          ║
║    Expected: WaterfallSchema validation passes          ║
║    Category: Type System                                ║
║    Test: Line 134                                       ║
║                                                          ║
║ [... 6 more specifications]                             ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║ 🎯 EDGE CASES (7 identified)                             ║
║                                                          ║
║ 1. Hurdle rate exceeds maximum (1.5 → 1.0)              ║
║ 2. Hurdle rate below minimum (-0.5 → 0.0)               ║
║ 3. Catch-up rate exceeds maximum (1.2 → 1.0)            ║
║ 4. Invalid waterfall type (throws error)                ║
║ 5. Carry vesting with future dates (time-based logic)   ║
║ 6. Empty waterfall configuration (defaults applied)     ║
║ 7. No-op changes (reference preservation)               ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║ 📈 TEST COVERAGE                                         ║
║                                                          ║
║ Tested Functions:                                       ║
║   ✓ applyWaterfallChange (19 tests)                     ║
║   ✓ changeWaterfallType (8 tests)                       ║
║                                                          ║
║ Untested Functions:                                     ║
║   ✗ validateWaterfallField (0 tests) - COVERAGE GAP     ║
║                                                          ║
║ Coverage: 67% (2/3 functions)                           ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║ ✅ EXTRACTION COMPLETE                                   ║
║                                                          ║
║ Output: docs/behavioral-specs/waterfall-specs.md        ║
║ Execution Time: 3.2 seconds                             ║
╚══════════════════════════════════════════════════════════╝
```

## Examples

### Example 1: Single Function Specs

```bash
/behavioral-spec "client/src/lib/__tests__/waterfall.test.ts"

# Extracted:
19 Behavioral Specifications for applyWaterfallChange()
- 7 edge cases (clamping, validation, type switching)
- 12 normal cases (typical usage patterns)

8 Behavioral Specifications for changeWaterfallType()
- 2 edge cases (invalid types)
- 6 normal cases (AMERICAN ↔ EUROPEAN switching)

Output: docs/behavioral-specs/waterfall-specs.md
```

### Example 2: Engine Test Suite

```bash
/behavioral-spec "client/src/core/reserve/__tests__/ReserveEngine.test.ts"

# Extracted:
32 Behavioral Specifications for ReserveEngine
- 12 edge cases (empty portfolios, null values, cap enforcement)
- 20 normal cases (allocation strategies, pacing calculations)

Test Coverage:
- calculateReserves: 18 test cases
- allocateByStrategy: 10 test cases
- validateAllocation: 4 test cases
Coverage: 100% (3/3 public methods tested)

Output: docs/behavioral-specs/reserve-engine-specs.md
```

### Example 3: Pattern-Based Extraction

```bash
/behavioral-spec "waterfall"

# Discovers:
1. client/src/lib/__tests__/waterfall.test.ts (27 test cases)
2. client/src/components/carry/__tests__/WaterfallConfig.test.tsx (15 test cases)

# Extracts:
42 Total Behavioral Specifications
- 27 from waterfall helpers
- 15 from WaterfallConfig UI component

Outputs:
- docs/behavioral-specs/waterfall-specs.md
- docs/behavioral-specs/waterfall-config-specs.md
```

## Integration

This command works with:

### Existing Commands

- **/notebooklm-generate**: Uses behavioral specs in Phase 3
- **/doc-validate**: Validates documented behavior matches test assertions
- **/test-smart**: Identifies which test files to extract specs from

### Agents

- **behavioral-spec-extractor** (if available): Performs extraction with AST
  analysis
- **test-automator**: Analyzes test coverage and suggests additional tests
- **docs-architect**: Uses behavioral specs as ground truth for documentation

### Memory System

- **/log-change**: Log when specs extracted
- Track behavioral specification coverage metrics

## Output Formats

### Markdown (Default)

```markdown
# Behavioral Specifications: applyWaterfallChange

## Summary

19 test cases, 7 edge cases, 12 normal cases

## Edge Cases

### 1. Hurdle Rate Maximum Clamping

**Behavior**: Clamps hurdle rate to maximum 1.0 **Input**:
`{ field: 'hurdle', value: 1.5 }` **Expected**: `{ hurdle: 1.0 }` **Category**:
Validation **Test**: client/src/lib/**tests**/waterfall.test.ts:23

[... more edge cases]

## Normal Cases

[... normal test cases]
```

### JSON (For Automation)

```bash
/behavioral-spec "waterfall.test.ts" --json

{
  "testFile": "client/src/lib/__tests__/waterfall.test.ts",
  "implementationFile": "client/src/lib/waterfall.ts",
  "extractedAt": "2025-10-26T14:45:32Z",
  "totalSpecs": 19,
  "edgeCases": 7,
  "functions": [
    {
      "name": "applyWaterfallChange",
      "testCount": 19,
      "specs": [...]
    }
  ]
}
```

### Structured Table (For Documentation)

```bash
/behavioral-spec "waterfall.test.ts" --table

| Function | Test Case | Input | Expected | Category | Line |
|----------|-----------|-------|----------|----------|------|
| applyWaterfallChange | Hurdle clamping | 1.5 | 1.0 | Edge | 23 |
| applyWaterfallChange | No-op reference | 0.08 | Same ref | Perf | 45 |
[... more rows]
```

## Performance Targets

- **Test file discovery**: <2 seconds
- **Single test file parsing**: <1 second
- **Assertion extraction**: <1 second per test case
- **Behavioral spec generation**: <2 seconds
- **Dependency mapping**: <1 second

**Total Target**: <5 seconds per test file

## Troubleshooting

### Issue: "No test cases found"

**Cause**: Test file doesn't follow Vitest conventions (describe/it)
**Solution**: Check for custom test runners, ensure `describe()` and `it()` used

### Issue: "Assertions not extracted"

**Cause**: Non-standard assertion library (not `expect`) **Solution**: Verify
test file uses Vitest's `expect()`, check for custom matchers

### Issue: "Implementation file mapping failed"

**Cause**: Import path resolution issue (path aliases) **Solution**: Verify path
aliases (@/, @shared/) configured correctly

### Issue: "Edge cases not identified"

**Cause**: Edge cases not obvious from test names **Solution**: Manually review
test setups, add explicit edge case comments

## Notes

- Run **after writing tests** (TDD workflow: tests → specs → docs)
- Behavioral specs serve as **ground truth** for documentation
- Edge cases from tests should appear in documentation
- Test coverage gaps indicate missing documentation
- Complements `/notebooklm-generate` (provides test context)

## Related Documentation

- /notebooklm-generate: Uses behavioral specs in Phase 3
- /doc-validate: Validates docs match test assertions
- /test-smart: Smart test selection for spec extraction
- CLAUDE.md: Test-driven documentation philosophy
