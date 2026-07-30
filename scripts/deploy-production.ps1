# Dispatch governed production release for exact live main.

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) is required."
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

gh workflow run release-production.yml --ref main --field "expected_sha=$expectedSha" --repo $repository
if ($LASTEXITCODE -ne 0) {
    Write-Error "Release Production dispatch failed."
    exit 1
}

Write-Host "Release Production dispatched for exact live main SHA $expectedSha."
