# PR Review Workflow Cheatsheet

**Official Plugin:** PR Review Toolkit **Installation:** `/plugins` → Search
"pr-review-toolkit" **Documentation:**
https://github.com/anthropics/claude-code/tree/main/plugins/pr-review-toolkit

---

## Overview

The PR Review Toolkit provides 6 specialized review agents that automatically
trigger based on your request context. Each agent focuses on a specific quality
dimension.

---

## The 6 Review Agents

### 1. `comment-analyzer` - Comment Accuracy & Maintainability

**Focus:** Verify comments match actual code behavior

**Analyzes:**

- Comment accuracy vs actual implementation
- Documentation completeness
- Comment rot and technical debt
- Misleading or outdated comments

**When to use:**

- After adding/modifying calculation comments
- Before finalizing PRs with documentation changes
- When reviewing existing comments for accuracy

**Triggers:**

```
"Check if the comments are accurate in ReserveEngine"
"Review the documentation I added to waterfall.ts"
"Analyze comments for technical debt in PacingEngine"
```

**Critical for VC fund platform:**

- ✅ Fund calculation comments must match logic exactly
- ✅ Waterfall distribution comments require precision
- ✅ Monte Carlo simulation documentation must be accurate

---

### 2. `pr-test-analyzer` - Test Coverage Quality

**Focus:** Behavioral vs line coverage analysis

**Analyzes:**

- Behavioral coverage (not just line coverage)
- Critical gaps in test coverage
- Test quality and resilience
- Edge cases and error conditions

**When to use:**

- After creating a PR
- When adding new calculation engines
- To verify test thoroughness

**Triggers:**

```
"Check if the tests are thorough for ReserveEngine"
"Review test coverage for this PR"
"Are there any critical test gaps in waterfall.ts?"
```

**Critical for VC fund platform:**

- ✅ Financial calculations require behavioral coverage
- ✅ Edge cases in reserve allocation must be tested
- ✅ Waterfall distribution edge cases (AMERICAN vs EUROPEAN)

---

### 3. `silent-failure-hunter` - Error Handling Validation

**Focus:** Catch silent failures and inadequate error handling

**Analyzes:**

- Silent failures in catch blocks
- Inadequate error handling
- Inappropriate fallback behavior
- Missing error logging

**When to use:**

- After implementing error handling
- When reviewing try/catch blocks
- Before finalizing PRs with error handling

**Triggers:**

```
"Review the error handling in PacingEngine"
"Check for silent failures in API routes"
"Analyze catch blocks in reserve calculations"
```

**Critical for VC fund platform:**

- ✅ Fund calculation errors must be explicit (no silent failures)
- ✅ API error handling for financial data
- ✅ BullMQ worker error handling (Redis/background jobs)

---

### 4. `type-design-analyzer` - TypeScript Type Quality

**Focus:** Type design quality and invariants (rated 1-10)

**Analyzes:**

- Type encapsulation (1-10 score)
- Invariant expression (1-10 score)
- Type usefulness (1-10 score)
- Invariant enforcement (1-10 score)

**When to use:**

- When introducing new types
- During PR creation with data models
- When refactoring type designs

**Triggers:**

```
"Review the Waterfall type design"
"Analyze type design for ReserveAllocation"
"Check if FundSetup type has strong invariants"
```

**Critical for VC fund platform:**

- ✅ Waterfall types (AMERICAN vs EUROPEAN discriminated union)
- ✅ Fund calculation input types (ReserveEngine, PacingEngine)
- ✅ API request/response schemas (Zod + TypeScript alignment)

---

### 5. `code-reviewer` - General Code Quality

**Focus:** CLAUDE.md compliance, bugs, quality issues

**Analyzes:**

- CLAUDE.md compliance
- Style violations
- Bug detection
- Code quality issues
- Confidence-based filtering (≥80% confidence)

**When to use:**

- After writing or modifying code
- Before committing changes
- Before creating pull requests

**Triggers:**

```
"Review my recent changes"
"Check if everything looks good in server/routes/funds.ts"
"Review this code before I commit"
```

**Critical for VC fund platform:**

- ✅ Follows waterfall update pattern (applyWaterfallChange,
  changeWaterfallType)
