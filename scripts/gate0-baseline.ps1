# Week 2.5 Foundation Hardening - Gate 0 v7
$ErrorActionPreference = "Continue"

Write-Host "=== Gate 0: Baseline ===" -ForegroundColor Cyan

# Create artifacts FIRST
New-Item -ItemType Directory -Force -Path "artifacts" | Out-Null

# Git state
git rev-parse HEAD | Out-File -FilePath "artifacts\gate0-commit.txt" -Encoding UTF8
git status --porcelain | Out-File -FilePath "artifacts\gate0-git-status.txt" -Encoding UTF8

# 1. TypeScript
Write-Host "`n[1/7] TypeScript..." -ForegroundColor Yellow
$tscOutput = npm run check 2>&1 | Tee-Object -FilePath "artifacts\gate0-typecheck.log"
$tscErrors = ($tscOutput | Select-String -Pattern "error TS\d+").Count
Write-Host "  Errors: $tscErrors (baseline: 387)" -ForegroundColor $(if ($tscErrors -le 387) {'Green'} else {'Red'})

# 2. Sidecar
Write-Host "`n[2/7] Sidecar..." -ForegroundColor Yellow
npm run doctor:quick 2>&1 | Tee-Object -FilePath "artifacts\gate0-sidecar.log" | Out-Null
$sidecarExit = $LASTEXITCODE
Write-Host "  Exit: $sidecarExit" -ForegroundColor $(if ($sidecarExit -eq 0) {'Green'} else {'Red'})

# 3. Build (acceptable - writes to dist/)
Write-Host "`n[3/7] Build..." -ForegroundColor Yellow
npm run build 2>&1 | Tee-Object -FilePath "artifacts\gate0-build.log" | Out-Null
$buildExit = $LASTEXITCODE
Write-Host "  Exit: $buildExit" -ForegroundColor $(if ($buildExit -eq 0) {'Green'} else {'Red'})

# 4. Unit Tests
Write-Host "`n[4/7] Tests..." -ForegroundColor Yellow
$testOutput = npm run test:unit -- --reporter=verbose 2>&1 | Tee-Object -FilePath "artifacts\baseline-test-output.log"

# Parse COMBINED summary (not per-project)
# Look for final summary line (usually near end, after all project summaries)
$allTestLines = $testOutput | Select-String -Pattern "Test Files"
$testLine = ($allTestLines | Select-Object -Last 1).Line
$passedFiles = $null; $failedFiles = $null

if ($testLine -match "(\d+)\s+passed.*?(\d+)\s+failed") {
    $passedFiles = [int]$Matches[1]; $failedFiles = [int]$Matches[2]
} elseif ($testLine -match "(\d+)\s+failed.*?(\d+)\s+passed") {
    $failedFiles = [int]$Matches[1]; $passedFiles = [int]$Matches[2]
} elseif ($testLine -match "(\d+)\s+passed") {
    $passedFiles = [int]$Matches[1]; $failedFiles = 0
} elseif ($testLine -match "(\d+)\s+failed") {
    $failedFiles = [int]$Matches[1]; $passedFiles = 0
}

if ($null -ne $passedFiles -and $null -ne $failedFiles) {
    $totalFiles = $passedFiles + $failedFiles
    $passRate = if ($totalFiles -gt 0) { [math]::Round(100 * $passedFiles / $totalFiles, 1) } else { 0 }
    Write-Host "  Files: $passedFiles/$totalFiles ($passRate%)" -ForegroundColor Cyan
}

# 5. Integration Count
Write-Host "`n[5/7] Integration..." -ForegroundColor Yellow
$integrationFiles = @(Get-ChildItem -Recurse -Path "tests\integration" -Include "*.test.ts","*.spec.ts","*.test.tsx","*.spec.tsx" -File)
$testTs = ($integrationFiles | Where-Object {$_.Name -match '\.test\.ts$'}).Count
$specTs = ($integrationFiles | Where-Object {$_.Name -match '\.spec\.ts$'}).Count
Write-Host "  Files: $($integrationFiles.Count) (.test.ts=$testTs, .spec.ts=$specTs)" -ForegroundColor Cyan

# 6. React Duplication (per-package)
Write-Host "`n[6/7] React..." -ForegroundColor Yellow
$reactDupState = "unknown"
$reactByName = @{ 'react' = @(); 'react-dom' = @() }

