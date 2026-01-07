# Oh-My-OpenCode LSP Integration Test

**Purpose**: Isolated environment to test oh-my-opencode's LSP (Language Server
Protocol) capabilities vs. our current text-based editing approach.

**Created**: 2026-01-07 **Duration**: 1 week validation period **Decision
Gate**: 2026-01-14

## Test Objectives

1. **LSP Code Manipulation** - Compare LSP-based refactoring vs. Read/Edit tools
2. **AST-Grep Structural Search** - Benchmark vs. current Grep tool
3. **Ultrawork Auto-Activation** - Evaluate vs. Superpowers skills
4. **Performance** - Measure speed, accuracy, developer experience

## Setup

```bash
# 1. Create test project
cd c:\dev\Updog_restore\experiments\oh-my-opencode-lsp-test
npm init -y

# 2. Install test dependencies
npm install typescript @types/node

# 3. Create sample TypeScript files for testing
mkdir src
# (see test-scenarios/ directory)

# 4. Run oh-my-opencode in this directory
# It will use the parent .opencode/ config
```

## Test Scenarios

### Scenario 1: Rename Variable Across Files

**Task**: Rename `userConfig` to `configuration` across 5 files

**Current Approach (Read/Edit)**:

1. Grep for all occurrences
2. Read each file
3. Edit each occurrence manually
4. Verify no broken references

**Oh-My-OpenCode LSP Approach**:

- Uses LSP rename operation
- Automatic reference tracking
- Zero manual file edits

**Metrics**:

- Time to complete
- Accuracy (missed references?)
- Cognitive load (manual steps)

### Scenario 2: Extract Function Refactoring

**Task**: Extract repeated error handling code into `handleApiError()` function

**Current Approach**:

1. Identify all error handling patterns
2. Create new function manually
3. Replace all occurrences
4. Update imports

**Oh-My-OpenCode LSP**:

- LSP extract function operation
- Automatic import management
- Type safety preservation

### Scenario 3: Find All References (AST-Grep)

**Task**: Find all places where `validateSchema` is called with >2 arguments

**Current Grep**:

```bash
grep "validateSchema.*,.*," -r src/
```

- Text-based, can miss multi-line calls
- No semantic understanding

**AST-Grep**:

- Structural pattern matching
- Understands syntax tree
- Multi-line aware

## Test Files Structure

```
experiments/oh-my-opencode-lsp-test/
├── README.md (this file)
├── src/
│   ├── auth/
│   │   ├── user-config.ts
│   │   └── session-handler.ts
│   ├── api/
│   │   ├── client.ts
│   │   ├── error-handler.ts
│   │   └── retry-logic.ts
│   └── utils/
│       ├── validation.ts
│       └── schema-validator.ts
├── test-results/
│   ├── lsp-rename-results.md
│   ├── lsp-extract-function-results.md
│   ├── ast-grep-benchmark.md
│   └── ultrawork-evaluation.md
└── package.json
```

## Evaluation Rubric

| Criterion          | Weight | Current (Read/Edit)            | LSP Target            |
| ------------------ | ------ | ------------------------------ | --------------------- |
| **Speed**          | 30%    | Baseline (manual)              | 2x+ faster            |
| **Accuracy**       | 40%    | Baseline (manual verification) | 100% (LSP guarantees) |
| **Cognitive Load** | 20%    | High (many manual steps)       | Low (automatic)       |
| **Type Safety**    | 10%    | Manual verification            | Compiler-verified     |

**Minimum Threshold**: 2x improvement in speed OR accuracy to justify adoption

## Daily Test Log

### Day 1 (2026-01-07)

- [x] Environment setup
- [x] Created test scenarios
- [ ] Baseline measurements (Read/Edit approach)

### Day 2-3

- [ ] LSP rename refactoring test
- [ ] AST-Grep structural search test
- [ ] Ultrawork auto-activation test

### Day 4-5

- [ ] Performance benchmarking
- [ ] Developer experience comparison
- [ ] Edge case testing

### Day 6-7

- [ ] Results analysis
- [ ] Cherry-pick valuable patterns
- [ ] Document decision

## Decision Criteria

**ADOPT LSP Integration if:**

- [x] 2x+ speed improvement on refactoring tasks
- [x] 100% accuracy (zero missed references)
- [x] Works seamlessly with existing workflow

**REJECT if:**

- [ ] <50% speed improvement
- [ ] Accuracy issues (missed references, broken code)
- [ ] Requires significant workflow changes

**CHERRY-PICK if:**

- [x] Some features valuable (e.g., AST-Grep only)
- [x] LSP for specific tasks, Read/Edit for others
- [x] Extract patterns without full dependency

## Related Documentation

- [ADR-016: Multi-AI Migration](../../DECISIONS.md#adr-016)
- [Installation Script](../../scripts/install-oh-my-opencode.ps1)
- [Monitoring Script](../../scripts/monitor-oh-my-opencode.ps1)

## Expected Outcomes

1. **Quantified LSP value** - Exact speed/accuracy improvements
2. **AST-Grep patterns** - Specific use cases where structural search wins
3. **Integration strategy** - How to add LSP without replacing existing tools
4. **Decision documentation** - Clear ADOPT/REJECT/CHERRY-PICK recommendation
