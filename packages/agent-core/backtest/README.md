# Agent Backtesting Dataset

This directory contains real-world test cases extracted from git history for evaluating autonomous agent capabilities.

## Files

### 📊 backtest-dataset.json (824 lines)
The complete dataset of 35 test cases with detailed metadata:
- Commit hashes and timestamps
- Error messages and human solutions
- Complexity ratings and file changes
- Agent applicability scores
- Pattern classifications

### 📈 BACKTEST_SUMMARY.md (289 lines)
Statistical analysis and distribution:
- Test case distribution by type, severity, complexity
- Pattern analysis (top 10 patterns identified)
- Time to resolution analysis
- Recommended test cases by agent pattern
- Backtesting methodology recommendations
- Key insights on what makes cases difficult/easy

### 📋 AGENT_EVALUATION_GUIDE.md (441 lines)
Detailed evaluation framework:
- Agent pattern evaluation matrix (Test Repair, TypeScript Fix, Lint Fix)
- Recommended test cases ranked by suitability (Tier 1/2/3)
- Evaluation criteria and success metrics
- Cross-cutting evaluation scenarios
- Recommended evaluation workflows (Quick/Standard/Comprehensive)
- Agent-specific development recommendations
- Full test case reference table

## Quick Start

### 1. Quick Smoke Test (15 min)
Test basic agent functionality:
```bash
# Run agents on simple cases: tc-006, tc-022, tc-034
# Expected: 100% success rate (3/3)
```

### 2. Standard Evaluation (1 hour)
Measure core competency:
```bash
# Test Repair Agent: tc-012, tc-004, tc-031
# TypeScript Fix Agent: tc-006, tc-022, tc-001, tc-008, tc-009
# Lint Fix Agent: tc-022, tc-034, tc-007
# Expected: 70%+ overall (8/11)
```

### 3. Comprehensive Evaluation (4 hours)
Full capability assessment across all 35 test cases:
```bash
# Expected: 60%+ overall (13+/22)
# Simple (1-3): 90%+
# Medium (4-6): 60%+
# Complex (7-9): 40%+
# Very Complex (10): 25%+
```

## Dataset Statistics

- **Total Cases:** 35
- **Timeframe:** July 2024 - October 2025
- **Total Commits Analyzed:** 277
- **Repository:** nikhillinit/Updog_restore

### Distribution
- **TypeScript Errors:** 18 (51.4%)
- **Bug Fixes:** 8 (22.9%)
- **Test Failures:** 5 (14.3%)
- **Build Errors:** 2 (5.7%)
- **Other:** 2 (5.7%)

### Complexity Levels
- **Simple (1-3):** 10 cases
- **Medium (4-6):** 13 cases
- **Complex (7-9):** 10 cases
- **Very Complex (10):** 2 cases

## Top Patterns for Agent Training

1. **type-safety** (5 cases) - TypeScript type safety improvements
2. **test-reliability** (4 cases) - Test flakiness and timing
3. **ai-assisted** (3 cases) - AI-assisted fixes
4. **library-types** (3 cases) - Third-party library types
5. **edge-case-handling** (2 cases) - NaN, boundaries

## Recommended Use Cases

### For Agent Developers
- Start with Phase 1 cases to validate basic functionality
- Use Phase 2 cases to identify capability gaps
- Track metrics on all 35 cases for comprehensive evaluation

### For Benchmarking
- Run agents on randomized subset (10-15 cases) from different complexity levels
- Measure against human baseline (time, solution quality)
- Compare multiple agents on same test set

### For Training
- Use failed cases to improve agent prompts/tools
- Extract successful patterns from high-success-rate cases
- Build synthetic variations of difficult cases

## Key Insights

### Where AI Excels
- Mass cleanup operations (tc-010: 147 files)
- Pattern recognition across files
- Consistent rule application
- Systematic error reduction (tc-025: 75→28 errors)

### Where Humans Excel
- Complex refactoring requiring judgment (tc-014: 1762 lines)
- Infrastructure design decisions
- Edge case detection from experience
- Security implications

## Next Steps

1. **Validate Dataset**: Run initial backtesting with current agents
2. **Expand Coverage**: Add more test cases for underrepresented patterns
3. **Create Synthetic Cases**: Generate variations for training
4. **Build Evaluation Framework**: Automate scoring and comparison
5. **Establish Baselines**: Record human performance metrics

## Usage Example

```typescript
import dataset from './backtest-dataset.json';

// Get all TypeScript error cases
const tsErrors = dataset.testCases.filter(tc => tc.type === 'typescript-error');

// Get simple cases for quick testing
const simpleCases = dataset.testCases.filter(tc => tc.complexity <= 3);

// Get cases applicable to Test Repair Agent
const testRepairCases = dataset.testCases.filter(
  tc => tc.agentApplicability.testRepair
);

// Get high-priority must-pass cases
const mustPassCases = [
  'tc-006', // Simple type annotations
  'tc-012', // Async timing
  'tc-022', // Index signatures
  'tc-034', // Import fixes
].map(id => dataset.testCases.find(tc => tc.id === id));
```

## Contributing

To add new test cases:
1. Extract commit information using `git show <hash>`
2. Analyze git diff for error messages and solutions
3. Rate complexity (1-10) and agent applicability
4. Add to backtest-dataset.json following existing format
5. Update BACKTEST_SUMMARY.md statistics
6. Update AGENT_EVALUATION_GUIDE.md if new patterns emerge

## Version History

- **v1.0.0** (2025-10-03) - Initial dataset with 35 test cases from 3-6 month git history

---

**Generated:** 2025-10-03
**Maintained by:** Agent Core Team
**Contact:** See main repository README
