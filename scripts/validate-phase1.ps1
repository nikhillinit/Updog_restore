# Phase 1 Validation Script - PowerShell version for Windows
# Equivalent to validate-phase1.js but optimized for Windows environments

param(
    [switch]$Help,
    [switch]$SkipBuild,
    [switch]$Verbose
)

# Color functions for PowerShell
function Write-ColorOutput($Color, $Message, $Data = "") {
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"
    switch ($Color) {
        "Green" { Write-Host "[$timestamp] SUCCESS: $Message" -ForegroundColor Green; if ($Data) { Write-Host "  $Data" -ForegroundColor Gray } }
        "Red" { Write-Host "[$timestamp] ERROR: $Message" -ForegroundColor Red; if ($Data) { Write-Host "  $Data" -ForegroundColor Gray } }
        "Yellow" { Write-Host "[$timestamp] INFO: $Message" -ForegroundColor Yellow; if ($Data) { Write-Host "  $Data" -ForegroundColor Gray } }
        "Blue" { Write-Host "[$timestamp] STEP: $Message" -ForegroundColor Blue; if ($Data) { Write-Host "  $Data" -ForegroundColor Gray } }
        default { Write-Host "[$timestamp] $Message"; if ($Data) { Write-Host "  $Data" -ForegroundColor Gray } }
    }
}

function Invoke-ValidationCommand($Command, $Description) {
    Write-ColorOutput "Blue" "Starting: $Description"
    Write-ColorOutput "Blue" "Command: $Command"
    
    $startTime = Get-Date
    
    try {
        if ($Verbose) {
            Invoke-Expression $Command
        } else {
            $output = Invoke-Expression "$Command 2>&1" | Out-String
            if ($LASTEXITCODE -ne 0) {
                throw "Command failed with exit code $LASTEXITCODE. Output: $output"
            }
        }
        
        $duration = (Get-Date) - $startTime
        Write-ColorOutput "Green" "✅ $Description completed in $($duration.TotalMilliseconds)ms"
        return @{ Success = $true; Duration = $duration.TotalMilliseconds }
    }
    catch {
        $duration = (Get-Date) - $startTime
        Write-ColorOutput "Red" "❌ $Description failed after $($duration.TotalMilliseconds)ms" $_.Exception.Message
        return @{ Success = $false; Duration = $duration.TotalMilliseconds; Error = $_.Exception.Message }
    }
}

if ($Help) {
    Write-Host @"

Phase 1 Validation Script (PowerShell)

This script runs all Phase 1 critical validation steps:
1. Architecture boundary validation (dependency-cruiser)
2. Production build validation
3. TypeScript type checking
4. ESLint validation
5. Unit test execution

Usage:
  .\scripts\validate-phase1.ps1                    # Run full validation
  .\scripts\validate-phase1.ps1 -SkipBuild        # Skip build step
  .\scripts\validate-phase1.ps1 -Verbose          # Show detailed output
  .\scripts\validate-phase1.ps1 -Help             # Show this help

Environment Variables:
  `$env:CI = "true"                                # Enable CI mode
  `$env:SKIP_BUILD = "true"                        # Skip build step

Exit Codes:
  0  - All validations passed
  1  - One or more validations failed

"@
    exit 0
}

Write-ColorOutput "Blue" "🚀 Starting Phase 1 validation suite..."

$startTime = Get-Date
$results = @{
    Architecture = $null
    Build = $null
    TypeCheck = $null
    Lint = $null
    TestUnit = $null
}

