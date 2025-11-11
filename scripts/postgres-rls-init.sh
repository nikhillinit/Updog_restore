#!/bin/bash
# PostgreSQL RLS Initialization Script
# Runs automatically on first Docker container start
# Purpose: Verify RLS setup and provide helpful debug output

set -e

echo "[RLS INIT] Starting Row-Level Security initialization..."

# Wait for PostgreSQL to be ready
until psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; do
  echo "[RLS INIT] Waiting for PostgreSQL to be ready..."
  sleep 1
done

echo "[RLS INIT] PostgreSQL is ready"

# Check if organizations table exists
ORG_EXISTS=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizations');")

if [ "$ORG_EXISTS" = "t" ]; then
  echo "[RLS INIT] SUCCESS - Organizations table exists"

  # Check RLS is enabled on tenant tables
  echo "[RLS INIT] Verifying RLS policies..."

  TABLES=("funds" "portfoliocompanies" "investments" "fundconfigs")

  for table in "${TABLES[@]}"; do
    RLS_ENABLED=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT relrowsecurity FROM pg_class WHERE relname = '$table';")
    POLICY_COUNT=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM pg_policies WHERE tablename = '$table';")

    if [ "$RLS_ENABLED" = "t" ]; then
      echo "[RLS INIT]   [OK] $table: RLS enabled, $POLICY_COUNT policies"
    else
      echo "[RLS INIT]   [WARN] $table: RLS not enabled"
    fi
  done

  # Check if seed data exists
  ORG_COUNT=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL;")

  if [ "$ORG_COUNT" -gt 0 ]; then
    echo "[RLS INIT] SUCCESS - Found $ORG_COUNT organizations"
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, slug, name FROM organizations WHERE deleted_at IS NULL ORDER BY id;"
  else
    echo "[RLS INIT] INFO - No organizations found. Run: npm run seed:multi-tenant"
  fi

  # Verify helper functions exist
  FUNCTIONS=("switch_tenant" "reset_tenant" "get_tenant" "current_org_id")
  echo "[RLS INIT] Verifying helper functions..."

  for func in "${FUNCTIONS[@]}"; do
    FUNC_EXISTS=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '$func');")
    if [ "$FUNC_EXISTS" = "t" ]; then
      echo "[RLS INIT]   [OK] $func() available"
    else
      echo "[RLS INIT]   [ERROR] $func() not found"
    fi
  done

else
  echo "[RLS INIT] INFO - Organizations table not found"
  echo "[RLS INIT] INFO - Run migrations: npm run db:push"
  echo "[RLS INIT] INFO - Then seed data: npm run seed:multi-tenant"
fi

echo "[RLS INIT] Initialization complete"
echo ""
echo "=================================================="
echo "Multi-Tenant RLS Development Environment"
echo "=================================================="
echo ""
echo "Quick Start:"
echo "  1. npm run db:push          # Apply migrations"
echo "  2. npm run seed:multi-tenant  # Create test data"
echo "  3. npm run dev:api          # Start API server"
echo ""
echo "Tenant Switching:"
echo "  - VSCode: Press F5 -> Select tenant context"
echo "  - CLI: DEFAULT_ORG_SLUG=tech-ventures npm run dev:api"
echo ""
echo "Database Access:"
echo "  - pgAdmin: http://localhost:8080"
echo "  - psql: psql postgresql://postgres:postgres@localhost:5432/povc_dev"
echo ""
echo "Documentation:"
echo "  - docs/RLS-DEVELOPMENT-GUIDE.md"
echo "  - VSCode snippets: Type 'rls-' and press Tab"
echo ""
echo "=================================================="
