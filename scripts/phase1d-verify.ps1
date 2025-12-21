# Phase 1D: Verify React deduplication
Write-Host "=== Phase 1D: React Verification ===" -ForegroundColor Cyan

npm ls react react-dom --all --parseable 2>&1 | Tee-Object -FilePath "artifacts/phase1d-react-verify.log" | Out-Null

$reactPaths = Get-Content "artifacts/phase1d-react-verify.log" | Where-Object { $_ -match "node_modules[\\/](react|react-dom)$" }

$versions = @{ 'react' = @(); 'react-dom' = @() }

foreach ($path in $reactPaths) {
    $pkgJson = Join-Path $path "package.json"
    if (Test-Path $pkgJson) {
        $pkg = Get-Content $pkgJson -Raw | ConvertFrom-Json
        if ($versions.ContainsKey($pkg.name)) {
            $versions[$pkg.name] += $pkg.version
        }
    }
}

$reactVersions = @($versions['react'] | Select-Object -Unique)
$domVersions = @($versions['react-dom'] | Select-Object -Unique)

Write-Host "`nReact versions found:" -ForegroundColor Yellow
Write-Host "  react: $($reactVersions -join ', ')" -ForegroundColor Cyan
Write-Host "  react-dom: $($domVersions -join ', ')" -ForegroundColor Cyan

if ($reactVersions.Count -eq 1 -and $domVersions.Count -eq 1 -and $reactVersions[0] -eq $domVersions[0]) {
    Write-Host "`nSUCCESS: Single React version: $($reactVersions[0])" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nFAILED: Multiple versions still present" -ForegroundColor Red
    exit 1
}