- ✅ Path aliases (@/, @shared/, @assets/)
- ✅ Zod validation in API routes

---

### 6. `code-simplifier` - Code Clarity & Refactoring

**Focus:** Simplify complex code while preserving functionality

**Analyzes:**

- Code clarity and readability
- Unnecessary complexity and nesting
- Redundant code and abstractions
- Consistency with project standards
- Overly compact or clever code

**When to use:**

- After writing or modifying code
- After passing code review
- When code works but feels complex

**Triggers:**

```
"Simplify the reserve allocation calculation logic"
"Make the waterfall type switching clearer"
"Refine the cohort analysis implementation"
```

**Critical for VC fund platform:**

- ✅ Simplify complex Monte Carlo simulation logic
- ✅ Clarify nested waterfall calculations
- ✅ Refactor cohort aggregation for readability

---

## Usage Patterns

### Individual Agent Usage

Simply ask questions matching an agent's focus area:

```
"Can you check if the tests cover all edge cases in ReserveEngine?"
→ Triggers pr-test-analyzer

"Review the error handling in the fund reallocation API"
→ Triggers silent-failure-hunter

"I've added documentation to waterfall.ts - is it accurate?"
→ Triggers comment-analyzer
```

### Comprehensive PR Review

For thorough PR review before merging:

```
"I'm ready to create this PR. Please:
1. Review test coverage for ReserveEngine changes
2. Check for silent failures in error handling
3. Verify calculation comments are accurate
4. Review the Waterfall type design
5. General code review for CLAUDE.md compliance"
```

This triggers all 5 relevant agents in parallel.

### Proactive Review

Claude may proactively use these agents based on context:

- **After writing code** → code-reviewer
- **After adding docs** → comment-analyzer
- **Before creating PR** → Multiple agents as appropriate
- **After adding types** → type-design-analyzer

---

## Integration with Custom Commands

### When to use PR Review agents vs custom commands:

| Scenario                           | Use This                | Reason                                      |
| ---------------------------------- | ----------------------- | ------------------------------------------- |
| Test coverage **quality** analysis | `pr-test-analyzer`      | Behavioral coverage analysis                |
| Test **execution**                 | `/test-smart`           | Intelligent test selection based on changes |
| Pre-deployment validation          | `/deploy-check`         | Build, bundle, smoke tests                  |
| Error handling review              | `silent-failure-hunter` | Specialized error handling analysis         |
| Type design review                 | `type-design-analyzer`  | Type quality scoring                        |
| General code review                | `code-reviewer`         | CLAUDE.md compliance                        |
| Auto-fix lint/format               | `/fix-auto`             | Automated repair                            |

**Recommendation:** Use both together

```bash
# 1. Run your custom test command
/test-smart

# 2. Then review test quality with agent
"Check if the tests are thorough for the changes I made"
→ Triggers pr-test-analyzer
```

---

## Best Practices for VC Fund Platform

### Before Committing

Run these reviews on financial calculation changes:

1. **Error Handling** (critical for fund calculations):

   ```
   "Review error handling in ReserveEngine calculations"
   ```

2. **Comment Accuracy** (calculations must be documented correctly):
   ```
   "Verify comments match logic in waterfall distribution"
   ```

### Before Creating PR

Run comprehensive review:

1. **Test Coverage Quality**:

   ```
   "Analyze test coverage for reserve allocation changes"
   ```

2. **Type Design** (if types changed):

   ```
   "Review Waterfall type design for strong invariants"
   ```

3. **General Review**:
   ```
   "Review recent changes for CLAUDE.md compliance"
   ```

### After Passing Review

Polish code clarity:

```
"Simplify the cohort aggregation logic while preserving functionality"
```

---

## Domain-Specific Focus Areas

### ReserveEngine (`client/src/core/reserve/`)

- **Test coverage:** Edge cases in allocation calculations
- **Error handling:** Division by zero, negative values, cap validation
- **Comments:** Calculation formulas must match implementation
- **Types:** ReserveAllocation, ReserveStrategy invariants

### PacingEngine (`client/src/core/pacing/`)

- **Test coverage:** Investment pacing scenarios
- **Error handling:** Invalid timeline data, negative pacing
- **Comments:** Pacing algorithm documentation accuracy

