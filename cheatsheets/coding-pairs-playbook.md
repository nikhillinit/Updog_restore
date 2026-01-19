---
status: ACTIVE
last_updated: 2026-01-19
---

# Coding Pairs Playbook

**Purpose**: Eliminate CI failures through continuous pre-commit review

**Target**: Zero CI failures, 100% code quality before push

**When to Use**: All production code changes, high-risk refactoring, new
features

---

## Quick Reference

| Pairing Mode          | Use When         | Review Frequency               | Success Metric          |
| --------------------- | ---------------- | ------------------------------ | ----------------------- |
| **Review Pairing**    | Production code  | Every 10-20 lines              | Zero defects pre-commit |
| **Test Pairing**      | TDD workflow     | After each test/implementation | 100% passing tests      |
| **Solo + Pre-Commit** | Low-risk changes | Before commit only             | <5% CI failures         |

---

## The Two Pairing Modes

### 1. Review Pairing

**Pattern**: Builder ↔ Reviewer working synchronously

**Workflow**:

```
1. Builder writes 10-20 lines
2. Reviewer analyzes immediately (code-reviewer agent)
3. Address critical issues before next lines
4. Repeat until feature complete
5. Final pre-commit validation
```

**Example Session**:

```typescript
// Builder writes (Step 1):
export async function calculateReserves(
  portfolio: Portfolio
): Promise<Reserves> {
  const companies = portfolio.companies.filter((c) => c.stage !== 'Exited');
  const baseAllocations = companies.map(
    (c) => c.invested * STAGE_MULTIPLIERS[c.stage]
  );
  return baseAllocations.reduce((sum, a) => sum + a, 0);
}

// Reviewer (code-reviewer agent) catches (Step 2):
// ❌ ISSUE 1: Missing error handling (what if STAGE_MULTIPLIERS[c.stage] undefined?)
// ❌ ISSUE 2: No input validation (portfolio could be null)
// ❌ ISSUE 3: Silent NaN propagation (c.invested could be NaN)
// ⚠️  WARNING: Type inference weak (explicit return type needed)

// Builder fixes immediately (Step 3):
export async function calculateReserves(portfolio: Portfolio): Promise<number> {
  if (!portfolio || !portfolio.companies) {
    throw new TypeError('Portfolio and companies are required');
  }

  const companies = portfolio.companies.filter((c) => c.stage !== 'Exited');

  const baseAllocations = companies.map((c) => {
    const invested = c.invested;
    const multiplier = STAGE_MULTIPLIERS[c.stage];

    if (typeof invested !== 'number' || isNaN(invested) || invested < 0) {
      throw new RangeError(
        `Invalid invested amount for company ${c.id}: ${invested}`
      );
    }

    if (!multiplier) {
      throw new Error(`Unknown stage: ${c.stage} for company ${c.id}`);
    }

    return invested * multiplier;
  });

  return baseAllocations.reduce((sum, a) => sum + a, 0);
}

// Reviewer approves, Builder continues to next 10-20 lines
```

### 2. Test Pairing

**Pattern**: Test-First ↔ Builder in TDD cycle

**Workflow**:

```
1. Test-First writes failing test
2. Builder implements minimal code to pass
3. Test-First verifies green
4. Refactor together
5. Repeat for next behavior
```

**Example Session**:

```typescript
// Test-First writes (Step 1):
describe('calculateReserves', () => {
  it('should throw TypeError when portfolio is null', () => {
    expect(() => calculateReserves(null)).toThrow(TypeError);
    expect(() => calculateReserves(null)).toThrow(
      'Portfolio and companies are required'
    );
  });
});

// Run test → RED (Step 1 complete)

// Builder implements (Step 2):
export async function calculateReserves(portfolio: Portfolio): Promise<number> {
  if (!portfolio) {
    throw new TypeError('Portfolio and companies are required');
  }
  // ... rest of implementation
}

// Run test → GREEN (Step 3)

// Test-First writes next test (Step 1 again):
describe('calculateReserves', () => {
  it('should throw RangeError when invested is negative', () => {
    const portfolio = createPortfolio({
      companies: [{ id: '1', stage: 'Series A', invested: -1000 }],
    });
    expect(() => calculateReserves(portfolio)).toThrow(RangeError);
  });
});

// Cycle continues...
```

---

## Integration with Existing Agents

### Pre-Commit Review Stack

**6 Specialized Review Agents** (run before every commit):

