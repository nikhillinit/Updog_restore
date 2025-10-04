# Agent Evaluation Guide
## Using Backtest Dataset for Agent Pattern Evaluation

**Version:** 1.0.0
**Last Updated:** 2025-10-03

## Overview

This guide provides specific recommendations for which test cases are best suited for evaluating each agent pattern in the autonomous development system.

## Agent Pattern Evaluation Matrix

### 1. Test Repair Agent

**Primary Capability:** Detect and fix test failures automatically

#### Recommended Test Cases (Ranked by Suitability)

##### Tier 1: Ideal Cases (90%+ agent applicability)
| Case ID | Complexity | Description | Why Ideal |
|---------|-----------|-------------|-----------|
| tc-012 | 6/10 | Test timing issues with vi.advanceTimersByTime | Clear async timing pattern, common issue |
| tc-004 | 9/10 | Critical test failures for CI | Multiple test fixes, good variety |
| tc-031 | 4/10 | Improve test configuration | Config-focused, well-scoped |

##### Tier 2: Good Cases (70-89% applicability)
| Case ID | Complexity | Description | Why Good |
|---------|-----------|-------------|----------|
| tc-011 | 9/10 | Test suite stabilization | Comprehensive, teaches patterns |
| tc-005 | 10/10 | Test infrastructure gaps | Infrastructure knowledge test |
| tc-015 | 8/10 | NaN-safe equality with tests | Edge case + test coverage |

##### Tier 3: Challenging Cases (50-69% applicability)
| Case ID | Complexity | Description | Challenge Area |
|---------|-----------|-------------|----------------|
| tc-013 | 1/10 | Skip failing tests | Too simple, not real fix |
| tc-017 | 7/10 | Engine calculation edge cases | Requires domain knowledge |
| tc-020 | 6/10 | PRNG determinism | Specialized knowledge needed |

#### Evaluation Criteria for Test Repair Agent

**Must demonstrate:**
1. ✅ Detect test failures from error output
2. ✅ Identify async timing issues (advanceTimersByTime vs advanceTimersByTimeAsync)
3. ✅ Understand vitest API and test patterns
4. ✅ Add proper wait/flush operations for async tests
5. ✅ Configure test environment correctly

**Success metrics:**
- **High bar:** Fix test without changing production code (when appropriate)
- **Medium bar:** Fix test with minimal, correct production changes
- **Low bar:** Identify issue correctly even if fix is incomplete

**Recommended subset for quick evaluation:**
- tc-012 (timing issues) - MUST PASS
- tc-004 (multiple failures) - SHOULD PASS
- tc-031 (configuration) - SHOULD PASS

---

### 2. TypeScript Fix Agent

**Primary Capability:** Resolve TypeScript compilation errors

#### Recommended Test Cases (Ranked by Suitability)

##### Tier 1: Ideal Cases (90%+ agent applicability)
| Case ID | Complexity | Description | Why Ideal |
|---------|-----------|-------------|-----------|
| tc-006 | 2/10 | Simple type annotations in map callback | Clear error, obvious fix |
| tc-022 | 1/10 | Bracket notation for index signature | Textbook TS error |
| tc-003 | 3/10 | ShareAccessLevel type assertion | Enum/union type pattern |
| tc-028 | 3/10 | Restore omit() in schema | Schema pattern knowledge |

##### Tier 2: Good Cases (70-89% applicability)
| Case ID | Complexity | Description | Why Good |
|---------|-----------|-------------|----------|
| tc-001 | 8/10 | Complex type safety (any, deps, props) | Multi-faceted, realistic |
| tc-008 | 5/10 | React component types | Common React patterns |
| tc-009 | 4/10 | Schema multiline omit patterns | Drizzle ORM knowledge |
| tc-023 | 4/10 | Recharts Legend type | Library upgrade pattern |
| tc-032 | 6/10 | Variance tracking service types | Generic constraints |

##### Tier 3: Challenging Cases (50-69% applicability)
| Case ID | Complexity | Description | Challenge Area |
|---------|-----------|-------------|----------------|
| tc-002 | 7/10 | AI-assisted multi-file fixes | Requires coordination |
| tc-010 | 8/10 | Mass unused variable cleanup | Scale challenge (147 files) |
| tc-025 | 9/10 | Systematic reduction (75→28 errors) | Prioritization needed |
| tc-021 | 8/10 | Multi-AI consensus fixes | Complex cross-file issues |

#### Evaluation Criteria for TypeScript Fix Agent

