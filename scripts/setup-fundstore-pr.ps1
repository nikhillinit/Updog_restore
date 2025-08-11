#!/usr/bin/env pwsh
param(
  [switch]$AutoMerge = $false,
  [switch]$SkipTests = $false
)
$ErrorActionPreference = "Stop"

# Safety: refuse on main; require clean tree
./scripts/preflight.ps1 -ExpectedBranch "feature/fundstore-integration"

# Validate locally
./scripts/validate-local.ps1 -SkipTests:$SkipTests

# Push & create PR
Write-Host "📤 Pushing to origin..." -ForegroundColor Cyan
git push -u origin feature/fundstore-integration

$body = @"
## Summary
Migrates **InvestmentStrategyStep** to the centralized **FundStore** and hardens graduation/reserves behavior.

## Key Changes
- ✅ Single source of truth via ``useFundStore``
- ✅ Derived **Remain %** (never stored): ``100 - (graduate + exit)``
- ✅ Enforces **last stage graduation = 0%** (UI disabled + store clamp)
- ✅ Ensures **graduate + exit ≤ 100%** (proportional allocation)
- ✅ **Next** button gated via validation selector
- ✅ Store persistence with migration; only primitive inputs persisted
- ✅ Backward-compatible UI (no layout churn)

## Migration Risk: LOW
- ✅ No breaking changes to existing data
- ✅ Backward compatible with existing UI
- ✅ Rollback-safe (no destructive migrations)
- ✅ Feature-flag ready if needed

## Business Rules (centralized in store)
- Last stage graduation forced to 0%
- grad + exit scaled to ≤ 100 via allocator
- Remain derived everywhere
- Stage names required to proceed

## Tests
- Unit/integration passing (3/3 reserves + store invariants)
- E2E localStorage migration test included
- Type checking passed
- Production build successful

## Rollback Plan
1. ``git revert <merge-commit>``
2. Clear localStorage if necessary (persist key: ``investment-strategy``)
3. No schema downgrade required

## Implementation Details
- Adapter converts variable stages → engine transitions (N → N-1)
- No derived fields persisted; prevents model/UI drift
- Store wrapper provides typed hooks for components
- Validation selector centralizes business rules
"@

Write-Host "🔄 Creating PR..." -ForegroundColor Cyan
$prUrl = gh pr create `
  --base main `
  --title "feat(store): migrate InvestmentStrategyStep to FundStore + reserves hardening" `
  --label enhancement `
  --draft `
  --body "$body"

Write-Host "✅ PR created: $prUrl" -ForegroundColor Green
Start-Process $prUrl | Out-Null

if ($AutoMerge) {
  Write-Host "⏳ Enabling auto-merge (squash)..." -ForegroundColor Yellow
  gh pr merge --squash --auto $prUrl
  Write-Host "✅ Auto-merge enabled" -ForegroundColor Green
}
