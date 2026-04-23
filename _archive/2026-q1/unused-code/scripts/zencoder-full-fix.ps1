# PowerShell script for comprehensive codebase fixes using Zencoder
# Addresses all major issues identified in CODEBASE_ISSUES_SUMMARY.md

param(
    [switch]$TypeScript,
    [switch]$ESLint,
    [switch]$Tests,
    [switch]$Dependencies,
    [switch]$All,
    [switch]$Verbose
)

function Write-Section($title) {
    Write-Host "`n$("="*50)" -ForegroundColor Cyan
    Write-Host $title -ForegroundColor Cyan
    Write-Host $("="*50) -ForegroundColor Cyan
}

Write-Host @"
╔═══════════════════════════════════════════════════╗
║     🚀 Zencoder Comprehensive Fix Pipeline 🚀     ║
╚═══════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

# If -All is specified, enable all fixes
if ($All) {
    $TypeScript = $true
    $ESLint = $true
    $Tests = $true
    $Dependencies = $true
}

# If no specific flags, show menu
if (-not ($TypeScript -or $ESLint -or $Tests -or $Dependencies)) {
    Write-Host "`nSelect issues to fix:" -ForegroundColor Yellow
    Write-Host "1. TypeScript errors (23 errors)" -ForegroundColor White
    Write-Host "2. ESLint violations (1456 errors)" -ForegroundColor White
    Write-Host "3. Test failures (57 failing)" -ForegroundColor White
    Write-Host "4. Security vulnerabilities (9 issues)" -ForegroundColor White
    Write-Host "5. All of the above" -ForegroundColor Green
    Write-Host "0. Exit" -ForegroundColor Red
    
    $choice = Read-Host "`nEnter your choice (0-5)"
    
    switch ($choice) {
        "1" { $TypeScript = $true }
        "2" { $ESLint = $true }
        "3" { $Tests = $true }
        "4" { $Dependencies = $true }
        "5" { $All = $true; $TypeScript = $true; $ESLint = $true; $Tests = $true; $Dependencies = $true }
        "0" { exit 0 }
        default { Write-Host "Invalid choice" -ForegroundColor Red; exit 1 }
    }
}

# Track overall progress
$totalIssues = 0
$fixedIssues = 0

# Fix TypeScript errors
if ($TypeScript) {
    Write-Section "🔧 PHASE 1: TypeScript Error Resolution"
    
    Write-Host "Current TypeScript errors: " -NoNewline
    $tsErrors = npm run check:client 2>&1 | Select-String "error TS" | Measure-Object | Select-Object -ExpandProperty Count
    Write-Host "$tsErrors" -ForegroundColor Red
    $totalIssues += $tsErrors
    
    Write-Host "Running Zencoder TypeScript fixer..." -ForegroundColor Yellow
    npm run ai zencoder typescript --max-fixes=25 $(if ($Verbose) {"--verbose"})
    
    $newTsErrors = npm run check:client 2>&1 | Select-String "error TS" | Measure-Object | Select-Object -ExpandProperty Count
    $tsFixed = $tsErrors - $newTsErrors
    $fixedIssues += $tsFixed
    
    Write-Host "✅ Fixed $tsFixed/$tsErrors TypeScript errors" -ForegroundColor Green
}

# Fix ESLint violations
if ($ESLint) {
    Write-Section "🔧 PHASE 2: ESLint Cleanup"
    
    Write-Host "Current ESLint errors: " -NoNewline
    $eslintErrors = npm run lint 2>&1 | Select-String "errors" | Select-Object -First 1
    if ($eslintErrors -match "(\d+) errors") {
        $errorCount = [int]$matches[1]
        Write-Host "$errorCount" -ForegroundColor Red
        $totalIssues += $errorCount
    }
    
    # First try automated cleanup script
    Write-Host "Running automated unused variable cleanup..." -ForegroundColor Yellow
    node scripts/clean-unused.mjs
    
    # Then use Zencoder for remaining issues
    Write-Host "Running Zencoder ESLint fixer..." -ForegroundColor Yellow
    npm run ai zencoder eslint --max-fixes=50 $(if ($Verbose) {"--verbose"})
    
    $newEslintErrors = npm run lint 2>&1 | Select-String "errors" | Select-Object -First 1
    if ($newEslintErrors -match "(\d+) errors") {
        $newErrorCount = [int]$matches[1]
        $eslintFixed = $errorCount - $newErrorCount
        $fixedIssues += $eslintFixed
        Write-Host "✅ Fixed $eslintFixed/$errorCount ESLint errors" -ForegroundColor Green
    }
}

