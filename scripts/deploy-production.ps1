# Dispatch governed production release for exact live main.

param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $FundHealthPath,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $FundReadyPath,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $CapitalHealthPath,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $CapitalReadyPath,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[1-9][0-9]{0,31}$')]
    [string] $SchemaApplyRunId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^1$')]
    [string] $SchemaApplyRunAttempt,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[1-9][0-9]{0,31}$')]
    [string] $SchemaApplyArtifactId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^sha256:[a-f0-9]{64}$')]
    [string] $SchemaApplyArtifactDigest,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{64}$')]
    [string] $SchemaApplyReceiptFileSha256,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string] $SchemaPrecursorSha,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[1-9][0-9]{0,8}$')]
    [string] $PrNumber,

    [Parameter(Mandatory = $true)]
    [ValidateSet('primary', 'rollback')]
    [string] $ReleaseMode,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[1-9][0-9]{0,31}$')]
    [string] $BaselineRunId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[1-9][0-9]{0,8}$')]
    [string] $BaselineRunAttempt,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[1-9][0-9]{0,31}$')]
    [string] $BaselineArtifactId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^sha256:[a-f0-9]{64}$')]
    [string] $BaselineArtifactDigest,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{64}$')]
    [string] $BaselineFileSha256,

    [Parameter(Mandatory = $false)]
    [string] $RollbackPrNumber,

    [Parameter(Mandatory = $false)]
    [string] $RollbackPrHeadSha
)

$ErrorActionPreference = "Stop"

# Cross-mode fence: rollback identity is forbidden in primary mode and both
# values are required in rollback mode.
if ($ReleaseMode -eq 'primary') {
    if (-not [string]::IsNullOrEmpty($RollbackPrNumber) -or -not [string]::IsNullOrEmpty($RollbackPrHeadSha)) {
        Write-Error "RollbackPrNumber and RollbackPrHeadSha are forbidden in primary mode."
        exit 1
    }
} else {
    if ($RollbackPrNumber -notmatch '^[1-9][0-9]{0,8}$') {
        Write-Error "RollbackPrNumber is required in rollback mode and must be a positive integer."
        exit 1
    }
    if ($RollbackPrHeadSha -notmatch '^[a-f0-9]{40}$') {
        Write-Error "RollbackPrHeadSha is required in rollback mode and must be 40 lowercase hex."
        exit 1
    }
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) is required."
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js (node) is required."
    exit 1
}

$repository = gh repo view --json nameWithOwner --jq ".nameWithOwner"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repository)) {
    Write-Error "Could not resolve current GitHub repository."
    exit 1
}
$repository = $repository.Trim()

$expectedSha = gh api "repos/$repository/commits/main" --jq ".sha"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($expectedSha)) {
    Write-Error "Could not resolve live main SHA."
    exit 1
}
$expectedSha = $expectedSha.Trim()

if ($expectedSha -notmatch "^[0-9a-f]{40}$") {
    Write-Error "Live main returned invalid SHA '$expectedSha'."
    exit 1
}

$operatorEvidenceLines = @(
    node scripts/release/operator-evidence-bundle.mjs encode `
        --fund-health $FundHealthPath `
        --fund-ready $FundReadyPath `
        --capital-health $CapitalHealthPath `
        --capital-ready $CapitalReadyPath
)
if ($LASTEXITCODE -ne 0 -or $operatorEvidenceLines.Count -ne 1) {
    Write-Error "Operator evidence codec must emit exactly one base64 line."
    exit 1
}
$operatorEvidenceB64 = ([string] $operatorEvidenceLines[0]).Trim()
if ([string]::IsNullOrWhiteSpace($operatorEvidenceB64) -or $operatorEvidenceB64.Contains("`n") -or $operatorEvidenceB64.Contains("`r")) {
    Write-Error "Operator evidence codec returned empty or multiline output."
    exit 1
}

# The workflow_dispatch UI shows at most ten inputs, so the exact
# baseline identity travels as one compact base64 JSON input; the
# baseline-policy-preflight job decodes and validates every field.
$baselineBinding = [ordered]@{
    schemaVersion = 'release-baseline-binding-v1'
    baselineRunId = $BaselineRunId
    baselineRunAttempt = [int] $BaselineRunAttempt
    baselineArtifactId = $BaselineArtifactId
    baselineArtifactDigest = $BaselineArtifactDigest
    baselineFileSha256 = $BaselineFileSha256
}
if ($ReleaseMode -eq 'rollback') {
    $baselineBinding['rollbackPrNumber'] = [int] $RollbackPrNumber
    $baselineBinding['rollbackPrHeadSha'] = $RollbackPrHeadSha
}
$baselineEvidenceB64 = [Convert]::ToBase64String(
    [System.Text.Encoding]::UTF8.GetBytes(($baselineBinding | ConvertTo-Json -Compress))
)

$inputs = [ordered]@{
    expected_sha = $expectedSha
    operator_evidence_b64 = $operatorEvidenceB64
    release_mode = $ReleaseMode
    baseline_evidence_b64 = $baselineEvidenceB64
    schema_apply_run_id = $SchemaApplyRunId
    schema_apply_run_attempt = $SchemaApplyRunAttempt
    schema_apply_artifact_id = $SchemaApplyArtifactId
    schema_apply_artifact_digest = $SchemaApplyArtifactDigest
    schema_apply_receipt_file_sha256 = $SchemaApplyReceiptFileSha256
    schema_precursor_sha = $SchemaPrecursorSha
    pr_number = $PrNumber
}
$inputsJson = $inputs | ConvertTo-Json -Compress
if ($inputsJson.Length -gt 65535) {
    Write-Error "Release workflow inputs exceed GitHub's workflow_dispatch payload limit."
    exit 1
}

$inputsJson | gh workflow run release-production.yml --ref main --repo $repository --json
if ($LASTEXITCODE -ne 0) {
    Write-Error "Release Production dispatch failed."
    exit 1
}

Write-Host "Release Production dispatched for exact live main SHA $expectedSha."