```bash
# 1. Comment Analyzer
Task(agent=comment-analyzer, files=unstaged)
# Output: Comment accuracy, rot detection

# 2. PR Test Analyzer
Task(agent=pr-test-analyzer, files=unstaged)
# Output: Behavioral coverage gaps

# 3. Silent Failure Hunter
Task(agent=silent-failure-hunter, files=unstaged)
# Output: Error handling issues (9-factor scoring)

# 4. Type Design Analyzer
Task(agent=type-design-analyzer, files=unstaged)
# Output: Type quality (1-10 scores)

# 5. Code Reviewer
Task(agent=code-reviewer, files=unstaged)
# Output: CLAUDE.md compliance

# 6. Code Simplifier
Task(agent=code-simplifier, files=unstaged)
# Output: Complexity reduction suggestions
```

**Automation Example**:

```typescript
// .git/hooks/pre-commit (pseudo-code)
const unstagedFiles = await getUnstagedFiles();

// Run 6 agents in parallel
const [comments, tests, errors, types, review, simplify] = await Promise.all([
  runAgent('comment-analyzer', unstagedFiles),
  runAgent('pr-test-analyzer', unstagedFiles),
  runAgent('silent-failure-hunter', unstagedFiles),
  runAgent('type-design-analyzer', unstagedFiles),
  runAgent('code-reviewer', unstagedFiles),
  runAgent('code-simplifier', unstagedFiles),
]);

// Block commit if CRITICAL issues found
const criticalIssues = [
  ...errors.filter((e) => e.severity === 'CRITICAL'),
  ...types.filter((t) => t.score < 3),
];

if (criticalIssues.length > 0) {
  console.error('❌ CRITICAL ISSUES FOUND - Commit blocked');
  criticalIssues.forEach((issue) => console.error(issue));
  process.exit(1);
}

// Warn on HIGH issues
const warnings = review.filter((r) => r.severity === 'HIGH');
if (warnings.length > 0) {
  console.warn('⚠️  HIGH priority issues (commit allowed):');
  warnings.forEach((w) => console.warn(w));
}
```

---

## Success Metrics

### Target: Zero CI Failures

**Baseline** (without Coding Pairs):

- CI failure rate: 20-30%
- Average fix time: 15-30 minutes
- Rework cycles: 2-3 iterations
- Developer frustration: High

**With Coding Pairs**:

- CI failure rate: 0-2%
- Average fix time: 0 minutes (caught pre-commit)
- Rework cycles: 0-1 iterations
- Developer confidence: High

### Measurement

```bash
# Track CI failure rate
git log --since="1 month ago" --all --oneline | wc -l  # Total commits
gh run list --status failure --limit 100 | wc -l      # Failed CI runs

# Calculate failure rate
Failure Rate = (Failed Runs / Total Commits) × 100%

# Target: <2%
```

---

## When to Use Each Mode

### Review Pairing

**✅ Use When:**

- Writing production code
- High-risk refactoring (database, auth, payments)
- Security-sensitive features
- Complex business logic (waterfall, reserves, pacing)
- Unfamiliar codebase areas

**❌ Don't Use When:**

- Trivial changes (typo fixes, formatting)
- Documentation updates
- Test data fixtures
- Configuration files (unless complex)

### Test Pairing

**✅ Use When:**

- Implementing new features (TDD required)
- Fixing bugs (write failing test first)
- Refactoring (maintain test coverage)
- API contract changes
- Critical calculation logic

**❌ Don't Use When:**

- UI styling (visual review better)
- Exploratory prototyping
- Proof-of-concept code
- Throwaway scripts

---

## Real Examples from This Project

### Example 1: Waterfall Calculation Review

**Scenario**: Builder implements AMERICAN waterfall calculation

**Review Pairing Session**:

