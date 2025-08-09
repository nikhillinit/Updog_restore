param(
  [string]$BaseBranch = "feature/graduation-reserves",
  [string]$NewBranch  = "chore/remove-dupes-and-artifacts",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Require($cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Required command '$cmd' not found."
  }
}
Require git; Require node; Require npm; Require gh

Write-Host "➡️  Base branch: $BaseBranch"
Write-Host "➡️  New branch : $NewBranch"
Write-Host "🧪 Dry run     : $($DryRun.IsPresent)"

# 0) Prep + backup tag
git fetch origin
git checkout $BaseBranch
git pull --ff-only

$backupTag = "backup/before-cleanup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "📸 Creating backup tag: $backupTag" -ForegroundColor Yellow
if (-not $DryRun) { git tag $backupTag } else { Write-Host "[DRY RUN] Would tag $backupTag" -ForegroundColor Magenta }

if (-not $DryRun) { git switch -c $NewBranch } else { Write-Host "[DRY RUN] Would create/switch to $NewBranch" -ForegroundColor Magenta }

# 1) Remove generated artifacts from VCS; ignore going forward
$artifactDirs = @("playwright-report","test-results")
foreach ($d in $artifactDirs) {
  if (Test-Path $d) {
    if (-not $DryRun) { git rm -r --cached --ignore-unmatch $d | Out-Null }
    else { Write-Host "[DRY RUN] Would untrack $d" -ForegroundColor Magenta }
  }
}

$gitignorePath = ".gitignore"
$ignoreContent = if (Test-Path $gitignorePath) { Get-Content $gitignorePath } else { @() }
$toAdd = @(
  "", "# Test artifacts",
  "playwright-report/", "test-results/",
  "*.tmp", "*.log"
) | Where-Object { $ignoreContent -notcontains $_ }

