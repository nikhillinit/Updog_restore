#!/bin/bash
# scripts/validate-schema-drift.sh
#
# Deterministic validation of schema alignment across layers:
# 1. Migrations (SQL) <-> Drizzle schema
# 2. Drizzle schema <-> Zod schemas
# 3. Zod schemas <-> Mock factories
#
# Exit codes:
#   0 - All layers aligned
#   1 - Drift detected (details in output)
#
# Usage:
#   ./scripts/validate-schema-drift.sh           # Check all layers
#   ./scripts/validate-schema-drift.sh --verbose # Detailed output
#   ./scripts/validate-schema-drift.sh --fix     # Show fix suggestions
#
# Environment variables:
#   USE_EMOJI=false     # Disable emoji output

set -euo pipefail

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

USE_EMOJI=${USE_EMOJI:-true}
VERBOSE=${VERBOSE:-false}
SHOW_FIX=${SHOW_FIX:-false}
DRIFT_FOUND=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

#------------------------------------------------------------------------------
# Dependency Checks
#------------------------------------------------------------------------------

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: Required command '$1' not found. Please install it."
    exit 1
  }
}

require_cmd grep
require_cmd sort

#------------------------------------------------------------------------------
# Logging Functions (emoji-configurable)
#------------------------------------------------------------------------------

log_success() {
  if [[ "$USE_EMOJI" == "true" ]]; then
    echo -e "${GREEN}[OK] $1${NC}"
  else
    echo -e "${GREEN}OK: $1${NC}"
  fi
}

log_warning() {
  if [[ "$USE_EMOJI" == "true" ]]; then
    echo -e "${YELLOW}[WARN] $1${NC}"
  else
    echo -e "${YELLOW}WARN: $1${NC}"
  fi
}

log_error() {
  if [[ "$USE_EMOJI" == "true" ]]; then
    echo -e "${RED}[ERR] $1${NC}"
  else
    echo -e "${RED}ERROR: $1${NC}"
  fi
}

log_info() {
  if [[ "$USE_EMOJI" == "true" ]]; then
    echo -e "${BLUE}[INFO] $1${NC}"
  else
    echo -e "${BLUE}INFO: $1${NC}"
  fi
}

log_verbose() {
  [[ "$VERBOSE" == "true" ]] && echo -e "   $1" || true
}

#------------------------------------------------------------------------------
# Standard Failure Block (for subagent handoff)
#------------------------------------------------------------------------------

emit_failure_block() {
  local title=$1
  local summary=$2
  local cause=$3
  local next_step=$4
  local subagent=${5:-""}

  echo ""
  echo "==============================================================================="
  echo "VALIDATION FAILED: $title"
  echo "==============================================================================="
  echo "SUMMARY: $summary"
  echo "PROBABLE_CAUSE: $cause"
  if [[ -n "$subagent" ]]; then
    echo "INVOKE_SUBAGENT: $subagent"
  fi
  echo "NEXT_STEP: $next_step"
  echo "==============================================================================="
  echo ""
}

# Parse arguments
for arg in "$@"; do
  case $arg in
    --verbose|-v)
      VERBOSE=true
      ;;
    --fix|-f)
      SHOW_FIX=true
      ;;
  esac
done

# Extract column names from SQL migration files
extract_sql_columns() {
  local table_name=$1
  local migration_dir=${2:-"migrations"}

  # Find CREATE TABLE and ALTER TABLE ADD COLUMN statements
  grep -rh "CREATE TABLE.*${table_name}\|ALTER TABLE.*${table_name}.*ADD" "$migration_dir" 2>/dev/null | \
    grep -oE '[a-z_]+\s+(TEXT|INTEGER|REAL|BLOB|VARCHAR|TIMESTAMP|BOOLEAN|SERIAL|UUID|NUMERIC|DECIMAL|BIGINT|SMALLINT|DATE|JSONB|JSON)' | \
    awk '{print $1}' | \
    sort -u || true
}

# Extract column names from Drizzle schema files
extract_drizzle_columns() {
  local table_name=$1
  local schema_dir=${2:-"server/db/schema"}

  # Look for table definition and extract column names
  # Pattern: columnName: type(...)
  grep -A 100 "export const ${table_name}" "$schema_dir"/*.ts 2>/dev/null | \
    grep -E "^\s+[a-z][a-zA-Z_]+:" | \
    sed 's/:.*//' | \
    tr -d ' \t' | \
    sort -u || true
}

# Extract field names from Zod schemas
extract_zod_fields() {
  local schema_name=$1
  local schema_dir=${2:-"shared/schemas"}

  # Look for z.object({ field: z.type() })
  grep -A 100 "export const ${schema_name}" "$schema_dir"/*.ts 2>/dev/null | \
    grep -E "^\s+[a-z][a-zA-Z_]+:" | \
    sed 's/:.*//' | \
    tr -d ' \t' | \
    sort -u || true
}