```typescript
// Builder (Lines 1-15):
function calculateCarry(
  waterfall: AmericanWaterfall,
  proceeds: number
): number {
  const hurdle = proceeds * waterfall.hurdle;
  const catchUp = Math.min(proceeds - hurdle, hurdle * waterfall.catchUp);
  const carry = (proceeds - hurdle - catchUp) * waterfall.carryPercentage;
  return carry;
}

// Reviewer (code-reviewer agent):
// ✅ GOOD: Uses discriminated union (AmericanWaterfall)
// ❌ CRITICAL: No validation (hurdle/catchUp/carryPercentage could be invalid)
// ❌ CRITICAL: Silent NaN propagation (proceeds could be NaN)
// ⚠️  WARNING: Doesn't use waterfall helpers (applyWaterfallChange)

// Builder fixes (Lines 16-30):
import { WaterfallSchema } from '@shared/schemas/waterfall';

function calculateCarry(
  waterfall: AmericanWaterfall,
  proceeds: number
): number {
  // Validate waterfall structure
  const validated = WaterfallSchema.parse(waterfall);

  // Validate proceeds
  if (typeof proceeds !== 'number' || isNaN(proceeds) || proceeds < 0) {
    throw new RangeError(
      `Proceeds must be non-negative number, got: ${proceeds}`
    );
  }

  // Use Decimal.js for precision
  const proceedsDecimal = new Decimal(proceeds);
  const hurdle = proceedsDecimal.mul(validated.hurdle);
  const catchUp = Decimal.min(
    proceedsDecimal.minus(hurdle),
    hurdle.mul(validated.catchUp)
  );
  const carry = proceedsDecimal
    .minus(hurdle)
    .minus(catchUp)
    .mul(validated.carryPercentage);

  return carry.toNumber();
}

// Reviewer approves ✅
```

### Example 2: Test Pairing for Reserve Engine

**Scenario**: Adding validation to ReserveEngine

**Test Pairing Session**:

```typescript
// Test-First (RED):
it('should throw RangeError when company invested is negative', () => {
  const companies = [createCompany({ invested: -1000, stage: 'Seed' })];
  expect(() => ReserveEngine(companies)).toThrow(RangeError);
  expect(() => ReserveEngine(companies)).toThrow(
    'invested amount must be non-negative'
  );
});

// Builder (GREEN):
export function ReserveEngine(companies: Company[]): ReserveAllocation[] {
  return companies.map((company) => {
    if (company.invested < 0) {
      throw new RangeError(
        `Company ${company.id}: invested amount must be non-negative`
      );
    }
    // ... rest of logic
  });
}

// Test-First (REFACTOR):
// Extract validation to separate function
function validateCompany(company: Company): void {
  if (company.invested < 0) {
    throw new RangeError(
      `Company ${company.id}: invested amount must be non-negative`
    );
  }
  if (!STAGE_MULTIPLIERS[company.stage]) {
    throw new Error(
      `Unknown stage: ${company.stage} for company ${company.id}`
    );
  }
}

// All tests still pass ✅
```

---

## Anti-Patterns and Common Mistakes

### ❌ Anti-Pattern 1: Batch Review

```typescript
// WRONG: Write 200 lines, then review
async function complexFeature() {
  // ... 200 lines of code ...
}

// Reviewer finds 30 issues, major rework needed
```

**Fix**: Review every 10-20 lines, iterate immediately

---

### ❌ Anti-Pattern 2: Superficial Review

```typescript
// WRONG: Reviewer just checks "looks good"
Reviewer: 'Looks good ✅';

// Later in CI:
// - Silent failure found
// - Missing error handling
// - Type errors
```

**Fix**: Use automated agents for systematic review

---

### ❌ Anti-Pattern 3: Skipping Tests

```typescript
// WRONG: "I'll write tests later"
function newFeature() {
  // implementation without tests
}

// Tests never get written, bugs slip through
```

**Fix**: TDD with Test Pairing (tests first, always)

---

### ❌ Anti-Pattern 4: Ignoring Warnings

```typescript
// Reviewer: "⚠️  HIGH: Missing input validation"
Builder: "I'll fix it in a follow-up PR";

// Follow-up PR never happens, production bug occurs
```

**Fix**: Address HIGH issues immediately, document exceptions

---

## Practical Workflow Templates

### Template 1: New Feature (Review Pairing)

```markdown
## Feature: Add vintage year filtering to portfolio

**Review Frequency**: Every 10-20 lines **Agents**: code-reviewer,
type-design-analyzer

**Session Log**:

- [✅] Lines 1-15: Add vintage_year column to schema (Reviewer: approved)
- [⚠️] Lines 16-30: Add filtering logic (Reviewer: missing validation, fixed)
- [✅] Lines 31-45: Update API route (Reviewer: approved)
- [⚠️] Lines 46-60: Add UI component (Reviewer: accessibility issues, fixed)
- [✅] Final review: All checks passed

**Metrics**:

- Total lines: 60
- Review cycles: 2 issues caught, 0 defects in CI
- Time: 45 minutes (vs 90 min without pairing)
```