**Must demonstrate:**
1. ✅ Parse TypeScript compiler errors correctly
2. ✅ Understand type inference and generic constraints
3. ✅ Apply minimal, correct type annotations
4. ✅ Avoid using 'any' except when truly necessary
5. ✅ Maintain type safety while fixing errors

**Success metrics:**
- **High bar:** Fix without introducing 'any', maintains type safety
- **Medium bar:** Fix works but uses some type assertions
- **Low bar:** Compiles but may have weakened type safety

**Recommended subset for quick evaluation:**
- tc-006 (simple) - MUST PASS
- tc-001 (complex) - SHOULD PASS
- tc-008 (React) - SHOULD PASS
- tc-022 (index signature) - MUST PASS

---

### 3. Lint Fix Agent

**Primary Capability:** Resolve ESLint and code quality issues

#### Recommended Test Cases (Ranked by Suitability)

##### Tier 1: Ideal Cases (90%+ agent applicability)
| Case ID | Complexity | Description | Why Ideal |
|---------|-----------|-------------|-----------|
| tc-022 | 1/10 | Bracket notation (also lint) | Common lint pattern |
| tc-034 | 1/10 | Import path fix | Simple import correction |
| tc-035 | 2/10 | YAML syntax fix | Config file syntax |

##### Tier 2: Good Cases (70-89% applicability)
| Case ID | Complexity | Description | Why Good |
|---------|-----------|-------------|----------|
| tc-007 | 6/10 | ESLint config and ignores | Configuration expertise |
| tc-010 | 8/10 | Mass unused variable cleanup | Automated cleanup pattern |

##### Tier 3: Challenging Cases (50-69% applicability)
| Case ID | Complexity | Description | Challenge Area |
|---------|-----------|-------------|----------------|
| tc-002 | 7/10 | Type guards and imports | Mixed TypeScript/lint |

#### Evaluation Criteria for Lint Fix Agent

**Must demonstrate:**
1. ✅ Parse ESLint error output
2. ✅ Apply fixes without breaking functionality
3. ✅ Configure ESLint appropriately
4. ✅ Handle unused imports/variables correctly
5. ✅ Maintain code readability

**Success metrics:**
- **High bar:** Automated fix, no manual intervention needed
- **Medium bar:** Correct fix suggested, requires confirmation
- **Low bar:** Issue identified correctly

**Recommended subset for quick evaluation:**
- tc-022 (bracket notation) - MUST PASS
- tc-007 (config) - SHOULD PASS
- tc-034 (import) - MUST PASS

---

## Cross-Cutting Evaluation Scenarios

### Scenario 1: Multi-Agent Collaboration
**Test Cases:** tc-001, tc-004, tc-018, tc-030

These cases require multiple agent types working together:
- TypeScript fix + Test repair (tc-004)
- TypeScript fix + Lint fix (tc-001)
- Bug fix + Test repair + TypeScript fix (tc-018)
- Security + TypeScript + Test (tc-030)

**Evaluation Focus:**
- Agent coordination and handoffs
- Avoiding conflicting changes
- Comprehensive problem solving

### Scenario 2: Incremental Fix Strategy
**Test Cases:** tc-025, tc-027, tc-010

Progressive error reduction:
- tc-025: 75→28 errors (systematic approach)
- tc-027: 23→19 errors (targeted fixes)
- tc-010: Mass cleanup (automated approach)

**Evaluation Focus:**
- Prioritization of fixes
- Avoiding regressions
- Measuring progress

### Scenario 3: Domain Knowledge Requirements
**Test Cases:** tc-015, tc-016, tc-017, tc-020

Require understanding of:
- NaN equality semantics (tc-015)
- Deterministic algorithms (tc-016, tc-020)
- Financial calculation edge cases (tc-017)

**Evaluation Focus:**
- Domain-specific knowledge application
- Edge case detection
- Algorithm correctness

### Scenario 4: Infrastructure Understanding
**Test Cases:** tc-005, tc-018, tc-033

Require deep infrastructure knowledge:
- Test infrastructure (tc-005)
- Circuit breakers and caching (tc-018)
- Framework consolidation (tc-033)

**Evaluation Focus:**
- Architectural understanding
- Infrastructure patterns
- System design decisions

---

## Recommended Evaluation Workflows

### Quick Smoke Test (15 minutes)
**Goal:** Verify agent basic functionality

**Test Cases:** tc-006, tc-022, tc-034
- All simple (1-2 complexity)
- Clear error messages
- Obvious solutions

**Pass Criteria:** 100% success rate (3/3)