# Extract fields from mock factories
extract_mock_fields() {
  local factory_name=$1
  local mock_dir=${2:-"server/tests/mocks"}

  # Look for factory function returning object
  grep -A 50 "function.*${factory_name}\|const ${factory_name}" "$mock_dir"/*.ts 2>/dev/null | \
    grep -E "^\s+\w+:" | \
    sed 's/:.*//' | \
    tr -d ' \t' | \
    sort -u || true
}

# Compare two lists and report differences
compare_columns() {
  local layer1_name=$1
  local layer1_columns=$2
  local layer2_name=$3
  local layer2_columns=$4

  local missing_in_layer2=$(comm -23 <(echo "$layer1_columns" | sort) <(echo "$layer2_columns" | sort) 2>/dev/null || true)
  local extra_in_layer2=$(comm -13 <(echo "$layer1_columns" | sort) <(echo "$layer2_columns" | sort) 2>/dev/null || true)

  if [[ -n "$missing_in_layer2" ]]; then
    log_error "Fields in $layer1_name but missing in $layer2_name:"
    echo "$missing_in_layer2" | while read -r col; do
      [[ -n "$col" ]] && echo "      - $col"
    done
    DRIFT_FOUND=1
  fi

  if [[ -n "$extra_in_layer2" ]]; then
    log_warning "Fields in $layer2_name but not in $layer1_name:"
    echo "$extra_in_layer2" | while read -r col; do
      [[ -n "$col" ]] && echo "      - $col"
    done
    # Extra fields are warnings, not errors (might be computed fields)
  fi

  if [[ -z "$missing_in_layer2" && -z "$extra_in_layer2" ]]; then
    return 0
  fi
  return 1
}

#------------------------------------------------------------------------------
# Schema Mapping Configuration
#------------------------------------------------------------------------------

# Define mappings between layers
# Format: "sql_table:drizzle_export:zod_schema:mock_factory"
# Add your table mappings here

SCHEMA_MAPPINGS=(
  "funds:funds:fundSchema:createMockFund"
  "investors:investors:investorSchema:createMockInvestor"
  "transactions:transactions:transactionSchema:createMockTransaction"
  "commitments:commitments:commitmentSchema:createMockCommitment"
  "distributions:distributions:distributionSchema:createMockDistribution"
  # Add more mappings as needed
)

# Directories (override with environment variables if needed)
MIGRATION_DIR="${MIGRATION_DIR:-migrations}"
DRIZZLE_DIR="${DRIZZLE_DIR:-server/db/schema}"
ZOD_DIR="${ZOD_DIR:-shared/schemas}"
MOCK_DIR="${MOCK_DIR:-server/tests/mocks}"

#------------------------------------------------------------------------------
# Validation Functions
#------------------------------------------------------------------------------

validate_migration_to_drizzle() {
  local sql_table=$1
  local drizzle_export=$2

  log_info "Checking: Migration ($sql_table) <-> Drizzle ($drizzle_export)"

  local sql_cols drizzle_cols
  sql_cols=$(extract_sql_columns "$sql_table" "$MIGRATION_DIR")
  drizzle_cols=$(extract_drizzle_columns "$drizzle_export" "$DRIZZLE_DIR")

  if [[ -z "$sql_cols" ]]; then
    log_warning "Could not extract columns from migrations for table: $sql_table"
    return 0
  fi

  if [[ -z "$drizzle_cols" ]]; then
    log_warning "Could not find Drizzle schema export: $drizzle_export"
    return 0
  fi

  log_verbose "SQL columns: $(echo "$sql_cols" | tr '\n' ' ')"
  log_verbose "Drizzle columns: $(echo "$drizzle_cols" | tr '\n' ' ')"

  if compare_columns "Migration" "$sql_cols" "Drizzle" "$drizzle_cols"; then
    log_success "Migration <-> Drizzle aligned for $sql_table"
  fi
}

validate_drizzle_to_zod() {
  local drizzle_export=$1
  local zod_schema=$2

  log_info "Checking: Drizzle ($drizzle_export) <-> Zod ($zod_schema)"

  local drizzle_cols zod_fields
  drizzle_cols=$(extract_drizzle_columns "$drizzle_export" "$DRIZZLE_DIR")
  zod_fields=$(extract_zod_fields "$zod_schema" "$ZOD_DIR")

  if [[ -z "$drizzle_cols" ]]; then
    log_warning "Could not extract columns from Drizzle schema: $drizzle_export"
    return 0
  fi

  if [[ -z "$zod_fields" ]]; then
    log_warning "Could not find Zod schema: $zod_schema (may be intentionally different)"
    return 0
  fi

  log_verbose "Drizzle columns: $(echo "$drizzle_cols" | tr '\n' ' ')"
  log_verbose "Zod fields: $(echo "$zod_fields" | tr '\n' ' ')"

  if compare_columns "Drizzle" "$drizzle_cols" "Zod" "$zod_fields"; then
    log_success "Drizzle <-> Zod aligned for $drizzle_export"
  fi
}

