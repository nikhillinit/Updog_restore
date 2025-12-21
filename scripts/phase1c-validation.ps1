# Week 2.5 Foundation Hardening - Phase 1C v7
Write-Host "=== Phase 1C: Set Comparison ===" -ForegroundColor Cyan

# Physical files (relative paths)
$physical = if (Get-Command rg -ErrorAction SilentlyContinue) {
    @(rg --files -g "tests/integration/**/*.{test,spec}.{ts,tsx}") | ForEach-Object { $_ -replace '\\','/' }
} else {
    @(Get-ChildItem -Recurse -Path "tests\integration" -Include "*.test.ts","*.spec.ts","*.test.tsx","*.spec.tsx" -File) |
        ForEach-Object { ($_.FullName.Substring($PWD.Path.Length + 1)) -replace '\\','/' }
}
Write-Host "  Physical files: $($physical.Count)" -ForegroundColor Cyan

# Unit scope (with --no-color)
Write-Host "`n  Checking unit scope..." -ForegroundColor Yellow
npm exec -- vitest --project=server --project=client --list --no-color 2>&1 | Tee-Object -FilePath "artifacts\unit-list.log" | Out-Null
$unitRefs = (Get-Content "artifacts\unit-list.log" | Select-String -Pattern "tests[/\\]+integration").Count

if ($unitRefs -eq 0) {
    Write-Host "  OK Unit excludes integration" -ForegroundColor Green
} else {
    Write-Host "  X Integration in unit scope ($unitRefs refs)" -ForegroundColor Red
}

# Integration scope (with --no-color)
Write-Host "`n  Checking integration scope..." -ForegroundColor Yellow
npm exec -- vitest -c vitest.config.int.ts --list --no-color 2>&1 | Tee-Object -FilePath "artifacts\integration-list.log" | Out-Null

# Extract paths (explicit flatten)
$listed = Select-String -Path "artifacts\integration-list.log" -Pattern "tests[/\\]+integration[/\\].*\.(test|spec)\.tsx?" -AllMatches |
    ForEach-Object { $_.Matches | ForEach-Object { $_.Value } } |
    ForEach-Object { $_ -replace '\\','/' } |
    Select-Object -Unique

Write-Host "  Listed files: $($listed.Count)" -ForegroundColor Cyan

# Validate not empty (colorization/format issue)
if ($listed.Count -eq 0 -and $physical.Count -gt 0) {
    Write-Host "  WARNING: --list returned no paths (check vitest output format)" -ForegroundColor Yellow
    Write-Host "  Review artifacts\integration-list.log manually" -ForegroundColor Gray
    Write-Host "  Integration config may need verification" -ForegroundColor Gray
}

# Set comparison
$missing = $physical | Where-Object { $_ -notin $listed }
$extra = $listed | Where-Object { $_ -notin $physical }

if ($missing.Count -eq 0 -and $extra.Count -eq 0 -and $listed.Count -gt 0) {
    Write-Host "`nPASS: Perfect match ($($physical.Count) files)" -ForegroundColor Green
} else {
    if ($missing.Count -gt 0) {
        Write-Host "`nX MISSING ($($missing.Count)):" -ForegroundColor Red
        $missing | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    }
    if ($extra.Count -gt 0) {
        Write-Host "`nWARNING EXTRA ($($extra.Count)):" -ForegroundColor Yellow
        $extra | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    }
}

Write-Host "`nOK Phase 1C Complete" -ForegroundColor Green
