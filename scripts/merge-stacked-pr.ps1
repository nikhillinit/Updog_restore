param(
  [Parameter(Mandatory=$true)][int]$Parent,
  [Parameter(Mandatory=$true)][int]$Child
)

$ErrorActionPreference = "Stop"

Write-Host "🔄 Merging stacked PRs: Parent #$Parent -> Child #$Child" -ForegroundColor Cyan

# Fetch and verify
git fetch origin

# Get branches
$parentBase = (gh pr view $Parent --json baseRefName | jq -r '.baseRefName')
$parentHead = (gh pr view $Parent --json headRefName | jq -r '.headRefName')
$childBase  = (gh pr view $Child  --json baseRefName | jq -r '.baseRefName')
$childHead  = (gh pr view $Child  --json headRefName | jq -r '.headRefName')

if (-not $parentBase -or -not $parentHead -or -not $childHead) {
  throw "Unable to resolve PR branches. Check permissions and PR numbers."
}

# 1) Merge/land Parent into its base
gh pr ready $Parent | Out-Null
gh pr merge $Parent --squash --auto | Out-Null
Write-Host "✅ Parent #$Parent queued for auto-merge." -ForegroundColor Green

# 2) Wait for parent to land on its base
$timeout = (Get-Date).AddMinutes(30)
do {
  Start-Sleep -Seconds 10
  $state = (gh pr view $Parent --json state | jq -r '.state')
  if ($state -eq 'MERGED') { break }
} while ((Get-Date) -lt $timeout)

if ($state -ne 'MERGED') { throw "Parent PR #$Parent did not merge within timeout." }

# 3) Rebase child onto latest base (usually main)
git fetch origin
git switch $childHead
git pull --ff-only

$targetBase = (gh pr view $Parent --json baseRefName | jq -r '.baseRefName') # after merge, parent's base is the new base for child
git rebase "origin/$targetBase"

# 4) Local validation
npm ci
npm run test:all

# 5) Push and retarget child PR to the merged base
git push --force-with-lease
gh pr edit $Child --base $targetBase
gh pr ready $Child

Write-Host "🎉 Child PR #$Child rebased onto $targetBase and marked ready." -ForegroundColor Green
