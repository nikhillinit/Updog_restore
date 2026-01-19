---
status: ACTIVE
last_updated: 2026-01-19
---

# CI Validator Guide

**Purpose**: Quick reference for using and extending CI quality gate validators
**Audience**: Developers, Agents
**Last Updated**: 2025-12-16

---

## Validator-Diagnoser Architecture

```
CI Pipeline
    |
    v
+-------------------+     +------------------------+
| Validator Scripts | --> | Specialized Diagnosers |
| (deterministic)   |     | (explain & recommend)  |
+-------------------+     +------------------------+
    |                         |
    +-- Exit code 0: PASS     +-- Root cause analysis
    +-- Exit code 1: FAIL     +-- Fix recommendations
    +-- Structured output     +-- PR guidance
```

**Key Principle**: Validators detect, diagnosers explain.

---

## Available Validators

### 1. baseline-check.sh

**Purpose**: Quality metric validation with ratcheting

**Metrics Tracked**:
- Test pass count (must not decrease)
- TypeScript errors (must not increase)
- ESLint violations (must not increase)
- Bundle size in KB (must not increase beyond threshold)

**Usage**:
```bash
# Validate against current baselines
./scripts/baseline-check.sh

# Update baselines (after approval)
./scripts/baseline-check.sh --update
```

**Exit Codes**:
- `0`: All metrics within acceptable bounds
- `1`: Regression detected

**Diagnoser**: `baseline-regression-explainer` agent

---

### 2. validate-schema-drift.sh

**Purpose**: Schema alignment across layers

**Layers Checked**:
```
Migration SQL --> Drizzle Schema --> Zod Schema --> Mock Data
```

**Drift Types**:
- Missing column in downstream layer
- Type mismatch between layers
- Orphaned mock data fields

**Usage**:
```bash
./scripts/validate-schema-drift.sh
```

**Exit Codes**:
- `0`: All layers aligned
- `1`: Drift detected

**Diagnoser**: `schema-drift-checker` agent

---

### 3. bench-check.sh

**Purpose**: Performance benchmark validation

**Benchmarks**:
- XIRR calculation (various sizes)
- Waterfall distribution
- Monte Carlo iterations
- Critical path operations

**Usage**:
```bash
# Run benchmarks
./scripts/bench-check.sh

# Verbose output
./scripts/bench-check.sh --verbose
```

**Exit Codes**:
- `0`: No regression detected
- `1`: Performance regression beyond threshold

**Diagnoser**: `perf-regression-triager` agent

---

### 4. validate-claude-infra.ts

**Purpose**: .claude/ directory consistency

**Checks**:
- Agent files have required frontmatter
- Skill references exist
- Documentation links resolve
- Naming conventions followed

**Usage**:
```bash
npx tsx scripts/validate-claude-infra.ts
```

**Exit Codes**:
- `0`: All checks pass
- `1`: Consistency issues found

---

## Adding New Validators

### Step 1: Create the Script

```bash
#!/usr/bin/env bash
set -euo pipefail

# Standard header
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Your validation logic
echo "Running validation..."

# Emit structured failure block for agent handoff
if [[ $FAILED -eq 1 ]]; then
    cat << EOF
--- VALIDATION FAILURE ---
validator: your-validator-name
timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
metrics:
  expected: $EXPECTED
  actual: $ACTUAL
  delta: $DELTA
--- END FAILURE ---
EOF
    exit 1
fi

exit 0
```

### Step 2: Create Diagnoser Agent

Create `.claude/agents/your-diagnoser.md`:

```markdown
---
name: your-diagnoser
description: Diagnose [specific issue type]
model: sonnet
tools: Read, Grep, Glob, Bash
---

# Your Diagnoser

## When Invoked
- your-validator.sh exits with code 1

## Diagnostic Protocol
1. Parse failure block
2. Identify root cause
3. Recommend fix

## Output Format
[Structured report template]
```

### Step 3: Add Delegation

Update `code-reviewer.md` delegation matrix:

```markdown
| your-validator.sh | your-diagnoser | Diagnose [issue type] |
```

---

## Structured Failure Blocks

All validators should emit structured failure blocks for agent parsing:

```
--- VALIDATION FAILURE ---
validator: <validator-name>
timestamp: <ISO-8601>
metrics:
  <key>: <value>
  ...
files_affected:
  - <path>
  - <path>
--- END FAILURE ---
```

This format enables:
- Automated agent handoff
- Consistent error reporting
- Machine-parseable diagnostics

---

## Best Practices

1. **Deterministic**: Same input always produces same output
2. **Fast**: Complete within 60 seconds for CI
3. **Verbose**: Support --verbose flag for debugging
4. **Structured**: Emit parseable failure blocks
5. **Exit codes**: 0 = pass, 1 = fail (never ambiguous)

---

## Related Documentation

- [CLAUDE-INFRA-V4-INTEGRATION-PLAN.md](../docs/CLAUDE-INFRA-V4-INTEGRATION-PLAN.md)
- [baseline-governance.md](baseline-governance.md)
- [schema-alignment.md](schema-alignment.md)
- [test-pyramid.md](test-pyramid.md)
