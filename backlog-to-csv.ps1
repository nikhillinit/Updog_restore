# Convert sprint backlog to CSV for GitHub import
$BACKLOG = ".\sprint-g2c-backlog.md"
$CSV_OUTPUT = "g2c-issues.csv"

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
        
        $issues += [PSCustomObject]@{
            title = "$issueId`: $issueTitle"
            body = ($body -join "`n")
            labels = "Gate G2C"
            assignee = "nikhillinit"
        }
    }
}

# Export to CSV
$issues | Export-Csv -Path $CSV_OUTPUT -NoTypeInformation -Encoding UTF8

Write-Host "Created CSV file: $CSV_OUTPUT with $($issues.Count) issues"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Go to https://github.com/nikhillinit/Updog_restore/issues"
Write-Host "2. Click 'New Issue' → 'Import from CSV'"
Write-Host "3. Upload the file: $CSV_OUTPUT"
Write-Host ""
Write-Host "CSV Preview:"
$issues[0..2] | Format-Table -Wrap -Property title, @{Name="body_preview"; Expression={$_.body.Substring(0, [Math]::Min(50, $_.body.Length)) + "..."}}, labels, assignee
