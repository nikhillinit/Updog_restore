# Documentation Validation Cheatsheet

## Purpose

Guide for validating Phase 1 documentation using Promptfoo + LLM-as-Judge
evaluation framework adapted from Anthropic's cookbook.

## Quick Reference

**When to Validate:**

- Completing any Phase 1 module documentation
- Before marking documentation tasks complete
- After major updates to existing docs
- During code review of documentation PRs

**Target Scores:**

- **Minimum:** 92% (Phase 1 requirement)
- **Gold Standard:** 96%+ (Phase 1A XIRR achieved 96.3%)

## Phase 1 Rubric (4 Dimensions)

### 1. Entity Truthfulness (30% weight)

- ✅ AST-verified function signatures
- ✅ Accurate TypeScript interfaces
- ✅ Correct file paths and line numbers (file:line format)
- ✅ No hallucinated entities

**Example Check:**

```bash
# Verify function exists in source
grep "export function calculateManagementFees" client/src/lib/fee-calculations.ts
```

### 2. Mathematical Accuracy (25% weight)

- ✅ Formulas match Excel standards
- ✅ Edge cases handled correctly (zero values, boundaries)
- ✅ Precision documented (Decimal.js usage)
- ✅ Calculation examples verified against truth cases

**Example Check:**

```bash
# Verify formula in documentation matches implementation
grep -A 5 "formula" docs/notebooklm-sources/fees.md
```

### 3. Schema Compliance (25% weight)

- ✅ Truth cases validate against JSON Schema
- ✅ All required fields documented
- ✅ Examples cover all categories
- ✅ Input/output structures consistent

**Example Check:**

```bash
# Validate truth cases against schema
ajv validate -s docs/schemas/fee-truth-case.schema.json -d docs/fees.truth-cases.json
```

### 4. Integration Clarity (20% weight)

- ✅ Cross-module references accurate
- ✅ Waterfall integration documented
- ✅ Fund calculator integration clear
- ✅ Coherent integration narrative

**Example Check:**

```bash
# Verify referenced functions exist
grep -E "applyWaterfallChange|changeWaterfallType" client/src/lib/waterfall.ts
```

---

## Usage Workflows

### Workflow 1: Full Validation with Promptfoo

```bash
# Navigate to validation directory
cd scripts/validation

# Run Promptfoo evaluation
npx promptfoo eval -c fee-validation.yaml

# View interactive results in browser
npx promptfoo view

# Export results to JSON (optional)
npx promptfoo eval -c fee-validation.yaml \
  --output results/fees-$(date +%Y%m%d).json
```

**Expected Output:**

```
✓ Test 1: Validate fees.md against Phase 1 rubric
  Domain Score: 96.1%
  - Entity Truthfulness: 5/5 (30.0 points)
  - Mathematical Accuracy: 5/5 (25.0 points)
  - Schema Compliance: 4/5 (20.0 points)
  - Integration Clarity: 5/5 (20.0 points)
  PASS (96.1% >= 92% threshold)
```

### Workflow 2: Python CLI Validation

```bash
# Direct Python script execution
python scripts/validation/custom_evals/fee_doc_domain_scorer.py \
  docs/notebooklm-sources/fees.md \
  docs/fees.truth-cases.json \
  docs/schemas/fee-truth-case.schema.json
```

**Output Includes:**

- Overall domain score (0-100)
- Dimension-by-dimension breakdown
- Weighted contributions
- Strengths and weaknesses
- Pass/fail against 92% threshold

### Workflow 3: Validate Truth Cases Only

```bash
# Step 1: Validate JSON syntax
jq empty docs/fees.truth-cases.json

# Step 2: Validate against schema
npm install -g ajv-cli  # If not installed
ajv validate \
  -s docs/schemas/fee-truth-case.schema.json \
  -d docs/fees.truth-cases.json

# Step 3: Count total cases
jq 'length' docs/fees.truth-cases.json

# Step 4: Check for duplicate IDs
jq '[.[].id] | group_by(.) | map(select(length > 1))' \
  docs/fees.truth-cases.json

# Step 5: Verify ID pattern (e.g., FEE-001)
jq -r '.[].id' docs/fees.truth-cases.json | grep -v "FEE-[0-9]\{3\}" || echo "All IDs valid"
```

### Workflow 4: Iterative Improvement Loop

When domain score < 92%:

```bash
# 1. Run initial validation
npx promptfoo eval -c fee-validation.yaml

# 2. Identify weak dimension (example output):
#    Entity Truthfulness: 3/5 (18.0/30.0 points) ← LOW
#    Mathematical Accuracy: 5/5 (25.0/25.0 points)
#    Schema Compliance: 4/5 (20.0/25.0 points)
#    Integration Clarity: 5/5 (20.0/20.0 points)
#    Domain Score: 83.0% < 92% threshold

# 3. Fix weak dimension (Entity Truthfulness in this example)
#    - Verify function signatures against source code
#    - Update TypeScript interfaces
#    - Fix file:line references

# 4. Re-run validation
npx promptfoo eval -c fee-validation.yaml

# 5. Repeat until score >= 92%
```

---

## Creating Validation for New Modules

Use this process for Phase 1C (Exit Recycling), Phase 1D (Capital Allocation),
etc.

### Step 1: Copy Template

```bash
cp scripts/validation/fee-validation.yaml \
   scripts/validation/exit-recycling-validation.yaml
```

### Step 2: Update Configuration

Edit `exit-recycling-validation.yaml`:

```yaml
description: 'Phase 1C Exit Recycling Documentation Validation'

tests:
  - description: 'Validate exit-recycling.md'
    vars:
      truth_cases: file://docs/exit-recycling.truth-cases.json
      schema: file://docs/schemas/exit-recycling-truth-case.schema.json
      doc_type: 'primary_documentation'
    assert:
      # Reuse the same evaluator!
      - type: python
        value: file://custom_evals/fee_doc_domain_scorer.py
        threshold: 0.92

      # Update module-specific content checks
      - type: icontains-all
        value:
          - 'recycling capacity'
          - 'exit proceeds'
          - 'cap enforcement'
          - 'recycling schedule'
          - 'eligibility criteria'
```

### Step 3: Run Validation

```bash
cd scripts/validation
npx promptfoo eval -c exit-recycling-validation.yaml
npx promptfoo view
```

### Step 4: Document Results

Update module completion report:

```markdown
## Validation Results

- **Domain Score:** 96.5%
- **Entity Truthfulness:** 5/5 (30.0 points)
- **Mathematical Accuracy:** 5/5 (25.0 points)
- **Schema Compliance:** 5/5 (25.0 points)
- **Integration Clarity:** 4/5 (16.5 points)
- **Threshold:** ✅ Passes 92% minimum
- **Gold Standard:** ✅ Exceeds 96% gold standard
```

---

## Integration with Development Workflow

### Pre-Commit Hook

Add to `.husky/pre-commit`:

```bash
#!/bin/sh

# Validate documentation on commit
if git diff --cached --name-only | grep -q "docs/notebooklm-sources/"; then
  echo "🔍 Validating documentation changes..."

  cd scripts/validation
  npx promptfoo eval -c fee-validation.yaml --output results/pre-commit.json

  # Extract domain score
  score=$(jq -r '.tests[0].assert[0].metadata.domain_score' results/pre-commit.json)

  if (( $(echo "$score < 92" | bc -l) )); then
    echo "❌ Documentation validation failed: ${score}% < 92%"
    echo "   Run 'cd scripts/validation && npx promptfoo view' for details"
    exit 1
  fi

  echo "✅ Documentation validation passed: ${score}%"
fi
```

### CI/CD Integration

Create `.github/workflows/doc-quality.yml`:

```yaml
name: Documentation Quality Gate

on:
  pull_request:
    paths:
      - 'docs/notebooklm-sources/**'
      - 'docs/adr/**'
      - 'docs/*.truth-cases.json'
      - 'docs/schemas/**'

jobs:
  validate-documentation:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install Promptfoo
        run: npm install -g promptfoo

      - name: Install Python dependencies
        run: pip install anthropic nltk rouge-score

      - name: Run validation
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          cd scripts/validation
          npx promptfoo eval -c fee-validation.yaml --output results/ci.json

      - name: Check domain score threshold
        run: |
          score=$(jq -r '.tests[0].assert[0].metadata.domain_score' \
                  scripts/validation/results/ci.json)
          echo "📊 Domain Score: ${score}%"

          if (( $(echo "$score < 92" | bc -l) )); then
            echo "::error::Domain score ${score}% below 92% threshold"
            exit 1
          fi

          echo "::notice::✅ Documentation quality validated: ${score}%"

      - name: Upload validation results
        uses: actions/upload-artifact@v3
        with:
          name: validation-results
          path: scripts/validation/results/ci.json
```

### NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "validate:docs": "cd scripts/validation && npx promptfoo eval -c fee-validation.yaml",
    "validate:docs:view": "cd scripts/validation && npx promptfoo view",
    "validate:module": "cd scripts/validation && npx promptfoo eval -c $MODULE-validation.yaml"
  }
}
```

Usage:

```bash
npm run validate:docs
npm run validate:docs:view
MODULE=exit-recycling npm run validate:module
```

---

## Troubleshooting

### Issue: Python module not found

**Solution:**

```bash
# Install required Python packages
pip install anthropic nltk rouge-score

# Verify installation
python -c "import anthropic; print('OK')"
```

### Issue: ANTHROPIC_API_KEY not set

**Solution:**

```bash
# Set environment variable (Linux/Mac)
export ANTHROPIC_API_KEY="your-api-key-here"

# Windows PowerShell
$env:ANTHROPIC_API_KEY="your-api-key-here"

# Verify
echo $ANTHROPIC_API_KEY
```

### Issue: Promptfoo not found

**Solution:**

```bash
# Install globally
npm install -g promptfoo

# Verify installation
promptfoo --version

# Alternative: use npx (no install needed)
npx promptfoo@latest eval -c fee-validation.yaml
```

### Issue: Low Entity Truthfulness Score (< 4/5)

**Root Cause:** Function signatures or file paths don't match source code

**Fix:**

```bash
# Step 1: Extract actual function signatures
grep -E "^export (function|const)" client/src/lib/fee-calculations.ts > /tmp/actual.txt

# Step 2: Extract documented signatures
grep -E "function|const" docs/notebooklm-sources/fees.md > /tmp/documented.txt

# Step 3: Compare
diff /tmp/actual.txt /tmp/documented.txt

# Step 4: Update documentation to match source
# Re-run validation
```

### Issue: Low Mathematical Accuracy Score (< 4/5)

**Root Cause:** Formulas don't match Excel standards or implementation

**Fix:**

```bash
# Verify Decimal.js usage for precision
grep "Decimal" client/src/lib/fee-calculations.ts

# Check rounding behavior
grep "round" client/src/lib/fee-calculations.ts

# Test against truth cases
node -e "const calc = require('./client/src/lib/fee-calculations'); \
         console.log(calc.calculateManagementFees({fundSize: 100, rate: 0.02, term: 10}))"

# Compare with expected output in truth cases
jq '.[] | select(.id == "FEE-001") | .expectedOutput' docs/fees.truth-cases.json
```

### Issue: Low Schema Compliance Score (< 4/5)

**Root Cause:** Truth cases don't validate against schema

**Fix:**

```bash
# Run schema validation to see specific errors
ajv validate \
  -s docs/schemas/fee-truth-case.schema.json \
  -d docs/fees.truth-cases.json

# Common violations:
# - Missing required fields (add them)
# - Wrong data types (fix types)
# - Invalid enum values (use valid enums)
# - Pattern mismatches (fix ID format to FEE-001, etc.)

# Example fix for missing field:
jq '.[0] += {"tolerance": 0.01}' docs/fees.truth-cases.json > /tmp/fixed.json
mv /tmp/fixed.json docs/fees.truth-cases.json
```

### Issue: Low Integration Clarity Score (< 4/5)

**Root Cause:** Cross-references to other modules are broken or unclear

**Fix:**

```bash
# Check if referenced files exist
grep -o "client/src/[^ ]*\.ts" docs/notebooklm-sources/fees.md | \
  while read file; do
    [ -f "$file" ] && echo "✓ $file" || echo "✗ $file (MISSING)"
  done

# Verify function references exist
grep -E "applyWaterfallChange|changeWaterfallType" docs/notebooklm-sources/fees.md
grep -E "applyWaterfallChange|changeWaterfallType" client/src/lib/waterfall.ts

