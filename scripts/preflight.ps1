#!/usr/bin/env pwsh
param(
  [string]$ExpectedBranch = "feature/fundstore-integration"
)
$ErrorActionPreference = "Stop"

Write-Host "✈️ Pre-flight..." -ForegroundColor Cyan

# Tools
foreach ($cmd in @("git","gh","node","npm")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd is required but not installed."
  }
}

# Branch & cleanliness
$branch = (git branch --show-current).Trim()
Write-Host "  • Branch: $branch"
if ($branch -eq "main") { throw "Refusing to run on 'main'." }
if ($ExpectedBranch -and $branch -ne $ExpectedBranch) {
  Write-Warning "Expected '$ExpectedBranch' but on '$branch'."
}

$dirty = git status --porcelain
if ($dirty) { throw "Working tree not clean. Commit or stash first." }

# Node version hint (>= 18 recommended)
$node = node -v
Write-Host "  • Node: $node"
Write-Host "✅ Pre-flight passed." -ForegroundColor Green
