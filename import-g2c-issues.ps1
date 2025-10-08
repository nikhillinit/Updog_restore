# import-g2c-issues.ps1
# Bulk-create GitHub issues from sprint-g2c-backlog.md headings.

$REPO = "nikhillinit/Updog_restore"
$BACKLOG = ".\sprint-g2c-backlog.md"
$GH_PATH = "C:\Program Files\GitHub CLI\gh.exe"

# Read the backlog file and find G2C issue headings
$content = Get-Content $BACKLOG
$issues = @()

for ($i = 0; $i -lt $content.Length; $i++) {
    $line = $content[$i]
    if ($line -match '^#### (G2C-[0-9]+): (.+)$') {
        $issueId = $matches[1]
        $issueTitle = $matches[2]
        
        # Collect the body content until the next heading
        $body = @()
        $j = $i + 1
        while ($j -lt $content.Length -and $content[$j] -notmatch '^#### ') {
            if ($content[$j].Trim() -ne '') {
                $body += $content[$j]
            }
            $j++
        }
        
        $issues += @{
            Id = $issueId
            Title = $issueTitle
            Body = ($body -join [System.Environment]::NewLine)
        }
    }
}

# Create each issue
foreach ($issue in $issues) {
    Write-Host "Creating issue: $($issue.Id): $($issue.Title)"

    $ghArgs = @(
        "issue", "create",
        "--repo", $REPO,
        "--title", "$($issue.Id): $($issue.Title)",
        "--body", $issue.Body,
        "--assignee", "@me"
    )

    & $GH_PATH @ghArgs

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully created issue: $($issue.Id)" -ForegroundColor Green
    } else {
        Write-Host "Failed to create issue: $($issue.Id)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Completed processing $($issues.Count) issues."
