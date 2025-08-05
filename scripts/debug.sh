#!/usr/bin/env bash
# -------------------------------------------
# Updog Debug Report – run locally any time  
# -------------------------------------------
set -euo pipefail

echo "🔍  Updog Debug Report"
echo "======================"
echo "📦  Key dependencies:"
npm ls financial zustand recharts --depth=0 2>/dev/null || echo "❌ deps missing"

echo -e "\n🏷️  Last deployment:"
tail -1 deployment.csv 2>/dev/null || echo "No deployments yet"

echo -e "\n💰  CI minutes used:"
gh api /user/metrics/github-actions -q '.minutes_used' 2>/dev/null || echo "Unknown (gh cli needed)"

echo -e "\n🔄  Migration progress:"
tail -1 .async-migration-log 2>/dev/null | cut -d'|' -f2 || echo "0%"

echo -e "\n🖥️  Development server:"
npm pkg get scripts.dev 2>/dev/null || echo "No dev script configured"

echo -e "\n🐛  Common fixes:"
echo "  • Missing deps: ./quickstart.sh"
echo "  • Port conflict: pkill -f :3000"
echo "  • Git issues: git status"
echo "  • Full reset: git clean -fd && npm ci"