validate_zod_to_mock() {
  local zod_schema=$1
  local mock_factory=$2

  log_info "Checking: Zod ($zod_schema) <-> Mock ($mock_factory)"

  local zod_fields mock_fields
  zod_fields=$(extract_zod_fields "$zod_schema" "$ZOD_DIR")
  mock_fields=$(extract_mock_fields "$mock_factory" "$MOCK_DIR")

  if [[ -z "$zod_fields" ]]; then
    log_warning "Could not extract fields from Zod schema: $zod_schema"
    return 0
  fi

  if [[ -z "$mock_fields" ]]; then
    log_warning "Could not find mock factory: $mock_factory"
    return 0
  fi

  log_verbose "Zod fields: $(echo "$zod_fields" | tr '\n' ' ')"
  log_verbose "Mock fields: $(echo "$mock_fields" | tr '\n' ' ')"

  if compare_columns "Zod" "$zod_fields" "Mock" "$mock_fields"; then
    log_success "Zod <-> Mock aligned for $zod_schema"
  fi
}

#------------------------------------------------------------------------------
# Quick Structural Checks
#------------------------------------------------------------------------------

check_migration_drizzle_table_count() {
  log_info "Checking table counts match..."

  local sql_tables drizzle_tables

  # Count CREATE TABLE statements in migrations
  sql_tables=$(grep -rh "CREATE TABLE" "$MIGRATION_DIR" 2>/dev/null | wc -l || echo "0")

  # Count table exports in Drizzle
  drizzle_tables=$(grep -rh "export const.*pgTable\|export const.*sqliteTable\|export const.*mysqlTable" "$DRIZZLE_DIR" 2>/dev/null | wc -l || echo "0")

  if [[ "$sql_tables" -ne "$drizzle_tables" ]]; then
    log_warning "Table count mismatch: $sql_tables in migrations, $drizzle_tables in Drizzle"
    log_verbose "This may indicate missing Drizzle schemas for some tables"
  else
    log_success "Table counts match: $sql_tables tables"
  fi
}

#------------------------------------------------------------------------------
# Fix Suggestions
#------------------------------------------------------------------------------

suggest_fixes() {
  if [[ "$SHOW_FIX" != "true" || "$DRIFT_FOUND" -eq 0 ]]; then
    return 0
  fi

  echo ""
  log_info "Suggested fixes:"
  echo ""
  echo "  1. For missing Drizzle columns, add to schema file:"
  echo "     server/db/schema/<table>.ts"
  echo ""
  echo "  2. For missing Zod fields, update shared schema:"
  echo "     shared/schemas/<schema>.ts"
  echo ""
  echo "  3. For mock drift, update factory function:"
  echo "     server/tests/mocks/<mock>.ts"
  echo ""
  echo "  4. After fixes, run:"
  echo "     npm run validate:schema-drift"
  echo ""
  echo "  5. If drift is intentional (e.g., computed field), document in:"
  echo "     docs/ADR-schema-drift.md"
}

#------------------------------------------------------------------------------
# Main
#------------------------------------------------------------------------------

main() {
  echo ""
  echo "======================================================="
  echo "  Schema Drift Validation"
  echo "======================================================="
  echo ""

  # Check if directories exist
  if [[ ! -d "$MIGRATION_DIR" ]]; then
    log_warning "Migration directory not found: $MIGRATION_DIR"
  fi

  if [[ ! -d "$DRIZZLE_DIR" ]]; then
    log_warning "Drizzle schema directory not found: $DRIZZLE_DIR"
  fi

  # Quick structural checks
  if [[ -d "$MIGRATION_DIR" && -d "$DRIZZLE_DIR" ]]; then
    check_migration_drizzle_table_count
  fi
  echo ""

  # Validate each schema mapping
  for mapping in "${SCHEMA_MAPPINGS[@]}"; do
    IFS=':' read -r sql_table drizzle_export zod_schema mock_factory <<< "$mapping"

    echo "----------------------------------------------------"
    echo "Table: $sql_table"
    echo "----------------------------------------------------"

    validate_migration_to_drizzle "$sql_table" "$drizzle_export"
    validate_drizzle_to_zod "$drizzle_export" "$zod_schema"
    validate_zod_to_mock "$zod_schema" "$mock_factory"
    echo ""
  done

  # Summary
  echo "======================================================="
  echo "  Summary"
  echo "======================================================="
  echo ""

  if [[ "$DRIFT_FOUND" -eq 1 ]]; then
    log_error "Schema drift detected!"
    echo ""

    # Emit standard failure block for subagent handoff
    emit_failure_block \
      "Schema Drift" \
      "Schema layers are not aligned (Migration/Drizzle/Zod/Mock)" \
      "A schema change was made in one layer without updating dependent layers" \
      "Review drift report above and update misaligned schemas" \
      "schema-drift-checker"

    echo "  To diagnose, invoke schema-drift-checker subagent:"
    echo "    @schema-drift-checker \"Diagnose drift and suggest fixes\""
    echo ""
    suggest_fixes
    exit 1
  else
    log_success "All schema layers aligned (or no mappings to check)!"
    exit 0
  fi
}

main