try {
    $reactLsParseable = npm ls react react-dom --all --parseable --silent 2>&1
    $reactLsParseable | Out-File -FilePath "artifacts\react-ls-raw.txt" -Encoding UTF8

    $reactPkgPaths = $reactLsParseable | Where-Object {
        $_ -match "node_modules[\\/](react|react-dom)$"
    }

    foreach ($pkgPath in $reactPkgPaths) {
        $pkgJson = Join-Path $pkgPath "package.json"
        if (Test-Path $pkgJson) {
            $pkg = Get-Content $pkgJson -Raw | ConvertFrom-Json
            if ($reactByName.ContainsKey($pkg.name)) {
                $reactByName[$pkg.name] += $pkg.version
            }
        }
    }

    $reactVersions = @($reactByName['react'] | Select-Object -Unique)
    $domVersions = @($reactByName['react-dom'] | Select-Object -Unique)

    $dupReact = $reactVersions.Count -gt 1
    $dupDom = $domVersions.Count -gt 1
    $mismatch = ($reactVersions.Count -eq 1 -and $domVersions.Count -eq 1 -and $reactVersions[0] -ne $domVersions[0])

    if ($dupReact -or $dupDom) {
        Write-Host "  X Multiple runtime versions:" -ForegroundColor Red
        if ($dupReact) { Write-Host "    react: $($reactVersions -join ', ')" -ForegroundColor Yellow }
        if ($dupDom) { Write-Host "    react-dom: $($domVersions -join ', ')" -ForegroundColor Yellow }
        $reactDupState = "multiple"
    } elseif ($mismatch) {
        Write-Host "  WARNING Version mismatch (warning): react@$($reactVersions[0]) vs react-dom@$($domVersions[0])" -ForegroundColor Yellow
        $reactDupState = "mismatch"
    } elseif ($reactVersions.Count -eq 1 -and $domVersions.Count -eq 1) {
        Write-Host "  OK Single version: react@$($reactVersions[0]), react-dom@$($domVersions[0])" -ForegroundColor Green
        $reactDupState = "single"
    }
} catch {
    Write-Host "  WARNING npm ls failed" -ForegroundColor Yellow
    # Fallback: check package-lock (informational only)
    if (Get-Command rg -ErrorAction SilentlyContinue) {
        $react19 = (rg -c '"version": "19\.2\.0"' package-lock.json 2>&1).Count
    } else {
        $react19 = (Select-String -Path "package-lock.json" -Pattern '"version": "19\.2\.0"').Count
    }
    if ($react19 -gt 0) {
        Write-Host "  Note: React 19 in dependency graph (not confirmed as runtime)" -ForegroundColor Gray
    }
}

# 7. Provenance + Symptoms (ALWAYS scan for hook errors, regardless of dupState)
Write-Host "`n[7/7] Hook Error Scan..." -ForegroundColor Yellow
$hookErrors = $testOutput | Select-String -Pattern "Invalid hook call|Hooks can only be called inside|Cannot read.*useState"

if ($hookErrors) {
    Write-Host "  X Hook errors detected: $($hookErrors.Count)" -ForegroundColor Red
    $reactIssue = $true

    # Get provenance if we have duplication or mismatch
    if ($reactDupState -in @("multiple", "mismatch", "unknown")) {
        npm explain react@19.2.0 2>&1 | Tee-Object -FilePath "artifacts\react19-explain.log" | Out-Null
        npm explain react-dom@19.2.0 2>&1 | Tee-Object -FilePath "artifacts\reactdom19-explain.log" | Out-Null
    }
} else {
    Write-Host "  OK No hook errors" -ForegroundColor Green
    $reactIssue = $false
}

# Save metadata
@{
    timestamp = Get-Date -Format "o"
    gitCommit = (Get-Content "artifacts\gate0-commit.txt" -Raw).Trim()
    tscErrors = $tscErrors
    buildExit = $buildExit
    sidecarExit = $sidecarExit
    testFilesTotal = $totalFiles
    testFilesPassing = $passedFiles
    integrationFileCount = $integrationFiles.Count
    reactDupState = $reactDupState
    reactVersions = if ($reactVersions) { $reactVersions -join ', ' } else { "unknown" }
    reactDomVersions = if ($domVersions) { $domVersions -join ', ' } else { "unknown" }
    reactIssueDetected = $reactIssue
} | ConvertTo-Json | Out-File "artifacts\gate0-metadata.json" -Encoding UTF8

Write-Host "`n=== Gate 0 Complete ===" -ForegroundColor Cyan
if ($reactIssue) {
    Write-Host "React: Hook errors detected - Phase 1D investigation REQUIRED" -ForegroundColor Red
} elseif ($reactDupState -eq "multiple") {
    Write-Host "React: Multiple versions but no symptoms - Phase 1D DEFER" -ForegroundColor Yellow
} else {
    Write-Host "React: Healthy" -ForegroundColor Green
}