---

### Standard Evaluation (1 hour)
**Goal:** Measure core competency

**Test Cases by Agent:**

**Test Repair Agent (3 cases):**
- tc-012 (timing issues) - MUST PASS
- tc-004 (multiple failures) - SHOULD PASS
- tc-031 (configuration) - NICE TO HAVE

**TypeScript Fix Agent (5 cases):**
- tc-006 (simple annotation) - MUST PASS
- tc-022 (index signature) - MUST PASS
- tc-001 (complex types) - SHOULD PASS
- tc-008 (React types) - SHOULD PASS
- tc-009 (schema) - NICE TO HAVE

**Lint Fix Agent (3 cases):**
- tc-022 (bracket notation) - MUST PASS
- tc-034 (import fix) - MUST PASS
- tc-007 (config) - NICE TO HAVE

**Pass Criteria:**
- MUST PASS: 100% (5/5)
- SHOULD PASS: 60%+ (3/5)
- Overall: 70%+ (8/11)

---

### Comprehensive Evaluation (4 hours)
**Goal:** Full capability assessment across all complexity levels

**Distribution:**
- 5 simple cases (1-3 complexity)
- 10 medium cases (4-6 complexity)
- 5 complex cases (7-9 complexity)
- 2 very complex cases (10 complexity)

**By Pattern:**
- 8 TypeScript errors
- 4 Test failures
- 3 Bug fixes
- 2 Build errors
- 1 Infrastructure
- 1 Security

**Pass Criteria:**
- Simple (1-3): 90%+ (4-5 of 5)
- Medium (4-6): 60%+ (6+ of 10)
- Complex (7-9): 40%+ (2+ of 5)
- Very Complex (10): 25%+ (1+ of 2)
- Overall: 60%+ (13+ of 22)

---

## Agent-Specific Recommendations

### For Test Repair Agent Development

**Priority cases to master:**
1. tc-012 - Async timing (most common pattern)
2. tc-004 - Multiple test types
3. tc-011 - Test infrastructure setup

**Common failure modes to address:**
- Using wrong vitest API (advanceTimersByTime vs async version)
- Not flushing microtasks (missing Promise.resolve())
- Incorrect test environment configuration
- Changing production code when test is the issue

**Training recommendations:**
- Study vitest documentation deeply
- Build library of test timing patterns
- Create synthetic timing variations
- Practice with different test frameworks

---

### For TypeScript Fix Agent Development

**Priority cases to master:**
1. tc-006 - Basic type annotations
2. tc-022 - Index signatures
3. tc-001 - Complex multi-faceted fixes
4. tc-008 - React patterns

**Common failure modes to address:**
- Over-using 'any' type
- Not understanding generic constraints
- Breaking type inference
- Not recognizing library-specific patterns

**Training recommendations:**
- Study TypeScript handbook sections on generics, index signatures, type inference
- Build pattern library for common errors
- Learn popular library type patterns (React, Drizzle, etc.)
- Practice incremental typing (avoid big bang rewrites)

---

### For Lint Fix Agent Development

**Priority cases to master:**
1. tc-022 - Simple rule violations
2. tc-034 - Import corrections
3. tc-007 - Configuration management

**Common failure modes to address:**
- Breaking functionality while fixing style
- Not understanding when to configure vs fix
- Over-aggressive unused code removal
- Not preserving intentional patterns

**Training recommendations:**
- Master ESLint rule catalog
- Understand safe vs unsafe auto-fixes
- Learn configuration hierarchy
- Practice detecting false positives

---

## Measuring Agent Improvements

### Baseline Establishment
1. Run evaluation on initial agent version
2. Record success rate by tier and pattern
3. Document failure modes and error types
4. Establish time-to-solution baseline

### Progress Tracking
Run same evaluation suite regularly:
- **Weekly:** Quick smoke test (3 cases)
- **Bi-weekly:** Standard evaluation (11 cases)
- **Monthly:** Comprehensive evaluation (22 cases)

### Metrics Dashboard
Track over time:
```
Agent Performance Metrics
========================
Quick Smoke Test:     [3/3] 100% ████████████
Standard Test:        [8/11] 73% ████████▓░░░
Comprehensive Test:   [14/22] 64% ███████▓░░░░

By Complexity:
  Simple (1-3):      [5/5] 100% ████████████
  Medium (4-6):      [7/10] 70% ████████▓░░░
  Complex (7-9):     [2/5] 40% ████▓░░░░░░░
  V.Complex (10):    [0/2] 0%  ░░░░░░░░░░░░

By Pattern:
  type-safety:       [4/5] 80% █████████▓░░
  test-reliability:  [3/4] 75% █████████░░░
  simple-typing:     [2/2] 100% ████████████
  async-timing:      [1/2] 50% ██████░░░░░░
```