# Fix broken references in documentation
# Re-run validation
```

---

## Cost Estimation

### Per Validation Run

- **Input tokens:** ~5,000-10,000 (documentation + context)
- **Output tokens:** ~1,000-2,000 (evaluation JSON)
- **Model:** Claude 3.5 Sonnet
- **Cost:** ~$0.15-0.30 per run

### Monthly Estimates

| Usage Pattern                  | Runs/Month | Est. Cost  |
| ------------------------------ | ---------- | ---------- |
| Phase 1 completion (5 modules) | ~50        | $10-15     |
| Ongoing maintenance            | ~20        | $5-10      |
| CI/CD (every PR)               | ~40        | $10-15     |
| **Total**                      | **~110**   | **$25-40** |

### Optimization Tips

1. **Use caching:** Promptfoo caches identical requests
2. **Validate incrementally:** Run validation after each section, not just at
   the end
3. **Use Haiku for quick checks:** Switch to `claude-haiku-4-5` for draft
   validation (10x cheaper)
4. **Batch updates:** Group related changes before running validation

---

## Best Practices

### 1. Validate Early and Often

❌ **Don't:** Wait until documentation is "complete" to validate ✅ **Do:**
Validate after each major section (e.g., "Core Concepts", "API Reference")

**Benefit:** Early feedback prevents large rewrites

### 2. Aim for Gold Standard (96%+)

❌ **Don't:** Target 92% as "good enough" ✅ **Do:** Aim for 96%+ to match Phase
1A baseline

**Benefit:** Higher quality documentation, future-proof against threshold
increases

### 3. Document Validation Results

❌ **Don't:** Run validation and forget the results ✅ **Do:** Include domain
score in completion reports

```markdown
## Phase 1B Validation Results

- **Domain Score:** 96.1%
- **Validated:** 2025-01-28
- **Evaluator:** fee_doc_domain_scorer.py
- **Configuration:** scripts/validation/fee-validation.yaml
```

### 4. Store Validation Artifacts

```bash
# Create timestamped results directory
mkdir -p scripts/validation/results/2025-01-28-phase1b

# Save validation output
npx promptfoo eval -c fee-validation.yaml \
  --output results/2025-01-28-phase1b/fees.json

# Commit results with documentation
git add scripts/validation/results/2025-01-28-phase1b/
git commit -m "docs: Phase 1B validation results (96.1% domain score)"
```

### 5. Learn from Dimension Feedback

Review evaluation explanations to identify patterns:

```bash
# Extract dimension explanations
jq -r '.tests[0].assert[0].metadata.dimensions | to_entries[] |
       "\(.key): \(.value.explanation)"' \
  scripts/validation/results/fees.json
```

**Use feedback to improve future documentation:**

- Low entity scores → Add more code references
- Low math scores → Include more formula examples
- Low schema scores → Validate examples earlier
- Low integration scores → Add more cross-references

---

## Quick Commands Reference

```bash
# === Installation ===
npm install -g promptfoo
npm install -g ajv-cli
pip install anthropic nltk rouge-score

# === Validation ===
cd scripts/validation
npx promptfoo eval -c fee-validation.yaml  # Run validation
npx promptfoo view                          # View results in browser

# === Python CLI ===
python scripts/validation/custom_evals/fee_doc_domain_scorer.py \
  docs/notebooklm-sources/fees.md \
  docs/fees.truth-cases.json \
  docs/schemas/fee-truth-case.schema.json

# === Truth Case Validation ===
jq empty docs/fees.truth-cases.json        # Validate JSON syntax
jq 'length' docs/fees.truth-cases.json     # Count cases
ajv validate \
  -s docs/schemas/fee-truth-case.schema.json \
  -d docs/fees.truth-cases.json             # Schema validation

# === Cross-Reference Checks ===
# Check if referenced files exist
grep -o "client/src/[^ ]*\.ts" docs/notebooklm-sources/fees.md | \
  xargs -I {} test -f {} && echo "✓ {}" || echo "✗ {}"

# === NPM Scripts (add to package.json) ===
npm run validate:docs                       # Run fee validation
npm run validate:docs:view                  # View results
MODULE=exit-recycling npm run validate:module  # Validate specific module
```

---

## Related Documentation

- **CAPABILITIES.md** → "Documentation Quality Validation" section
- **docs/.doc-manifest.yaml** → `validation:` section
- **CHANGELOG.md** → Implementation history
- **Anthropic Cookbook** →
  [Original evaluation framework](https://github.com/anthropics/anthropic-cookbook/tree/main/capabilities/summarization/evaluation)

---

## Support & Questions

**Issues with validation?**

1. Check troubleshooting section above
2. Review CAPABILITIES.md for agent-specific patterns
3. Inspect validation results: `npx promptfoo view`
4. Review dimension explanations for specific feedback

**Need to adapt for new module?**

- Follow "Creating Validation for New Modules" section
- Copy fee-validation.yaml as template
- Update content checks for module-specific terms
- Reuse fee_doc_domain_scorer.py (no changes needed!)

**Cost concerns?**

- Use claude-haiku-4-5 for draft validation (add `model: claude-haiku-4-5` to
  provider config)
- Cache-friendly: identical runs are free
- Validate incrementally to reduce total runs
