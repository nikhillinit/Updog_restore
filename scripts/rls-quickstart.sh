#!/bin/bash
# RLS Quick Start Script
# Automates complete setup of multi-tenant RLS development environment

set -e

echo "=================================================="
echo "Multi-Tenant RLS Development Environment Setup"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}[ERROR]${NC} Docker is not running. Please start Docker Desktop."
  exit 1
fi

echo -e "${GREEN}[1/5]${NC} Starting PostgreSQL container..."
docker compose up -d postgres
echo ""

echo -e "${GREEN}[2/5]${NC} Waiting for PostgreSQL to be ready..."
sleep 3
until docker exec povc_postgres pg_isready -U postgres > /dev/null 2>&1; do
  echo "  Waiting for database..."
  sleep 1
done
echo "  Database ready!"
echo ""

echo -e "${GREEN}[3/5]${NC} Running migrations (adding organizations table and RLS policies)..."
npm run db:push
echo ""

echo -e "${GREEN}[4/5]${NC} Seeding multi-tenant test data..."
npm run seed:multi-tenant
echo ""

echo -e "${GREEN}[5/5]${NC} Verifying setup..."
echo ""

# Check organizations
ORG_COUNT=$(docker exec povc_postgres psql -U postgres -d povc_dev -tAc "SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL;")

if [ "$ORG_COUNT" -ge 2 ]; then
  echo -e "${GREEN}[SUCCESS]${NC} Found $ORG_COUNT organizations"
  docker exec povc_postgres psql -U postgres -d povc_dev -c "SELECT id, slug, name FROM organizations WHERE deleted_at IS NULL ORDER BY id;"
else
  echo -e "${YELLOW}[WARN]${NC} Expected at least 2 organizations, found $ORG_COUNT"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=================================================="
echo ""
echo "Next Steps:"
echo ""
echo "  1. Start API server with tenant context:"
echo "     DEFAULT_ORG_SLUG=tech-ventures npm run dev:api"
echo ""
echo "  2. Or use VSCode launch configurations (F5):"
echo "     - API Server (Tech Ventures Tenant)"
echo "     - API Server (Bio Capital Tenant)"
echo ""
echo "  3. Run RLS isolation tests:"
echo "     npm run test:rls"
echo ""
echo "  4. Access database tools:"
echo "     - pgAdmin: http://localhost:8080"
echo "     - Drizzle Studio: npm run db:studio"
echo ""
echo "  5. Read the developer guide:"
echo "     docs/RLS-DEVELOPMENT-GUIDE.md"
echo ""
echo "Available VSCode Snippets:"
echo "  - Type 'rls-' and press Tab for RLS patterns"
echo "  - rls-policy-full: Complete CRUD policy suite"
echo "  - rls-test-isolation: Cross-tenant test template"
echo ""
echo "Tenant Switching in Code:"
echo "  import { withTenantContext } from '@/lib/tenant-context';"
echo "  const data = await withTenantContext(db, 'tech-ventures', async () => {"
echo "    return await db.select().from(fundsTable);"
echo "  });"
echo ""
echo "=================================================="
