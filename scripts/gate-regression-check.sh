#!/bin/bash

# Gate Regression Detection Script
# Prevents gates from going from green to red without explicit acknowledgment

set -e

echo "🔍 Gate Regression Check"
echo "========================"

# Store current gate status
CURRENT_TS=$(npm run check 2>&1 | grep -c "error TS" || echo "0")
CURRENT_TESTS=$(npm test 2>&1 | grep -c "failing" || echo "0")
CURRENT_BUNDLE=$(npm run build 2>&1 | grep -oP '\d+(?=\.\d+\s*kB)' | head -1 || echo "0")

# Check for previous gate status (stored in git)
if [ -f ".gate-status.json" ]; then
    PREV_TS=$(jq -r '.typescript_errors' .gate-status.json)
    PREV_TESTS=$(jq -r '.test_failures' .gate-status.json)
    PREV_BUNDLE=$(jq -r '.bundle_size_kb' .gate-status.json)
    
    # Detect regressions
    REGRESSION=false
    
    if [ "$CURRENT_TS" -gt "$PREV_TS" ]; then
        echo "❌ TypeScript Regression: $PREV_TS → $CURRENT_TS errors"
        REGRESSION=true
    fi
    
    if [ "$CURRENT_TESTS" -gt "$PREV_TESTS" ]; then
        echo "❌ Test Regression: $PREV_TESTS → $CURRENT_TESTS failures"
        REGRESSION=true
    fi
    
    if [ "$CURRENT_BUNDLE" -gt "$PREV_BUNDLE" ]; then
        BUNDLE_INCREASE=$((CURRENT_BUNDLE - PREV_BUNDLE))
        if [ "$BUNDLE_INCREASE" -gt 5 ]; then
            echo "❌ Bundle Size Regression: ${PREV_BUNDLE}KB → ${CURRENT_BUNDLE}KB (+${BUNDLE_INCREASE}KB)"
            REGRESSION=true
        fi
    fi
    
    if [ "$REGRESSION" = true ]; then
        echo ""
        echo "🚨 GATE REGRESSION DETECTED"
        echo "This PR makes previously green gates turn red."
        echo ""
        echo "Options:"
        echo "1. Fix the regression before merging"
        echo "2. Add label 'regression-acknowledged' with justification"
        echo "3. Emergency bypass (requires post-incident review)"
        
        # Check for bypass label
        if [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then
            LABELS=$(gh pr view $PR_NUMBER --json labels -q '.labels[].name' | grep -c "regression-acknowledged" || true)
            if [ "$LABELS" -eq 0 ]; then
                exit 1
            else
                echo ""
                echo "⚠️ Regression acknowledged via label - proceeding"
            fi
        fi
    else
        echo "✅ No gate regressions detected"
    fi
else
    echo "📝 First run - establishing baseline"
fi

# Update gate status for next run
cat > .gate-status.json <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "typescript_errors": $CURRENT_TS,
  "test_failures": $CURRENT_TESTS,
  "bundle_size_kb": $CURRENT_BUNDLE,
  "commit": "$(git rev-parse HEAD)"
}
EOF

echo ""
echo "📊 Current Gate Status:"
echo "  TypeScript Errors: $CURRENT_TS"
echo "  Test Failures: $CURRENT_TESTS"
echo "  Bundle Size: ${CURRENT_BUNDLE}KB"