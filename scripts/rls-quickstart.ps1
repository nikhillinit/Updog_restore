# RLS Quick Start Script (PowerShell)
# Automates complete setup of multi-tenant RLS development environment

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Multi-Tenant RLS Development Environment Setup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "[ERROR] Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host "[1/5] Starting PostgreSQL container..." -ForegroundColor Green
docker compose up -d postgres
Write-Host ""

Write-Host "[2/5] Waiting for PostgreSQL to be ready..." -ForegroundColor Green
Start-Sleep -Seconds 3

$maxAttempts = 30
$attempt = 0
while ($attempt -lt $maxAttempts) {
    try {
        docker exec povc_postgres pg_isready -U postgres 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Database ready!" -ForegroundColor Green
            break
        }
    } catch {
        # Ignore errors during readiness check
    }

    Write-Host "  Waiting for database..." -ForegroundColor Yellow
    Start-Sleep -Seconds 1
    $attempt++
}

if ($attempt -ge $maxAttempts) {
    Write-Host "[ERROR] Database failed to become ready after ${maxAttempts}s" -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "[3/5] Running migrations (adding organizations table and RLS policies)..." -ForegroundColor Green
npm run db:push
Write-Host ""

Write-Host "[4/5] Seeding multi-tenant test data..." -ForegroundColor Green
npm run seed:multi-tenant
Write-Host ""

Write-Host "[5/5] Verifying setup..." -ForegroundColor Green
Write-Host ""

# Check organizations
$orgCount = docker exec povc_postgres psql -U postgres -d povc_dev -tAc "SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL;"

if ([int]$orgCount -ge 2) {
    Write-Host "[SUCCESS] Found $orgCount organizations" -ForegroundColor Green
    docker exec povc_postgres psql -U postgres -d povc_dev -c "SELECT id, slug, name FROM organizations WHERE deleted_at IS NULL ORDER BY id;"
} else {
    Write-Host "[WARN] Expected at least 2 organizations, found $orgCount" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Start API server with tenant context:" -ForegroundColor White
Write-Host "     `$env:DEFAULT_ORG_SLUG='tech-ventures'; npm run dev:api" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Or use VSCode launch configurations (F5):" -ForegroundColor White
Write-Host "     - API Server (Tech Ventures Tenant)" -ForegroundColor Gray
Write-Host "     - API Server (Bio Capital Tenant)" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Run RLS isolation tests:" -ForegroundColor White
Write-Host "     npm run test:rls" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. Access database tools:" -ForegroundColor White
Write-Host "     - pgAdmin: http://localhost:8080" -ForegroundColor Gray
Write-Host "     - Drizzle Studio: npm run db:studio" -ForegroundColor Gray
Write-Host ""
Write-Host "  5. Read the developer guide:" -ForegroundColor White
Write-Host "     docs/RLS-DEVELOPMENT-GUIDE.md" -ForegroundColor Gray
Write-Host ""
Write-Host "Available VSCode Snippets:" -ForegroundColor Cyan
Write-Host "  - Type 'rls-' and press Tab for RLS patterns" -ForegroundColor Gray
Write-Host "  - rls-policy-full: Complete CRUD policy suite" -ForegroundColor Gray
Write-Host "  - rls-test-isolation: Cross-tenant test template" -ForegroundColor Gray
Write-Host ""
Write-Host "Tenant Switching in Code:" -ForegroundColor Cyan
Write-Host "  import { withTenantContext } from '@/lib/tenant-context';" -ForegroundColor Gray
Write-Host "  const data = await withTenantContext(db, 'tech-ventures', async () => {" -ForegroundColor Gray
Write-Host "    return await db.select().from(fundsTable);" -ForegroundColor Gray
Write-Host "  });" -ForegroundColor Gray
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
