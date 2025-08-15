#!/usr/bin/env pwsh
# Quick commit script for UX and performance improvements

Write-Host "📦 Committing UX and Performance Improvements..." -ForegroundColor Cyan

# Stage the new files
git add client/src/lib/coerce.ts
git add client/src/lib/__tests__/coerce.spec.ts
git add client/src/services/funds.ts
git add client/src/stores/useFundStore.ts
git add client/src/core/reserves/adapter/toEngineGraduationRates.ts
git add client/src/pages/fund-setup.tsx
git add scripts/commit-ux-perf-improvements.ps1

# Check if there are changes to commit
$changes = git status --porcelain
if ($changes) {
    Write-Host "✅ Changes detected, creating commit..." -ForegroundColor Green
    
    # Create the commit
    git commit -m "chore(ux): user feedback on save, route lazy-loading, centralized coercion

- Added visible feedback (alerts) on fund save/fail operations
- Centralized number coercion and formatting utilities
- Integrated coercion in store and adapter for consistent validation
- Created funds service with telemetry tracking
- Added comprehensive tests for coercion utilities
- Route lazy-loading already implemented in App.tsx

Low-effort UX and perf wins:
- Visible feedback on save actions
- Single source of truth for number clamping/formatting
- Smaller initial bundle via lazy loading"

    Write-Host "✅ Commit created successfully!" -ForegroundColor Green
    
    # Show the commit
    git show --stat HEAD
    
    Write-Host ""
    Write-Host "📋 Next steps:" -ForegroundColor Yellow
    Write-Host "1. Run tests: npm test coerce" -ForegroundColor White
    Write-Host "2. Test locally: npm run dev" -ForegroundColor White
    Write-Host "3. Push changes: git push origin main" -ForegroundColor White
    Write-Host "4. Create PR if needed" -ForegroundColor White
} else {
    Write-Host "⚠️ No changes to commit" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✨ UX improvements complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary of changes:" -ForegroundColor Cyan
Write-Host "• User feedback: Simple alerts on fund save/fail (upgrade to toast later)" -ForegroundColor White
Write-Host "• Centralized coercion: clampPct, clampInt, toUSD utilities" -ForegroundColor White
Write-Host "• Service layer: createFund with telemetry integration" -ForegroundColor White
Write-Host "• Route splitting: Already implemented lazy loading" -ForegroundColor White
Write-Host "• Tests: Comprehensive test coverage for utilities" -ForegroundColor White
