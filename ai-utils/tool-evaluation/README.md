# Tool Evaluation Framework for VC Fund Modeling Platform

This framework provides systematic testing of domain-specific calculations and
tools used in the VC fund modeling platform, adapted from the general AI tool
evaluation notebook approach.

## Overview

The evaluation framework tests accuracy and performance of:

- **Waterfall calculations** - Carry distribution for different fund structures
- **Reserve allocations** - Portfolio reserve management strategies
- **Pacing analysis** - Investment deployment tracking
- **Monte Carlo simulations** - Probabilistic outcome modeling
- **Cohort analytics** - Vintage year and sector performance

## Quick Start

```bash
# Run all evaluations
npm run evaluate:all

# Run specific category
npm run evaluate:waterfall
npm run evaluate:reserves
npm run evaluate:pacing

# Generate detailed report
npm run evaluate:report

# Watch mode for development
npm run evaluate:watch
```

## Architecture

The framework consists of:

1. **`waterfall-evaluator.ts`** - Core evaluation engine with tool
   implementations
2. **`run-evaluation.ts`** - CLI runner with reporting capabilities
3. **`evaluations/*.xml`** - Test cases in XML format
4. **`waterfall-evaluator.test.ts`** - Vitest integration for CI/CD

## How It Works

1. **Parse XML test cases** - Load evaluation tasks with prompts and expected
   responses
2. **Execute tools** - Process prompts through domain-specific calculation tools
3. **Compare results** - Match actual vs expected with optional numerical
   tolerance
4. **Generate reports** - Markdown reports with accuracy metrics and performance
   data

## Test Case Format

```xml
<task id="waterfall-1">
  <description>Calculate carry for $100M fund</description>
  <category>waterfall</category>
  <prompt>Calculate the carry distribution for a $100 million fund with 20% carry, 8% hurdle</prompt>
  <response>{"carried":20000000,"hurdleAmount":8000000}</response>
  <tolerance>1000</tolerance> <!-- Optional for numerical comparisons -->
</task>
```

## Available Tools

### calculateWaterfall

Calculates carry distribution based on fund parameters:

- Fund size
- Carry percentage
- Hurdle rate
- Waterfall type (AMERICAN only, EUROPEAN removed)
- Catch-up provisions
- Vesting schedule

### calculateReserves

Computes reserve allocations:

- Available reserves
- Per-company allocation
- Reserve ratio analysis
- Target vs actual comparison

### calculatePacing

Analyzes investment deployment:

- Target vs actual pace
- On-track assessment
- Remaining deployment capacity
- Annual pace calculations

## Integration with Existing Tests

The framework integrates with Vitest:

```bash
# Run as part of test suite
npm test -- ai-utils/tool-evaluation/waterfall-evaluator.test.ts

# With coverage
npm run test:coverage -- ai-utils/tool-evaluation
```

## Creating Custom Evaluations

1. **Create new evaluation file**:

```bash
npx tsx ai-utils/tool-evaluation/run-evaluation.ts create my-feature --category=custom
```

2. **Add test cases** to `evaluations/my-feature-tests.xml`

3. **Run evaluation**:

```bash
npm run evaluate:tools my-feature
```

## Performance Benchmarks

Current benchmarks (as of framework creation):

- Waterfall calculations: ~63% accuracy (needs improvement)
- Reserve calculations: Implementation pending
- Pacing analysis: Implementation pending
- Monte Carlo: Implementation pending

## Slash Command Usage

Use the `/evaluate-tools` slash command in Claude Code:

```bash
/evaluate-tools          # Run full evaluation
/evaluate-tools waterfall # Test specific category
/evaluate-tools --report  # Generate detailed report
```

## Future Improvements

1. **Increase accuracy** - Improve prompt parsing and tool execution
2. **Add more tools** - IRR/XIRR calculations, cohort analysis
3. **Performance testing** - Add latency and throughput metrics
4. **Visual reporting** - Charts and graphs for results
5. **Regression detection** - Compare results across versions

## Comparison with Original Notebook

This framework adapts the Jupyter notebook evaluation approach for
TypeScript/Node.js:

| Original Notebook       | Our Implementation          |
| ----------------------- | --------------------------- |
| Python + Anthropic SDK  | TypeScript + Domain Tools   |
| Calculator tool example | Waterfall, reserves, pacing |
| XML task format         | Same XML format             |
| Accuracy metrics        | Same metrics + categories   |
| Markdown reports        | Enhanced reports            |

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Project architecture
- [Waterfall Documentation](../../docs/notebooklm-sources/waterfall.md)
- [Testing Cheatsheet](../../cheatsheets/testing.md)

## Contributing

When adding new evaluation categories:

1. Add tool implementation in `waterfall-evaluator.ts`
2. Create XML test cases in `evaluations/`
3. Update this README with examples
4. Add npm script to `package.json`
5. Test with both CLI and Vitest integration