if ($toAdd.Count -gt 0) {
  if (-not $DryRun) { Add-Content -Path $gitignorePath -Value ($toAdd -join [Environment]::NewLine) }
  else { Write-Host "[DRY RUN] Would append to .gitignore:`n$($toAdd -join "`n")" -ForegroundColor Magenta }
}

# 2) Remove duplicate/unused configs & strays
$maybeFiles = @(
  "playwright.config.simple.ts",
  "preflight.sh",
  "simple-preview.ps1",
  "tsconfig.fast.json",
  "tatus"
)
foreach ($f in $maybeFiles) {
  if (Test-Path $f) {
    if (-not $DryRun) { git rm --cached --ignore-unmatch $f | Out-Null; Remove-Item -Force -Recurse $f }
    else { Write-Host "[DRY RUN] Would delete $f" -ForegroundColor Magenta }
  }
}

# 3) Update package.json scripts (canonical configs)
if (Test-Path "package.json") {
  $pkg = Get-Content package.json -Raw | ConvertFrom-Json
  if (-not $pkg.scripts) { 
    $pkg | Add-Member -NotePropertyName scripts -NotePropertyValue ([PSCustomObject]@{}) 
  }

  # Add/update specific scripts
  if (-not ($pkg.scripts.PSObject.Properties.Name -contains 'test:e2e')) {
    $pkg.scripts | Add-Member -NotePropertyName 'test:e2e' -NotePropertyValue "playwright test -c playwright.config.ts"
  } else {
    $pkg.scripts.'test:e2e' = "playwright test -c playwright.config.ts"
  }
  
  if (-not ($pkg.scripts.PSObject.Properties.Name -contains 'typecheck')) {
    $pkg.scripts | Add-Member -NotePropertyName 'typecheck' -NotePropertyValue "tsc -p tsconfig.json"
  } else {
    $pkg.scripts.typecheck = "tsc -p tsconfig.json"
  }

  # Update existing scripts that reference old configs
  foreach ($k in $pkg.scripts.PSObject.Properties.Name) {
    $v = $pkg.scripts.$k
    if ($v -is [string]) { $pkg.scripts.$k = $v -replace "playwright\.config\.simple\.ts","playwright.config.ts" }
  }

  if (-not $DryRun) { $pkg | ConvertTo-Json -Depth 100 | Out-File -Encoding UTF8 package.json }
  else { Write-Host "[DRY RUN] Would rewrite package.json scripts" -ForegroundColor Magenta }
}

# 4) Update CI workflow references
$wfDir = ".github/workflows"
if (Test-Path $wfDir) {
  Get-ChildItem $wfDir -Filter *.yml -Recurse | ForEach-Object {
    $c = Get-Content $_.FullName -Raw
    $n = $c `
      -replace "playwright\.config\.simple\.ts","playwright.config.ts" `
      -replace "tsconfig\.fast\.json","tsconfig.json"
    if ($n -ne $c) {
      if (-not $DryRun) { $n | Out-File -Encoding UTF8 $_.FullName }
      else { Write-Host "[DRY RUN] Would update $_" -ForegroundColor Magenta }
    }
  }
}

# 5) Commit
if (-not $DryRun) {
  git add -A
  git commit -m "chore(repo): remove duplicate configs & committed artifacts; pin scripts to canonical configs"
} else {
  Write-Host "[DRY RUN] Would commit changes" -ForegroundColor Magenta
}

# 6) Validation suite (non-blockers noted)
Write-Host "`n📋 Running validation suite..." -ForegroundColor Cyan
$validationFailed = $false

Write-Host "  Installing dependencies..." -ForegroundColor Gray
if (-not $DryRun) {
  npm ci --prefer-offline --no-audit; if ($LASTEXITCODE -ne 0) { Write-Warning "npm ci failed"; $validationFailed = $true }
} else { Write-Host "[DRY RUN] Would run 'npm ci'" -ForegroundColor Magenta }

if (Test-Path "tsconfig.json") {
  Write-Host "  Type checking..." -ForegroundColor Gray
  if (-not $DryRun) { npm run typecheck | Out-Null; if ($LASTEXITCODE -ne 0) { Write-Warning "TypeScript has errors (non-blocking)" } }
}

if (Test-Path "playwright.config.ts") {
  Write-Host "  Validating Playwright config..." -ForegroundColor Gray
  if (-not $DryRun) { npx playwright test -c playwright.config.ts --list | Out-Null; if ($LASTEXITCODE -ne 0) { Write-Warning "Playwright config issues (non-blocking)" } }
}

$pkgRaw = if (Test-Path package.json) { Get-Content package.json -Raw } else { "" }
if ($pkgRaw -match '"lint"') {
  Write-Host "  Running linter..." -ForegroundColor Gray
  if (-not $DryRun) { npm run lint --max-warnings=0 | Out-Null; if ($LASTEXITCODE -eq 0) { Write-Host "  ✓ Linting passed" -ForegroundColor Green } }
}

if ($validationFailed) { Write-Host "`n⚠️  Some validations failed. Review before merging." -ForegroundColor Yellow }
else { Write-Host "`n✅ Validation complete." -ForegroundColor Green }

# 7) Push & PR (or simulate)
if (-not $DryRun) {
  git push -u origin $NewBranch
  $prTitle = "chore(repo): remove duplicates & artifacts; standardize configs"
  $prBody  = @"
- Deletes unused alternates:
  - \`playwright.config.simple.ts\`, \`preflight.sh\`, \`simple-preview.ps1\`, \`tsconfig.fast.json\`, \`tatus\`
- Purges committed test artifacts: \`playwright-report/\`, \`test-results/\` and adds them to .gitignore
- Pins \`test:e2e\` to \`playwright.config.ts\`, \`typecheck\` to \`tsconfig.json\`
- Updates CI workflows referencing old paths
"@
  gh pr create --base $BaseBranch --title $prTitle --body $prBody --label chore --label repo-hygiene
  Write-Host "`n📝 PR opened. Backup tag: $backupTag" -ForegroundColor Cyan
} else {
  Write-Host "[DRY RUN] Would push branch & open PR" -ForegroundColor Magenta
}

# 8) Rollback tips
Write-Host "`n📌 Rollback commands (if needed):" -ForegroundColor DarkGray
Write-Host "  git checkout $BaseBranch" -ForegroundColor DarkGray
Write-Host "  git branch -D $NewBranch" -ForegroundColor DarkGray
Write-Host "  git push origin --delete $NewBranch" -ForegroundColor DarkGray
Write-Host "  gh pr close --delete-branch" -ForegroundColor DarkGray
Write-Host "  git reset --hard $backupTag" -ForegroundColor DarkGray