# Fix test failures
if ($Tests) {
    Write-Section "🔧 PHASE 3: Test Suite Repair"
    
    Write-Host "Analyzing test failures..." -ForegroundColor Yellow
    $testResult = npm test 2>&1 | Select-String "Tests:.*failed"
    if ($testResult -match "(\d+) failed") {
        $failedTests = [int]$matches[1]
        Write-Host "Current failing tests: $failedTests" -ForegroundColor Red
        $totalIssues += $failedTests
    }
    
    # Use existing test repair agent
    Write-Host "Running test repair agent..." -ForegroundColor Yellow
    npm run ai repair --max-repairs=10 $(if ($Verbose) {"--verbose"})
    
    # Also use Zencoder for specific test issues
    Write-Host "Running Zencoder test fixer..." -ForegroundColor Yellow
    npm run ai zencoder test --max-fixes=10 $(if ($Verbose) {"--verbose"})
    
    $newTestResult = npm test 2>&1 | Select-String "Tests:.*failed"
    if ($newTestResult -match "(\d+) failed") {
        $newFailedTests = [int]$matches[1]
        $testsFixed = $failedTests - $newFailedTests
        $fixedIssues += $testsFixed
        Write-Host "✅ Fixed $testsFixed/$failedTests test failures" -ForegroundColor Green
    }
}

# Fix security vulnerabilities
if ($Dependencies) {
    Write-Section "🔧 PHASE 4: Security & Dependencies"
    
    Write-Host "Current vulnerabilities: " -NoNewline
    $auditResult = npm audit 2>&1 | Select-String "(\d+) vulnerabilities"
    if ($auditResult -match "(\d+) vulnerabilities") {
        $vulnCount = [int]$matches[1]
        Write-Host "$vulnCount" -ForegroundColor Red
        $totalIssues += $vulnCount
    }
    
    # First try npm audit fix
    Write-Host "Running npm audit fix..." -ForegroundColor Yellow
    npm audit fix
    
    # Then use Zencoder for complex updates
    Write-Host "Running Zencoder dependency updater..." -ForegroundColor Yellow
    npm run ai zencoder deps --max-fixes=10 $(if ($Verbose) {"--verbose"})
    
    $newAuditResult = npm audit 2>&1 | Select-String "(\d+) vulnerabilities"
    if ($newAuditResult -match "(\d+) vulnerabilities") {
        $newVulnCount = [int]$matches[1]
        $vulnsFixed = $vulnCount - $newVulnCount
        $fixedIssues += $vulnsFixed
        Write-Host "✅ Fixed $vulnsFixed/$vulnCount vulnerabilities" -ForegroundColor Green
    }
}

# Final verification
Write-Section "📊 FINAL VERIFICATION"

Write-Host "Running comprehensive checks..." -ForegroundColor Yellow

# Check TypeScript
$finalTsErrors = npm run check:client 2>&1 | Select-String "error TS" | Measure-Object | Select-Object -ExpandProperty Count
Write-Host "TypeScript errors: $finalTsErrors" -ForegroundColor $(if ($finalTsErrors -eq 0) {"Green"} else {"Yellow"})

# Check ESLint
$finalEslint = npm run lint 2>&1 | Select-String "errors" | Select-Object -First 1
if ($finalEslint -match "(\d+) errors") {
    Write-Host "ESLint errors: $($matches[1])" -ForegroundColor $(if ([int]$matches[1] -eq 0) {"Green"} else {"Yellow"})
}

# Check build
Write-Host "`nAttempting production build..." -ForegroundColor Yellow
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build successful!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Build still has issues" -ForegroundColor Yellow
}

# Summary
Write-Section "📈 SUMMARY"

$fixRate = if ($totalIssues -gt 0) { [math]::Round(($fixedIssues / $totalIssues) * 100, 1) } else { 0 }

Write-Host "Total issues addressed: $totalIssues" -ForegroundColor White
Write-Host "Successfully fixed: $fixedIssues" -ForegroundColor Green
Write-Host "Fix rate: $fixRate%" -ForegroundColor Cyan

if ($fixRate -gt 80) {
    Write-Host "`n🎉 Excellent progress! Most issues have been resolved." -ForegroundColor Green
} elseif ($fixRate -gt 50) {
    Write-Host "`n✅ Good progress! Over half of the issues fixed." -ForegroundColor Yellow
} else {
    Write-Host "`n⚠️ Some progress made. Manual intervention may be needed." -ForegroundColor Yellow
}

Write-Host "`n💡 Next steps:" -ForegroundColor Cyan
Write-Host "1. Review the changes with 'git diff'" -ForegroundColor White
Write-Host "2. Run tests with 'npm test'" -ForegroundColor White
Write-Host "3. Commit fixes with descriptive message" -ForegroundColor White
Write-Host "4. Create PR for review" -ForegroundColor White