#!/bin/bash

# Script to create GitHub epic for retiring skipped tests
# Usage: ./scripts/create-skip-epic.sh

set -e

echo "🔍 Analyzing skipped tests..."

# Find all skipped tests and categorize them
SKIP_DATA=$(grep -rn "\.skip\|describe\.skip" tests/ --include="*.test.*" --include="*.spec.*" || true)

if [ -z "$SKIP_DATA" ]; then
    echo "✅ No skipped tests found!"
    exit 0
fi

# Count total skips
TOTAL_SKIPS=$(echo "$SKIP_DATA" | wc -l)

# Categorize skips
SCHEMA_SKIPS=$(echo "$SKIP_DATA" | grep -E "schema|validation" | wc -l || echo 0)
UI_SKIPS=$(echo "$SKIP_DATA" | grep -E "ui-|component|render" | wc -l || echo 0)
API_SKIPS=$(echo "$SKIP_DATA" | grep -E "api/|engine" | wc -l || echo 0)
PERF_SKIPS=$(echo "$SKIP_DATA" | grep -E "performance|bench" | wc -l || echo 0)
OTHER_SKIPS=$((TOTAL_SKIPS - SCHEMA_SKIPS - UI_SKIPS - API_SKIPS - PERF_SKIPS))

# Create epic body
EPIC_BODY="## 📊 Skipped Test Summary

Total skipped tests: **$TOTAL_SKIPS**

### Categories:
- 📋 Schema/Validation: $SCHEMA_SKIPS tests
- 🎨 UI Components: $UI_SKIPS tests  
- 🔌 API/Engines: $API_SKIPS tests
- ⚡ Performance: $PERF_SKIPS tests
- 🗂️ Other: $OTHER_SKIPS tests

### Skipped Test Locations:
\`\`\`
$SKIP_DATA
\`\`\`

### Action Items:
- [ ] Review and categorize all skipped tests
- [ ] Create sub-issues for each category
- [ ] Prioritize based on test coverage impact
- [ ] Set target dates for resolution

### Success Criteria:
- All skips have #temporary-skip justification
- Test coverage increases by resolving skips
- No new unauthorized skips introduced
"

# Create the epic
echo "📝 Creating GitHub epic..."
gh issue create \
    --title "Epic: Retire Remaining $TOTAL_SKIPS Skipped Tests" \
    --body "$EPIC_BODY" \
    --label "epic,skip-debt,testing" \
    --assignee "@me" || {
    echo "❌ Failed to create epic. Make sure 'gh' CLI is installed and authenticated."
    echo ""
    echo "You can manually create the issue with this content:"
    echo "---"
    echo "Title: Epic: Retire Remaining $TOTAL_SKIPS Skipped Tests"
    echo "---"
    echo "$EPIC_BODY"
    exit 1
}

echo "✅ Epic created successfully!"

# Optionally create sub-issues
read -p "Create sub-issues for each category? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ $SCHEMA_SKIPS -gt 0 ]; then
        gh issue create \
            --title "Fix $SCHEMA_SKIPS schema validation skipped tests" \
            --body "Part of skip retirement epic. Focus on schema and validation tests." \
            --label "skip-debt,schema"
    fi
    
    if [ $UI_SKIPS -gt 0 ]; then
        gh issue create \
            --title "Fix $UI_SKIPS UI component skipped tests" \
            --body "Part of skip retirement epic. Focus on UI and component tests." \
            --label "skip-debt,ui"
    fi
    
    if [ $API_SKIPS -gt 0 ]; then
        gh issue create \
            --title "Fix $API_SKIPS API/engine skipped tests" \
            --body "Part of skip retirement epic. Focus on API and engine tests." \
            --label "skip-debt,api"
    fi
    
    echo "✅ Sub-issues created!"
fi