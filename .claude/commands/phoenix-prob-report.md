---
description: "Format Monte Carlo artifact into PR-ready distribution summary table"
argument-hint: "path=<artifact.json|artifact.csv> [metric=TVPI|DPI|MOIC|IRR|all]"
allowed-tools: Read, Grep, Glob
---

# Phoenix Probabilistic Report Formatter

Read a Monte Carlo output artifact and produce a PR-ready distribution table.

## Usage

```
/phoenix-prob-report path=results/monte-carlo-output.json
/phoenix-prob-report path=results/mc-run.csv metric=TVPI
```

## Expected Artifact Formats

### JSON (preferred)

```json
{
  "metadata": {
    "seed": 42,
    "iterations": 2000,
    "scenario": "base",
    "timestamp": "2025-12-12T10:00:00Z"
  },
  "summary": {
    "TVPI": { "mean": 1.85, "p10": 1.42, "p50": 1.82, "p90": 2.31 },
    "DPI": { "mean": 1.65, "p10": 1.22, "p50": 1.62, "p90": 2.11 },
    "MOIC": { "mean": 2.10, "p10": 1.55, "p50": 2.05, "p90": 2.72 },
    "IRR": { "mean": 0.18, "p10": 0.09, "p50": 0.17, "p90": 0.28 }
  },
  "raw": [...]  // optional: per-iteration results
}
```

### CSV

```csv
iteration,TVPI,DPI,MOIC,IRR
1,1.82,1.65,2.05,0.17
2,1.91,1.72,2.15,0.19
...
```

If CSV format, compute summary statistics from raw data.

## Output Format

```markdown
## Monte Carlo Distribution Summary

**Artifact**: {path}
**Scenario**: {scenario or "unknown"}
**Seed**: {seed or "not recorded"}
**Iterations**: {count}

### Distribution Table

| Metric | Mean   | P10    | P50    | P90    | Min    | Max    |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| TVPI   | 1.85   | 1.42   | 1.82   | 2.31   | 0.92   | 3.45   |
| DPI    | 1.65   | 1.22   | 1.62   | 2.11   | 0.75   | 3.12   |
| MOIC   | 2.10   | 1.55   | 2.05   | 2.72   | 1.02   | 4.01   |
| IRR    | 18.0%  | 9.0%   | 17.0%  | 28.0%  | -5.0%  | 52.0%  |

### Sanity Checks

- [x] P10 <= P50 <= P90 (monotonic)
- [x] No impossible negatives for TVPI/DPI/MOIC
- [x] IRR within reasonable bounds (-100% to 200%)

### Copy-Paste for PR

(triple backtick markdown table ready for GitHub comment)
```

## Error Handling

- If artifact not found: "Artifact not found at {path}. Run `/phoenix-phase2` first."
- If missing metadata: Report what's available, note missing fields
- If malformed data: "Unable to parse artifact. Expected JSON or CSV format."

## Notes

- IRR is displayed as percentage (multiply by 100)
- Min/Max included if raw data available
- If only summary stats in artifact, Min/Max marked as "N/A"
