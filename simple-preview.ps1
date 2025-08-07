# Build & preview script - simplified
cd C:\dev\Updog_restore

Write-Host "Building production version..."
npm run build
if ($LASTEXITCODE -ne 0) { 
    Write-Host "Build failed!"
    exit 1 
}

Write-Host "Cleaning up any existing server on port 4173..."
Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "=========================================="
Write-Host "Production build complete!"
Write-Host "=========================================="
Write-Host ""
Write-Host "To preview the production build:"
Write-Host "1. Open a new terminal"
Write-Host "2. Run: npx serve dist/public -l 4173"
Write-Host "3. Open http://localhost:4173 in your browser"
Write-Host ""
Write-Host "Or run this command now:"
Write-Host "npx serve dist/public -l 4173"
Write-Host ""
