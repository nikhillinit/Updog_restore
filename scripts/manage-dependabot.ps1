param(
    [ValidateSet("list", "merge-all", "close-old", "stats")]
    [string]$Action = "list"
)

$ErrorActionPreference = "Stop"

function Get-DependabotPRs {
    Write-Host "🔍 Fetching Dependabot PRs..." -ForegroundColor Gray
    try {
        $prs = gh pr list --author "app/dependabot" --json number,title,createdAt,labels,statusCheckRollup,url --limit 50 | 
               ConvertFrom-Json
        return $prs
    }
    catch {
        Write-Error "Failed to fetch PRs: $_"
        exit 1
    }
}

function Format-PRStatus {
    param($StatusState)
    switch ($StatusState) {
        "SUCCESS" { return "✅" }
        "FAILURE" { return "❌" }
        "PENDING" { return "⏳" }
        "EXPECTED" { return "⏳" }
        default { return "❓" }
    }
}

function Get-PRAge {
    param([DateTime]$CreatedAt)
    return [Math]::Floor(((Get-Date) - $CreatedAt).TotalDays)
}

switch ($Action) {
    "list" {
        Write-Host "`n📦 Open Dependabot PRs:" -ForegroundColor Cyan
        $prs = Get-DependabotPRs
        
        if ($prs.Count -eq 0) {
            Write-Host "✅ No open Dependabot PRs" -ForegroundColor Green
            return
        }

        foreach ($pr in $prs) {
            $status = Format-PRStatus -StatusState $pr.statusCheckRollup.state
            $age = Get-PRAge -CreatedAt ([DateTime]$pr.createdAt)
            $ageText = if ($age -eq 0) { "today" } elseif ($age -eq 1) { "1 day" } else { "${age} days" }
            
            $hasAutoMerge = $pr.labels | Where-Object { $_.name -eq "automerge-candidate" }
            $autoMergeIcon = if ($hasAutoMerge) { "🤖" } else { "   " }
            
            Write-Host "$status $autoMergeIcon PR #$($pr.number): $($pr.title)" -ForegroundColor White
            Write-Host "    📅 Created $ageText ago" -ForegroundColor Gray
        }
        
        Write-Host "`nTotal: $($prs.Count) PRs" -ForegroundColor Gray
        $readyCount = ($prs | Where-Object { $_.statusCheckRollup.state -eq "SUCCESS" }).Count
        if ($readyCount -gt 0) {
            Write-Host "Ready to merge: $readyCount PRs" -ForegroundColor Green
        }
    }
    
    "merge-all" {
        Write-Host "`n🚀 Auto-merging passing Dependabot PRs..." -ForegroundColor Cyan
        $prs = Get-DependabotPRs
        $passingPRs = $prs | Where-Object { 
            $_.statusCheckRollup.state -eq "SUCCESS" -and
            ($_.labels | Where-Object { $_.name -eq "automerge-candidate" })
        }
        
        if ($passingPRs.Count -eq 0) {
            Write-Host "📭 No PRs ready for auto-merge (must have passing checks + 'automerge-candidate' label)" -ForegroundColor Yellow
            return
        }

        foreach ($pr in $passingPRs) {
            try {
                Write-Host "Merging #$($pr.number): $($pr.title)" -ForegroundColor Green
                gh pr merge $pr.number --squash --auto --delete-branch
                Start-Sleep -Seconds 2  # Rate limit protection
            }
            catch {
                Write-Warning "Failed to merge PR #$($pr.number): $_"
            }
        }
        
        Write-Host "✅ Queued $($passingPRs.Count) PRs for auto-merge" -ForegroundColor Green
    }
    
    "close-old" {
        Write-Host "`n🧹 Closing stale Dependabot PRs (>30 days)..." -ForegroundColor Yellow
        $cutoff = (Get-Date).AddDays(-30)
        $prs = Get-DependabotPRs | Where-Object { 
            [DateTime]$_.createdAt -lt $cutoff 
        }
        
        if ($prs.Count -eq 0) {
            Write-Host "✅ No stale PRs found" -ForegroundColor Green
            return
        }

        foreach ($pr in $prs) {
            $age = Get-PRAge -CreatedAt ([DateTime]$pr.createdAt)
            try {
                Write-Host "Closing #$($pr.number) (${age} days old): $($pr.title)" -ForegroundColor Red
                gh pr close $pr.number --comment "Auto-closed: Stale Dependabot PR (>30 days old). Dependencies may have been updated in newer PRs."
                Start-Sleep -Seconds 2  # Rate limit protection
            }
            catch {
                Write-Warning "Failed to close PR #$($pr.number): $_"
            }
        }
        
        Write-Host "🗑️ Closed $($prs.Count) stale PRs" -ForegroundColor Red
    }
    
    "stats" {
        Write-Host "`n📊 Dependabot Statistics:" -ForegroundColor Cyan
        $prs = Get-DependabotPRs
        
        if ($prs.Count -eq 0) {
            Write-Host "✅ No open Dependabot PRs" -ForegroundColor Green
            return
        }

        Write-Host "Total open: $($prs.Count)" -ForegroundColor White
        
        # Status breakdown
        Write-Host "`n📈 By CI Status:" -ForegroundColor Yellow
        $statusGroups = $prs | Group-Object { $_.statusCheckRollup.state } | Sort-Object Name
        foreach ($group in $statusGroups) {
            $icon = Format-PRStatus -StatusState $group.Name
            $status = if ($group.Name) { $group.Name } else { "UNKNOWN" }
            Write-Host "  $icon $status`: $($group.Count)" -ForegroundColor White
        }
        
        # Age breakdown  
        Write-Host "`n📅 By Age:" -ForegroundColor Yellow
        $today = Get-Date
        $ageStats = @{
            "< 1 day" = 0
            "1-7 days" = 0  
            "7-30 days" = 0
            "> 30 days" = 0
        }
        
        foreach ($pr in $prs) {
            $age = Get-PRAge -CreatedAt ([DateTime]$pr.createdAt)
            if ($age -lt 1) { $ageStats["< 1 day"]++ }
            elseif ($age -le 7) { $ageStats["1-7 days"]++ }
            elseif ($age -le 30) { $ageStats["7-30 days"]++ }
            else { $ageStats["> 30 days"]++ }
        }
        
        foreach ($key in $ageStats.Keys | Sort-Object) {
            if ($ageStats[$key] -gt 0) {
                $icon = if ($key -eq "> 30 days") { "🕰️" } elseif ($key -eq "< 1 day") { "🆕" } else { "📅" }
                Write-Host "  $icon $key`: $($ageStats[$key])" -ForegroundColor White
            }
        }
        
        # Auto-merge candidates
        $autoMergeCandidates = $prs | Where-Object { $_.labels | Where-Object { $_.name -eq "automerge-candidate" } }
        Write-Host "`n🤖 Auto-merge candidates: $($autoMergeCandidates.Count)" -ForegroundColor Magenta
        
        # Ready to merge
        $readyToMerge = $autoMergeCandidates | Where-Object { $_.statusCheckRollup.state -eq "SUCCESS" }
        if ($readyToMerge.Count -gt 0) {
            Write-Host "🚀 Ready to merge now: $($readyToMerge.Count)" -ForegroundColor Green
        }

        # Recommendations
        Write-Host "`n💡 Recommendations:" -ForegroundColor Cyan
        if ($ageStats["> 30 days"] -gt 0) {
            Write-Host "  • Run 'close-old' to clean up $($ageStats["> 30 days"]) stale PR(s)" -ForegroundColor Yellow
        }
        if ($readyToMerge.Count -gt 0) {
            Write-Host "  • Run 'merge-all' to merge $($readyToMerge.Count) passing PR(s)" -ForegroundColor Green
        }
        if ($autoMergeCandidates.Count -eq 0 -and $prs.Count -gt 0) {
            Write-Host "  • Consider adding 'automerge-candidate' labels to appropriate PRs" -ForegroundColor Blue
        }
    }
}

Write-Host "" # Add spacing at end
