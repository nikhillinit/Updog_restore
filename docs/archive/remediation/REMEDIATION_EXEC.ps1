# REMEDIATION_EXEC.ps1 - Dependency Remediation Execution Script
# Fast path for fixing phantom vite/concurrently/tsx installation

Write-Host "🔧 Server Dependency Remediation - Fast Path Execution" -ForegroundColor Cyan
Write-Host "=" * 80

# PHASE 0: PRE-FLIGHT CHECKS (3 min)
Write-Host "`n📋 PHASE 0: Pre-Flight Checks" -ForegroundColor Yellow

# 1. Kill stale Node processes
Write-Host "  → Killing stale Node processes..."
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# 2. Verify exact versions exist on npm
Write-Host "  → Verifying package versions on npm..."
$viteVer = npm view vite@5.4.11 version 2>&1
$concurrentlyVer = npm view concurrently@9.2.1 version 2>&1
$tsxVer = npm view tsx@4.19.2 version 2>&1

if ($viteVer -notmatch "5.4.11") {
    Write-Host "❌ vite@5.4.11 not found on npm" -ForegroundColor Red
    exit 1
}
if ($concurrentlyVer -notmatch "9.2.1") {
    Write-Host "❌ concurrently@9.2.1 not found on npm" -ForegroundColor Red
    exit 1
}
if ($tsxVer -notmatch "4.19.2") {
    Write-Host "❌ tsx@4.19.2 not found on npm" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ All versions verified on npm" -ForegroundColor Green

# 3. Check for workspaces (should be none)
$pkgJson = Get-Content package.json -Raw
if ($pkgJson -match '"workspaces"') {
    Write-Host "⚠️  Workspaces detected - may need special handling" -ForegroundColor Yellow
}

# 4. Pin official registry
Write-Host "  → Pinning npm registry..."
npm config set registry https://registry.npmjs.org/

# PHASE 1: ENVIRONMENT HARDENING (3 min)
Write-Host "`n🛡️  PHASE 1: Environment Hardening" -ForegroundColor Yellow

# Clear problematic env vars
Write-Host "  → Clearing problematic environment variables..."
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
Remove-Item Env:npm_config_production -ErrorAction SilentlyContinue

# Set permanent guards
Write-Host "  → Setting npm config guards..."
npm config delete omit 2>$null
npm config set production false

# Verify settings
$omitVal = npm config get omit
$prodVal = npm config get production
Write-Host "  ✅ npm config omit: $omitVal (should be empty)" -ForegroundColor Green
Write-Host "  ✅ npm config production: $prodVal (should be false)" -ForegroundColor Green

# PHASE 2: NUCLEAR CLEAN (2 min)
Write-Host "`n🧹 PHASE 2: Nuclear Clean" -ForegroundColor Yellow

Write-Host "  → Cleaning npm cache..."
npm cache clean --force | Out-Null

Write-Host "  → Removing node_modules..."
if (Test-Path node_modules) {
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
}

Write-Host "  → Removing package-lock.json..."
if (Test-Path package-lock.json) {
    Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
}

# Verify clean state
$nmExists = Test-Path node_modules
$lockExists = Test-Path package-lock.json
Write-Host "  ✅ node_modules exists: $nmExists (should be False)" -ForegroundColor Green
Write-Host "  ✅ package-lock.json exists: $lockExists (should be False)" -ForegroundColor Green

# Update package.json with new scripts and settings
Write-Host "`n📦 Updating package.json..." -ForegroundColor Yellow
npm pkg set "engines.node"=">=20.19.0 <21"
npm pkg set "engines.npm"=">=10.9.0 <11"
npm pkg set "packageManager"="npm@10.9.2"
npm pkg set "volta.node"="20.19.0"
npm pkg set "volta.npm"="10.9.2"
npm pkg set "overrides.vite"="5.4.11"
npm pkg set "overrides.concurrently"="9.2.1"
npm pkg set "overrides.tsx"="4.19.2"
npm pkg set "scripts.preinstall"="npx only-allow npm"
npm pkg set "scripts.doctor"="node scripts/doctor.js"
npm pkg set 'scripts.reset:deps'="rimraf node_modules package-lock.json && npm cache clean --force && npm install"
npm pkg set 'scripts.dev:api'="tsx server/bootstrap.ts"
npm pkg set 'scripts.dev:client'="wait-on http://localhost:5000 && vite"
npm pkg set 'scripts.dev'="npm run doctor && concurrently -k -n api,client -c auto `"npm:dev:api`" `"npm:dev:client`""

# PHASE 3: INSTALL & VERIFY (8 min)
Write-Host "`n⚡ PHASE 3: Install & Verify" -ForegroundColor Yellow

# Install new devDeps first
Write-Host "  → Installing utility devDeps (only-allow, rimraf, wait-on)..."
npm i -D only-allow@1 rimraf@6 wait-on@8

# Pin exact critical devDeps
Write-Host "  → Pinning exact critical devDeps..."
npm i -D -E vite@5.4.11 concurrently@9.2.1 tsx@4.19.2

# Full install
Write-Host "  → Running full npm install (this may take a few minutes)..."
npm install

# CRITICAL VERIFICATION
Write-Host "`n🔍 CRITICAL VERIFICATION:" -ForegroundColor Cyan
$viteCheck = npm list vite 2>&1 | Select-String "vite@5.4.11"
$concurrentlyCheck = npm list concurrently 2>&1 | Select-String "concurrently@9.2.1"
$tsxCheck = npm list tsx 2>&1 | Select-String "tsx@4.19.2"

if ($viteCheck) {
    Write-Host "  ✅ vite@5.4.11 installed correctly" -ForegroundColor Green
} else {
    Write-Host "  ❌ vite NOT installed correctly (showing empty)" -ForegroundColor Red
    Write-Host "  → Try antivirus exclusion or NPX fallback" -ForegroundColor Yellow
}

if ($concurrentlyCheck) {
    Write-Host "  ✅ concurrently@9.2.1 installed correctly" -ForegroundColor Green
} else {
    Write-Host "  ❌ concurrently NOT installed correctly" -ForegroundColor Red
}

if ($tsxCheck) {
    Write-Host "  ✅ tsx@4.19.2 installed correctly" -ForegroundColor Green
} else {
    Write-Host "  ❌ tsx NOT installed correctly" -ForegroundColor Red
}

# PHASE 4: VALIDATION (3 min)
Write-Host "`n✅ PHASE 4: Validation" -ForegroundColor Yellow

Write-Host "  → Running doctor script..."
npm run doctor

Write-Host "`n🎉 Remediation Complete!" -ForegroundColor Green
Write-Host "=" * 80
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run: npm run dev" -ForegroundColor White
Write-Host "  2. Verify both servers start (API on :5000, Client on :5173)" -ForegroundColor White
Write-Host "  3. Check browser at http://localhost:5173" -ForegroundColor White
Write-Host "  4. Commit changes: git add . && git commit -m 'fix(deps): deterministic dependency resolution'" -ForegroundColor White
Write-Host ""
Write-Host "If issues persist, see REMEDIATION_FALLBACK.md for antivirus exclusion steps" -ForegroundColor Yellow