### Improvement Prioritization
Focus on patterns with:
1. **High frequency + low success rate** (biggest impact)
2. **Must-pass cases failing** (critical gaps)
3. **Adjacent to current strengths** (incremental improvement)

---

## Appendix: Full Test Case Reference

### Quick Reference Table

| ID | Type | Severity | Complexity | Test Repair | TS Fix | Lint Fix | Best For |
|----|------|----------|------------|-------------|--------|----------|----------|
| tc-001 | TS Error | High | 8 | ✓ | ✓✓✓ | - | TS complex scenarios |
| tc-002 | TS Error | High | 7 | - | ✓✓✓ | ✓ | Multi-file coordination |
| tc-003 | TS Error | Med | 3 | - | ✓✓✓ | - | Type assertions |
| tc-004 | Test Fail | Critical | 9 | ✓✓✓ | ✓ | - | Test repair complex |
| tc-005 | Test Fail | Critical | 10 | ✓✓✓ | - | - | Infrastructure |
| tc-006 | TS Error | Low | 2 | - | ✓✓✓ | ✓ | Simple typing |
| tc-007 | Build Error | Critical | 6 | - | - | ✓✓✓ | ESLint config |
| tc-008 | TS Error | Med | 5 | - | ✓✓✓ | - | React types |
| tc-009 | TS Error | Med | 4 | - | ✓✓✓ | - | Schema patterns |
| tc-010 | TS Error | High | 8 | - | ✓✓ | ✓✓✓ | Mass cleanup |
| tc-011 | Test Fail | High | 9 | ✓✓✓ | - | - | Test stabilization |
| tc-012 | Test Fail | Med | 6 | ✓✓✓ | - | - | Async timing |
| tc-013 | Test Fail | Med | 1 | ✓ | - | - | Test skip (anti-pattern) |
| tc-014 | Bug Fix | Critical | 10 | - | - | - | Major refactor |
| tc-015 | Bug Fix | Critical | 8 | ✓✓ | ✓✓ | - | Edge cases |
| tc-016 | Bug Fix | Med | 7 | - | ✓✓ | - | Algorithm improvement |
| tc-017 | Bug Fix | Med | 7 | ✓✓ | ✓✓ | - | Calculation accuracy |
| tc-018 | Bug Fix | High | 9 | ✓✓ | ✓✓ | - | Infrastructure stability |
| tc-019 | Bug Fix | Low | 2 | - | - | - | Simple routing |
| tc-020 | Bug Fix | Med | 6 | ✓✓ | - | - | Determinism |
| tc-021 | TS Error | High | 8 | - | ✓✓✓ | - | AI consensus |
| tc-022 | TS Error | Low | 1 | - | ✓✓✓ | ✓✓✓ | Index signatures |
| tc-023 | TS Error | Med | 4 | - | ✓✓✓ | - | Library upgrades |
| tc-024 | TS Error | Med | 5 | - | ✓✓✓ | - | Library types |
| tc-025 | TS Error | High | 9 | - | ✓✓✓ | ✓ | Systematic reduction |
| tc-026 | TS Error | Med | 6 | - | ✓✓✓ | - | Generics/async |
| tc-027 | TS Error | Med | 5 | - | ✓✓✓ | - | Incremental fixes |
| tc-028 | Bug Fix | Med | 3 | - | ✓✓✓ | - | Schema types |
| tc-029 | Bug Fix | Low | 2 | - | - | - | UI alignment |
| tc-030 | Security | High | 9 | - | ✓✓ | - | Security hardening |
| tc-031 | Test Imp | Low | 4 | ✓✓✓ | - | - | Test config |
| tc-032 | TS Error | Med | 6 | - | ✓✓✓ | - | Service types |
| tc-033 | Infra | Critical | 10 | - | ✓✓ | ✓ | Consolidation |
| tc-034 | Bug Fix | Low | 1 | - | ✓ | ✓✓✓ | Import fixes |
| tc-035 | Build Error | Med | 2 | - | - | ✓✓✓ | YAML syntax |

**Legend:**
- ✓✓✓ = Highly applicable (90%+)
- ✓✓ = Moderately applicable (70-89%)
- ✓ = Somewhat applicable (50-69%)
- \- = Not applicable (<50%)
