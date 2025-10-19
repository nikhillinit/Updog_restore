# Find large files outside node_modules (top 20)
Write-Host "=== TOP 20 LARGE FILES (>5MB) OUTSIDE node_modules ===" -ForegroundColor Green
Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | 
    Where-Object {$_.Length -gt 5MB -and $_.FullName -notmatch 'node_modules'} | 
    Sort-Object Length -Descending | 
    Select-Object -First 20 | 
    ForEach-Object {
        $size = [math]::Round($_.Length/1MB, 2)
        Write-Host "$size MB - $($_.FullName)"
    }

# Find large files in node_modules (top 20)
Write-Host "`n=== TOP 20 LARGE FILES (>5MB) IN node_modules ===" -ForegroundColor Green
Get-ChildItem node_modules -Recurse -File -ErrorAction SilentlyContinue | 
    Where-Object {$_.Length -gt 5MB} | 
    Sort-Object Length -Descending | 
    Select-Object -First 20 | 
    ForEach-Object {
        $size = [math]::Round($_.Length/1MB, 2)
        Write-Host "$size MB - $($_.FullName)"
    }

# Count files per directory
Write-Host "`n=== FILE COUNTS BY TOP-LEVEL DIRECTORY ===" -ForegroundColor Green
Get-ChildItem -Directory | ForEach-Object {
    $count = @(Get-ChildItem -Path $_.FullName -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Host "$($_.Name): $($count) files"
} | Sort-Object -Descending

# Check for unignored generated files
Write-Host "`n=== POTENTIAL UNIGNORED FILES ===" -ForegroundColor Yellow
Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | 
    Where-Object {$_.Name -match '\.map$|\.lcov$|debug\.log|coverage' -and $_.FullName -notmatch 'node_modules'} | 
    ForEach-Object {Write-Host $_.FullName}