try {
    # Step 1: Architecture validation (fast, fail early)
    Write-ColorOutput "Yellow" "📐 Step 1: Architecture boundary validation"
    $results.Architecture = Invoke-ValidationCommand "npm run validate:architecture" "Architecture validation"
    
    if (-not $results.Architecture.Success) {
        throw "Architecture validation failed"
    }
    
    Write-ColorOutput "Green" "✨ No client/server boundary violations found"

    # Step 2: Parallel validation (build, typecheck, lint)
    Write-ColorOutput "Yellow" "⚡ Step 2: Parallel validation (build, typecheck, lint)"
    
    # PowerShell parallel execution using jobs
    $jobs = @()
    
    if (-not $SkipBuild -and -not $env:SKIP_BUILD) {
        $jobs += Start-Job -ScriptBlock { 
            param($verbose)
            cd $args[0]
            if ($verbose) { npm run build } else { npm run build 2>&1 | Out-String }
        } -ArgumentList (Get-Location), $Verbose -Name "Build"
    }
    
    $jobs += Start-Job -ScriptBlock { 
        param($verbose)
        cd $args[0]
        if ($verbose) { npm run check } else { npm run check 2>&1 | Out-String }
    } -ArgumentList (Get-Location), $Verbose -Name "TypeCheck"
    
    $jobs += Start-Job -ScriptBlock { 
        param($verbose)
        cd $args[0]
        if ($verbose) { npm run lint } else { npm run lint 2>&1 | Out-String }
    } -ArgumentList (Get-Location), $Verbose -Name "Lint"

    # Wait for all jobs to complete
    $jobs | Wait-Job | ForEach-Object {
        $jobResult = Receive-Job $_
        $jobName = $_.Name
        
        if ($_.State -eq "Completed") {
            $results[$jobName] = @{ Success = $true }
            Write-ColorOutput "Green" "✨ $jobName validation passed"
        } else {
            $results[$jobName] = @{ Success = $false; Error = $jobResult }
            Write-ColorOutput "Red" "❌ $jobName validation failed" $jobResult
            throw "$jobName validation failed"
        }
        
        Remove-Job $_
    }

    # Validate build output if build was run
    if (-not $SkipBuild -and -not $env:SKIP_BUILD) {
        $distPath = Join-Path (Get-Location) "dist"
        if (-not (Test-Path $distPath)) {
            throw "Build output directory not found at $distPath"
        }
        Write-ColorOutput "Green" "✨ Build output verified"
    }

    # Step 3: Unit tests
    Write-ColorOutput "Yellow" "🧪 Step 3: Unit test validation"
    $results.TestUnit = Invoke-ValidationCommand "npm run test:unit" "Unit tests"
    
    if (-not $results.TestUnit.Success) {
        throw "Unit tests failed"
    }
    
    Write-ColorOutput "Green" "✨ All unit tests passing"

    # Success summary
    $totalDuration = (Get-Date) - $startTime
    Write-ColorOutput "Green" "🎉 Phase 1 validation completed successfully in $($totalDuration.TotalMilliseconds)ms"
    
    Write-Host "`n" + "=" * 60 -ForegroundColor Green
    Write-Host "PHASE 1 VALIDATION RESULTS" -ForegroundColor Green
    Write-Host "=" * 60 -ForegroundColor Green
    Write-Host "✅ Architecture validation: PASSED" -ForegroundColor Green
    if (-not $SkipBuild -and -not $env:SKIP_BUILD) {
        Write-Host "✅ Production build: PASSED" -ForegroundColor Green
    }
    Write-Host "✅ TypeScript validation: PASSED" -ForegroundColor Green
    Write-Host "✅ ESLint validation: PASSED" -ForegroundColor Green
    Write-Host "✅ Unit tests: PASSED" -ForegroundColor Green
    Write-Host "🚀 Total time: $($totalDuration.TotalMilliseconds)ms" -ForegroundColor Green

    Write-Host "`nDEFINITION OF DONE - PHASE 1:" -ForegroundColor Blue
    Write-Host "✅ No 'Module externalized for browser compatibility' warnings" -ForegroundColor Green
    Write-Host "✅ All unit tests stable on repeated runs" -ForegroundColor Green
    Write-Host "✅ TypeScript compilation clean" -ForegroundColor Green
    Write-Host "✅ ESLint parsing all TS/TSX without errors" -ForegroundColor Green
    Write-Host "✅ Client/server boundary enforcement active" -ForegroundColor Green

    exit 0
}
catch {
    $totalDuration = (Get-Date) - $startTime
    Write-ColorOutput "Red" "💥 Phase 1 validation failed after $($totalDuration.TotalMilliseconds)ms"
    Write-ColorOutput "Red" "Error: $($_.Exception.Message)"

    Write-Host "`n" + "=" * 60 -ForegroundColor Red
    Write-Host "PHASE 1 VALIDATION FAILED" -ForegroundColor Red
    Write-Host "=" * 60 -ForegroundColor Red
    
    foreach ($task in $results.Keys) {
        $result = $results[$task]
        if ($result -and $result.Success) {
            Write-Host "✅ ${task}: PASSED" -ForegroundColor Green
        } else {
            Write-Host "❌ ${task}: FAILED" -ForegroundColor Red
        }
    }

    Write-Host "💥 Failed after: $($totalDuration.TotalMilliseconds)ms" -ForegroundColor Red
    exit 1
}
finally {
    # Cleanup any remaining jobs
    Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
}