### Template 2: Bug Fix (Test Pairing)

````markdown
## Bug Fix: Stage normalization dropping allocations

**Test-First Cycle**:

1. Write failing test (RED):
   ```typescript
   it('should preserve allocations for series-c+', () => {
     const result = normalizeStage('series-c+');
     expect(result).toBe('SERIES_C_PLUS');
   });
   ```
````

2. Implement fix (GREEN):

   ```typescript
   const STAGE_ALIASES = {
     'series-c+': 'SERIES_C_PLUS',
     'series-c-plus': 'SERIES_C_PLUS',
   };
   ```

3. Refactor (CLEAN):
   - Extract to typed map
   - Add 50+ test cases
   - Document in DECISIONS.md

**Metrics**:

- Tests written: 1 failing → 50+ comprehensive
- Bug fixed: Yes
- Regressions introduced: 0

````

---

## Integration with Git Hooks

### Pre-Commit Hook Example

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🔍 Running Coding Pairs pre-commit validation..."

# Get unstaged files
FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$')

if [ -z "$FILES" ]; then
  echo "✅ No TypeScript files changed"
  exit 0
fi

# Run 6 review agents (via npm script)
npm run review:pre-commit

# Exit code from agents determines commit allowance
if [ $? -ne 0 ]; then
  echo "❌ Critical issues found - commit blocked"
  echo "Run 'npm run review:details' for full report"
  exit 1
fi

echo "✅ All checks passed - commit allowed"
exit 0
````

### NPM Script

```json
{
  "scripts": {
    "review:pre-commit": "node scripts/run-coding-pairs-review.js",
    "review:details": "node scripts/run-coding-pairs-review.js --verbose"
  }
}
```

---

## Cost-Benefit Analysis

### Time Investment

**Review Pairing** (per feature):

- Setup time: 2 minutes
- Review time: +20% development time
- Fix time: Immediate (vs 15-30 min later)
- **Net**: 10-15% slower development, 100% fewer rework cycles

**Test Pairing** (per feature):

- Test writing: +30% development time
- Debugging time: -80% (catch bugs early)
- **Net**: Break-even or faster, vastly higher quality

### ROI

**Prevented Issues** (monthly, estimated):

- CI failures: 10-15 → 0-1 (saves 3-5 hours)
- Production bugs: 2-3 → 0-1 (saves 5-10 hours)
- Code review cycles: 50-80 comments → 10-20 (saves 4-6 hours)

**Total Monthly Savings**: 12-21 hours (1.5-2.5 workdays)

---

## Quick Start Checklist

### For Your First Review Pairing Session

- [ ] Choose high-risk feature (auth, payments, calculations)
- [ ] Set up code-reviewer agent
- [ ] Write 10-20 lines
- [ ] Run agent review immediately
- [ ] Fix critical issues before next lines
- [ ] Repeat until feature complete
- [ ] Final validation with all 6 agents
- [ ] Commit with confidence

### For Your First Test Pairing Session

- [ ] Choose testable feature (API, business logic)
- [ ] Write failing test first
- [ ] Verify test fails (RED)
- [ ] Implement minimal code to pass
- [ ] Verify test passes (GREEN)
- [ ] Refactor for clarity
- [ ] Run full test suite
- [ ] Commit with tests

---

## Troubleshooting

**Q: Review Pairing slows me down too much** A: Start with critical code only
(auth, payments). Expand as you build muscle memory.

**Q: Agents find too many low-priority issues** A: Filter for CRITICAL and HIGH
only. Address MEDIUM in batches.

**Q: Test Pairing feels unnatural** A: Pair with experienced TDD developer for
1-2 sessions. Pattern becomes intuitive.

**Q: Pre-commit hooks are too slow** A: Run only critical agents
(silent-failure-hunter, type-design-analyzer). Full review on PR.

**Q: Team resists process overhead** A: Track CI failure rate before/after. Data
convinces skeptics.

---

## References

- **Multi-Agent Orchestration**: `cheatsheets/multi-agent-orchestration.md`
- **Code Review Agents**: `cheatsheets/pr-review-workflow.md`
- **TDD Patterns**: `cheatsheets/testing.md`
- **Project Standards**: `CLAUDE.md`

---

**Created**: 2025-11-06 **Last Updated**: 2025-11-06 **Owner**: Development Team
**Next Review**: 2025-12-06