### Waterfall (`client/src/lib/waterfall.ts`)

- **Type design:** AMERICAN vs EUROPEAN discriminated union
- **Comments:** Hurdle/catchup/carry vesting documentation
- **Simplification:** Type switching logic (changeWaterfallType)

### API Routes (`server/routes/`)

- **Error handling:** API error responses, validation failures
- **Test coverage:** Request validation, error scenarios
- **Type design:** Zod schema alignment with TypeScript types

---

## Confidence Scoring

Agents provide confidence scores for findings:

| Agent                   | Scoring System                              |
| ----------------------- | ------------------------------------------- |
| `comment-analyzer`      | High confidence in accuracy checks          |
| `pr-test-analyzer`      | Gap severity 1-10 (10 = critical, must add) |
| `silent-failure-hunter` | Severity levels for error handling issues   |
| `type-design-analyzer`  | 4 dimensions × 1-10 scores                  |
| `code-reviewer`         | Confidence 0-100 (91-100 = critical)        |
| `code-simplifier`       | Complexity identification                   |

**Only high-confidence issues are reported** (reduces noise).

---

## Output Formats

All agents provide structured, actionable output:

- ✅ Clear issue identification
- ✅ Specific file and line references
- ✅ Explanation of why it's a problem
- ✅ Suggestions for improvement
- ✅ Prioritized by severity

---

## Tips

- **Be specific:** Target specific agents for focused review
- **Use proactively:** Run before creating PRs, not after
- **Address critical issues first:** Agents prioritize findings
- **Iterate:** Run again after fixes to verify
- **Don't over-use:** Focus on changed code, not entire codebase

---

## Troubleshooting

### Agent Not Triggering

**Issue:** Asked for review but agent didn't run

**Solution:**

- Be more specific in your request
- Mention the agent type explicitly
- Reference the specific concern (e.g., "test coverage quality")

### Agent Analyzing Wrong Files

**Issue:** Agent reviewing too much or wrong files

**Solution:**

- Specify which files to focus on
- Reference the specific change or area
- Mention "recent changes" or "git diff"

---

## Example Workflows

### Workflow 1: New Financial Calculation Feature

```bash
# 1. Implement ReserveEngine enhancement
# (code changes...)

# 2. Review error handling
"Review error handling in ReserveEngine reserve allocation logic"
→ silent-failure-hunter

# 3. Fix issues, then check test coverage
"Analyze test coverage quality for ReserveEngine changes"
→ pr-test-analyzer

# 4. Verify comments
"Check if calculation comments are accurate in ReserveEngine"
→ comment-analyzer

# 5. General review
"Review ReserveEngine changes for CLAUDE.md compliance"
→ code-reviewer

# 6. Simplify if needed
"Simplify the reserve allocation calculation logic"
→ code-simplifier
```

### Workflow 2: New Waterfall Type

```bash
# 1. Add new waterfall variation
# (code changes to client/src/lib/waterfall.ts)

# 2. Review type design
"Review the Waterfall type design for strong invariants"
→ type-design-analyzer

# 3. Check test coverage
"Analyze test coverage for waterfall type changes"
→ pr-test-analyzer

# 4. Verify comments
"Check if waterfall distribution comments are accurate"
→ comment-analyzer

# 5. Simplify type switching
"Simplify the waterfall type switching logic"
→ code-simplifier
```

### Workflow 3: API Route Changes

```bash
# 1. Modify fund reallocation API
# (code changes to server/routes/funds.ts)

# 2. Check error handling
"Review error handling in fund reallocation API"
→ silent-failure-hunter

# 3. Verify test coverage
"Check if API tests cover all error scenarios"
→ pr-test-analyzer

# 4. Type review (if schemas changed)
"Review API request/response type design"
→ type-design-analyzer

# 5. General review
"Review API changes for CLAUDE.md compliance"
→ code-reviewer
```

---

## Related Documentation

- **CLAUDE.md** - Core architecture and conventions
- **cheatsheets/testing.md** - Testing guidelines
- **cheatsheets/api.md** - API development patterns
- **DECISIONS.md** - Official plugins adoption decision

---

**Last Updated:** 2025-10-18 **Plugin Version:** 1.0.0 (official Anthropic
plugin)
