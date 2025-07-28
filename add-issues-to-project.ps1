# Add all G2C issues to the project
$GH_PATH = "C:\Program Files\GitHub CLI\gh.exe"
$PROJECT_NUMBER = 1
$OWNER = "nikhillinit"
$REPO = "nikhillinit/Updog_restore"

# Add issues 3-15 to the project (issue 2 was already added)
for ($i = 3; $i -le 15; $i++) {
    $issueUrl = "https://github.com/$REPO/issues/$i"
    Write-Host "Adding issue #$i to project..."
    
    & $GH_PATH project item-add $PROJECT_NUMBER --owner $OWNER --url $issueUrl
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Successfully added issue #$i" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to add issue #$i" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Completed adding issues to project!"
