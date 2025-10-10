#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Verifying Phase 1 ship gate requirements..."

# ADR links
if ! grep -q "## Architecture Decisions" README.md; then
  echo "❌ README.md missing Architecture Decisions section"
  exit 1
fi

if ! grep -q "docs/adr/" README.md; then
  echo "❌ README.md missing link to docs/adr/"
  exit 1
fi

# Metrics link
if ! grep -q "docs/metrics-meanings.md" README.md; then
  echo "❌ README.md missing link to metrics-meanings.md"
  exit 1
fi

# Feature flags
if ! grep -q "^AI_EVAL_ENABLED=" .env.example; then
  echo "❌ .env.example missing AI_EVAL_ENABLED"
  exit 1
fi

if ! grep -q "^AI_STREAMING_ENABLED=" .env.example; then
  echo "❌ .env.example missing AI_STREAMING_ENABLED"
  exit 1
fi

if ! grep -q "^AI_TOKEN_BUDGET_USD=" .env.example; then
  echo "❌ .env.example missing AI_TOKEN_BUDGET_USD"
  exit 1
fi

# Golden fixtures schema
if [ -f tests/agents/fixtures/golden-cashflows.csv ]; then
  header=$(head -n1 tests/agents/fixtures/golden-cashflows.csv)
  expected="scenario_id,period_index,period_date,cf_amount,expected_irr,expected_tvpi"
  if [ "$header" != "$expected" ]; then
    echo "❌ golden-cashflows.csv has wrong header"
    echo "   Expected: $expected"
    echo "   Got:      $header"
    exit 1
  fi
else
  echo "❌ golden-cashflows.csv not found"
  exit 1
fi

echo "✅ All ship gate requirements verified"
