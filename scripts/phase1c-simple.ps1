$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$integrationDir = Join-Path $repoRoot 'tests\integration'
$intConfigPath = Join-Path $repoRoot 'vitest.config.int.ts'
$vitestConfigPath = Join-Path $repoRoot 'vitest.config.ts'

function Write-CheckResult {
    param(
        [bool]$Ok,
        [string]$Message,
        [string]$Detail = ''
    )

    $status = if ($Ok) { 'OK' } else { 'FAIL' }
    $color = if ($Ok) { 'Green' } else { 'Red' }
    Write-Host "[$status] $Message" -ForegroundColor $color
    if ($Detail) {
        Write-Host "  $Detail" -ForegroundColor Gray
    }
}

$overallOk = $true

if (-not (Test-Path $integrationDir)) {
    Write-CheckResult $false 'Integration tests directory not found' $integrationDir
    $overallOk = $false
} else {
    $integrationFiles = Get-ChildItem -Path $integrationDir -Recurse -File -Include *.test.ts, *.spec.ts -ErrorAction SilentlyContinue
    $integrationCount = @($integrationFiles).Count
    Write-CheckResult $true "Integration tests found: $integrationCount" $integrationDir
}

if (-not (Test-Path $intConfigPath)) {
    Write-CheckResult $false 'vitest.config.int.ts not found' $intConfigPath
    $overallOk = $false
} else {
    $intConfigContent = Get-Content -Path $intConfigPath -Raw
    $hasTestPattern = $intConfigContent -match '\*\.test\.ts'
    Write-CheckResult $hasTestPattern 'vitest.config.int.ts includes *.test.ts pattern' $intConfigPath
    if (-not $hasTestPattern) {
        $overallOk = $false
    }
}

if (-not (Test-Path $vitestConfigPath)) {
    Write-CheckResult $false 'vitest.config.ts not found' $vitestConfigPath
    $overallOk = $false
} else {
    $vitestContent = Get-Content -Path $vitestConfigPath -Raw
    $serverMatch = [regex]::Match($vitestContent, "(?s)name:\s*'server'.*?exclude:\s*\[(?<exclude>.*?)\]")
    if (-not $serverMatch.Success) {
        Write-CheckResult $false 'Server project block not found in vitest.config.ts' $vitestConfigPath
        $overallOk = $false
    } else {
        $excludeBlock = $serverMatch.Groups['exclude'].Value
        $pattern = [regex]::Escape('tests/integration/**/*')
        $serverExcludesIntegration = $excludeBlock -match $pattern
        Write-CheckResult $serverExcludesIntegration 'Server project excludes tests/integration/**/*' $vitestConfigPath
        if (-not $serverExcludesIntegration) {
            $overallOk = $false
        }
    }
}

Write-Host ''
if ($overallOk) {
    Write-Host 'All checks passed.' -ForegroundColor Green
    exit 0
}

Write-Host 'One or more checks failed.' -ForegroundColor Red
exit 1
