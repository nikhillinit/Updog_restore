# PowerShell script to fix TypeScript errors using Zencoder integration
# This script provides a streamlined workflow for fixing TypeScript compilation errors

param(
    [int]$MaxFixes = 10,
    [switch]$Verbose,
    [switch]$DryRun
)

Write-Host "🚀 Zencoder TypeScript Fix Workflow" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Step 1: Check current TypeScript errors
Write-Host "`n📊 Checking current TypeScript errors..." -ForegroundColor Yellow
$errorCount = npm run check:client 2>&1 | Select-String "error TS" | Measure-Object | Select-Object -ExpandProperty Count
Write-Host "Found $errorCount TypeScript errors" -ForegroundColor Red

if ($errorCount -eq 0) {
    Write-Host "✅ No TypeScript errors found!" -ForegroundColor Green
    exit 0
}

# Step 2: Build Zencoder integration if needed
Write-Host "`n🔨 Building Zencoder integration..." -ForegroundColor Yellow
Push-Location packages/zencoder-integration
npm install --silent 2>$null
npm run build --silent 2>$null
Pop-Location

# Step 3: Run Zencoder TypeScript fixer
Write-Host "`n🤖 Running Zencoder AI to fix TypeScript errors..." -ForegroundColor Yellow
Write-Host "Max fixes: $MaxFixes" -ForegroundColor Gray

$args = @("run", "ai", "zencoder", "typescript", "--max-fixes=$MaxFixes")
if ($Verbose) { $args += "--verbose" }

if ($DryRun) {
    Write-Host "DRY RUN MODE - No changes will be applied" -ForegroundColor Magenta
    # In dry run, we'd simulate the fixes
    Write-Host "Would fix up to $MaxFixes TypeScript errors"
} else {
    npm @args
}

# Step 4: Verify fixes
Write-Host "`n✔️ Verifying TypeScript compilation..." -ForegroundColor Yellow
$newErrorCount = npm run check:client 2>&1 | Select-String "error TS" | Measure-Object | Select-Object -ExpandProperty Count

$fixed = $errorCount - $newErrorCount
Write-Host "`n📈 Results:" -ForegroundColor Cyan
Write-Host "  • Errors before: $errorCount" -ForegroundColor White
Write-Host "  • Errors after: $newErrorCount" -ForegroundColor White
Write-Host "  • Fixed: $fixed" -ForegroundColor Green

if ($newErrorCount -gt 0) {
    Write-Host "`n⚠️ $newErrorCount errors remaining. Run again to fix more." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "`n✅ All TypeScript errors fixed!" -ForegroundColor Green
    
    # Step 5: Run tests to ensure nothing broke
    Write-Host "`n🧪 Running tests to verify fixes..." -ForegroundColor Yellow
    npm run test:unit --silent
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ All tests passing!" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Some tests failing. Review the changes." -ForegroundColor Yellow
    }
}

Write-Host "`n🎉 Zencoder TypeScript fix complete!" -ForegroundColor Green