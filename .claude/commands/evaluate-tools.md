---
description:
  Run AI tool evaluation framework to test calculation accuracy and performance
---

# Tool Evaluation Framework

Run comprehensive evaluation of domain-specific tools and calculations for the
VC Fund Modeling Platform, including waterfall, reserves, pacing, and Monte
Carlo simulations.

## Workflow

1. **Quick Evaluation**

   ```bash
   # Run all evaluations with summary
   npm run evaluate:all

   # Run specific category
   npm run evaluate:waterfall
   npm run evaluate:reserves
   npm run evaluate:pacing
   ```

2. **Detailed Analysis**

   ```bash
   # Generate markdown report
   npm run evaluate:report

   # Watch mode for development
   npm run evaluate:watch

   # Run with verbose output
   npx tsx ai-utils/tool-evaluation/run-evaluation.ts all --verbose
   ```

3. **Integration Testing**

   ```bash
   # Run as part of test suite
   npm test -- ai-utils/tool-evaluation/waterfall-evaluator.test.ts

   # Run with coverage
   npm run test:coverage -- ai-utils/tool-evaluation
   ```

## Evaluation Categories

### Waterfall Calculations

Tests carry distribution calculations for different waterfall types:

- **AMERICAN**: Deal-by-deal carry calculation
- **EUROPEAN**: Fund-level carry calculation
- **Multi-hurdle**: Tiered carry structures
- **Vesting**: Time-based carry vesting

### Reserve Allocations

Tests reserve calculation strategies:

- Reserve ratio calculations
- Per-company allocation
- Target vs actual ratios
- Capital deployment tracking

### Pacing Analysis

Tests investment pacing metrics:

- Deployment period tracking
- Pace ratio calculations
- On-track assessments
- Remaining deployment projections

### Monte Carlo Simulations

Tests probabilistic modeling:

- Expected return distributions
- Portfolio outcome scenarios
- Risk assessment metrics
- Percentile calculations (P10, P50, P90)

## Command Options

```bash
npx tsx ai-utils/tool-evaluation/run-evaluation.ts [category] [options]

Arguments:
  category              Category to test (waterfall, reserves, pacing, all) [default: "all"]

Options:
  -o, --output <path>   Output path for results JSON
  -r, --report <path>   Generate markdown report
  -w, --watch           Watch mode for continuous testing
  -v, --verbose         Verbose output with detailed results
  --threshold <percent> Minimum accuracy threshold to pass [default: "80"]
```

## Creating New Evaluations

1. **Create evaluation file**:

   ```bash
   npx tsx ai-utils/tool-evaluation/run-evaluation.ts create my-feature --category=custom
   ```

2. **Edit the XML file** at
   `ai-utils/tool-evaluation/evaluations/my-feature-tests.xml`:

   ```xml
   <task id="my-test-1">
     <description>Test description</description>
     <category>custom</category>
     <prompt>Natural language prompt for the tool</prompt>
     <response>Expected JSON response</response>
     <tolerance>0.01</tolerance> <!-- Optional numerical tolerance -->
   </task>
   ```

3. **Run your evaluation**:
   ```bash
   npm run evaluate:tools my-feature
   ```

## Comparing Results

Compare evaluation runs to track improvements:

```bash
# Save baseline
npm run evaluate:all -- --output baseline.json

# Make improvements to tools
# ...

# Run again and compare
npm run evaluate:all -- --output improved.json
npx tsx ai-utils/tool-evaluation/run-evaluation.ts compare baseline.json improved.json
```

## Integration with CI/CD

Add to GitHub Actions workflow:

```yaml
- name: Run Tool Evaluation
  run: |
    npm run evaluate:all -- --threshold 85
    npm run evaluate:report

- name: Upload Evaluation Report
  uses: actions/upload-artifact@v3
  with:
    name: evaluation-report
    path: evaluation-report.md
```

## Debugging Failed Evaluations

1. **Run specific test with verbose output**:

   ```bash
   npx tsx ai-utils/tool-evaluation/run-evaluation.ts waterfall --verbose
   ```

2. **Check tool execution traces**:
   - Review `toolCalls` in the output JSON
   - Check input parameters vs expected
   - Verify tolerance settings for numerical comparisons

3. **Update test cases**:
   - Edit XML files in `ai-utils/tool-evaluation/evaluations/`
   - Adjust tolerance for floating-point comparisons
   - Add edge cases and validation tests

## Performance Metrics

The framework tracks:

- **Accuracy**: Percentage of passed tests
- **Duration**: Average execution time per task
- **Tool calls**: Number and type of tools invoked
- **Category breakdown**: Performance by calculation type

## Best Practices

1. **Maintain high accuracy threshold** (>80% minimum)
2. **Add tests for edge cases** and error conditions
3. **Use tolerance for numerical comparisons** to handle floating-point
   precision
4. **Run evaluations before major releases** to catch regressions
5. **Document expected responses clearly** in XML files

## Examples

### Quick waterfall check:

```bash
npm run evaluate:waterfall
```

### Full evaluation with report:

```bash
npm run evaluate:all -- --report docs/evaluation-$(date +%Y%m%d).md
```

### Development iteration:

```bash
npm run evaluate:watch
```

### CI/CD integration test:

```bash
npm run evaluate:all -- --threshold 90 || exit 1
```
