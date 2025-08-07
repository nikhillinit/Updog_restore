# 1. Build & preview with health-check and clean shutdown
cd C:\dev\Updog_restore

# 1.1 Run production build
Write-Host "Building production version..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

# 1.2 Kill any existing server on :4173
Write-Host "Cleaning up any existing server on port 4173..."
Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

# 1.3 Start new server
Write-Host "Starting production server..."
$serve = Start-Process npx -ArgumentList "serve","dist/public","-l","4173" -PassThru

# 1.4 Wait until healthy
Write-Host "Waiting for server to be ready..."
$ready = $false
for ($i=0; $i -lt 60; $i++) {
  try { 
    $response = Invoke-WebRequest -Uri "http://localhost:4173" -TimeoutSec 2 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
      $ready=$true
      break 
    }
  }
  catch { 
    Write-Host "Attempt $($i+1)/60 - waiting for server..."
    Start-Sleep -Seconds 1 
  }
}
if (-not $ready) { 
  Write-Host "Server failed to start within 60 seconds"
  if ($serve -and !$serve.HasExited) {
    Stop-Process -Id $serve.Id -Force
  }
  throw "Server failed to start" 
}

# 1.5 Open browser & pause for manual QA
Start-Process "http://localhost:4173"
Write-Host "Server ready at http://localhost:4173 - press ENTER when done"
Read-Host

# 1.6 Cleanly stop server
Write-Host "Stopping server..."
Stop-Process -Id $serve.Id -Force
Write-Host "Server stopped cleanly"
