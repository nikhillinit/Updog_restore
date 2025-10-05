<# 
  dev-bootstrap.ps1
  Windows-friendly bootstrap for Updog_restore dev environment.
#>

param(
  [switch]$MemoryCache,
  [string]$LocalPostgres
)

function Assert-Admin {
  $current = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Please re-run this script in an Administrator PowerShell." -ForegroundColor Red
    exit 1
  }
}

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "OK: $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "WARNING: $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "ERROR: $msg" -ForegroundColor Red }

function Load-EnvFile($path) {
  if (-not (Test-Path $path)) {
    return $false
  }
  
  Write-Host "Loading environment from $path..." -ForegroundColor Gray
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
      if ($line -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
          $value = $value.Substring(1, $value.Length - 2)
        } elseif ($value.StartsWith("'") -and $value.EndsWith("'")) {
          $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "env:$key" -Value $value -Force
        Write-Host "  Set $key" -ForegroundColor DarkGray
      }
    }
  }
  return $true
}

Assert-Admin

$projectRoot = "C:\dev\Updog_restore"
if (-not (Test-Path $projectRoot)) { 
  Err "Project path not found: $projectRoot"
  exit 1 
}

Step "Move to project directory"
Set-Location $projectRoot
if (-not (Test-Path ".\package.json")) { 
  Err "No package.json in $projectRoot"
  exit 1 
}
Ok "In $projectRoot"

Step "Loading environment variables"
$envLocalPath = ".\.env.local"
$envExamplePath = ".\.env.local.example"

if (Test-Path $envLocalPath) {
  if (Load-EnvFile $envLocalPath) {
    Ok "Loaded .env.local"
  }
} elseif (Test-Path $envExamplePath) {
  Warn ".env.local not found, but .env.local.example exists"
  $response = Read-Host "Create .env.local from example? (y/N)"
  if ($response -eq "y" -or $response -eq "Y") {
    Copy-Item $envExamplePath $envLocalPath
    Ok "Created .env.local from example"
    if (Load-EnvFile $envLocalPath) {
      Ok "Loaded .env.local"
    }
    Warn "Review .env.local and update DATABASE_URL, REDIS_URL, and secrets!"
  } else {
    Warn "Continuing without .env.local - using defaults"
  }
} else {
  Warn "Neither .env.local nor .env.local.example found - using defaults"
}

Step "Killing stray Node processes"
try {
  taskkill /F /IM node.exe 2>$null | Out-Null
  Ok "Node processes terminated (if any)"
} catch { 
  Warn "Could not kill node.exe (continuing)" 
}

Step "Ensuring npm won't omit devDependencies"
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
npm config delete omit 2>$null | Out-Null
npm config delete production 2>$null | Out-Null
Ok "npm config cleaned"

Step "Installing dependencies (including dev)"
if (Test-Path ".\node_modules") {
  Warn "node_modules already exists (leaving as-is)"
}

Write-Host "Running npm install..." -ForegroundColor Gray
npm install --include=dev

Write-Host "Ensuring Neon serverless + ws are installed..." -ForegroundColor Gray
npm ls @neondatabase/serverless >$null 2>&1
if ($LASTEXITCODE -ne 0) { 
  Write-Host "Installing @neondatabase/serverless..." -ForegroundColor Gray
  npm i @neondatabase/serverless
}

npm ls ws >$null 2>&1
if ($LASTEXITCODE -ne 0) { 
  Write-Host "Installing ws..." -ForegroundColor Gray
  npm i ws
}

$hasVite = Test-Path ".\node_modules\vite"
$hasConcurrently = Test-Path ".\node_modules\concurrently"
$hasTsx = Test-Path ".\node_modules\tsx"

if (-not $hasVite -or -not $hasConcurrently -or -not $hasTsx) {
  Warn "vite, concurrently, or tsx missing after install. Installing explicitly"
  npm i -D vite concurrently tsx --include=dev
  $hasVite = Test-Path ".\node_modules\vite"
  $hasConcurrently = Test-Path ".\node_modules\concurrently"
  $hasTsx = Test-Path ".\node_modules\tsx"
}

if ($hasVite -and $hasConcurrently -and $hasTsx) {
  Ok "vite, concurrently & tsx present"
} else {
  Err "vite, concurrently, or tsx still missing. Check Windows Defender"
  exit 1
}

if ($MemoryCache) {
  Step "Memory cache mode requested - skipping Redis startup"
  $env:REDIS_URL = "memory://"
  Ok "Set REDIS_URL=memory:// for this session"
} else {
  Step "Ensuring Redis is running on 127.0.0.1:6379"
  
  $listening = $null
  try {
    $listening = (Get-NetTCPConnection -LocalPort 6379 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" })
  } catch {
  }

  if ($null -eq $listening) {
    $docker = (Get-Command docker -ErrorAction SilentlyContinue)
    if ($docker) {
      Write-Host "Starting Redis via Docker" -ForegroundColor Gray
      docker rm -f dev-redis 2>$null | Out-Null
      docker run -d --name dev-redis -p 6379:6379 redis:7 | Out-Null
      Start-Sleep -Seconds 3
      
      try {
        $listening = (Get-NetTCPConnection -LocalPort 6379 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" })
      } catch {
      }

      if ($null -eq $listening) {
        Warn "Docker started Redis but port probe failed"
      } else {
        Ok "Redis is listening on 6379 (Docker)"
      }
    } else {
      Warn "Docker not found. Start Redis manually or rerun with -MemoryCache"
    }
  } else {
    Ok "Redis already listening on 6379"
  }
  
  if (-not $env:REDIS_URL -or $env:REDIS_URL -eq "") {
    $env:REDIS_URL = "redis://127.0.0.1:6379"
  }
}

Step "Verifying Neon WebSocket wiring"
$bootstrapFile = ".\server\bootstrap.ts"
if (Test-Path $bootstrapFile) {
  $wired = Select-String -Path $bootstrapFile -Pattern "neonConfig\.webSocketConstructor" -SimpleMatch -ErrorAction SilentlyContinue
  if ($wired) {
    Ok "Neon WebSocket constructor is wired in server/bootstrap.ts"
  } else {
    Warn "Neon WebSocket constructor not found in server/bootstrap.ts"
  }
} else {
  Warn "server/bootstrap.ts not found"
}

if ($LocalPostgres) {
  Step "Using Local Postgres URL for this session"
  $env:DATABASE_URL = $LocalPostgres
  Ok "DATABASE_URL set to $LocalPostgres"
} elseif (-not $env:DATABASE_URL -or $env:DATABASE_URL -eq "" -or $env:DATABASE_URL.Contains("mock")) {
  Warn "DATABASE_URL not set or using mock value"
  Warn "Set DATABASE_URL in .env.local or use -LocalPostgres flag"
}

Step "Environment Summary"
Write-Host "  NODE_ENV: $($env:NODE_ENV)" -ForegroundColor Gray
Write-Host "  REDIS_URL: $($env:REDIS_URL)" -ForegroundColor Gray
$dbUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL -replace '\/\/[^@]+@', '//***:***@' } else { '(not set)' }
Write-Host "  DATABASE_URL: $dbUrl" -ForegroundColor Gray
Write-Host "  PORT: $($env:PORT)" -ForegroundColor Gray

Step "Starting dev servers (npm run dev)"
Write-Host "Press Ctrl+C to stop the servers" -ForegroundColor Yellow
Write-Host ""

npm run dev
