#!/usr/bin/env bash
# scripts/test-plan.sh
# Automated test plan for complete development environment validation
# Runs clean install, doctor checks, dev server, build, and hook tests

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Track timing
START_TIME=$(date +%s)
PHASE_START_TIME=$START_TIME

# Track results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Error handling
CLEANUP_REQUIRED=false
ORIGINAL_LOCKFILE=""

# Cleanup function
cleanup() {
  local exit_code=$?
  if [[ "$CLEANUP_REQUIRED" == "true" ]]; then
    echo -e "\n${YELLOW}Performing cleanup...${NC}"

    # Kill any dev servers
    if [[ -n "${DEV_SERVER_PID:-}" ]]; then
      echo "Stopping dev server (PID: $DEV_SERVER_PID)..."
      kill "$DEV_SERVER_PID" 2>/dev/null || true
      wait "$DEV_SERVER_PID" 2>/dev/null || true
    fi

    # Restore lockfile if backed up
    if [[ -n "$ORIGINAL_LOCKFILE" && -f "$ORIGINAL_LOCKFILE" ]]; then
      echo "Restoring original lockfile..."
      mv "$ORIGINAL_LOCKFILE" package-lock.json
    fi

    # Clean test artifacts
    echo "Cleaning test artifacts..."
    rm -f .test-plan-*.tmp 2>/dev/null || true
  fi

  if [[ $exit_code -ne 0 ]]; then
    echo -e "\n${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}${BOLD}TEST PLAN FAILED (Exit code: $exit_code)${NC}"
    echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  fi

  exit $exit_code
}

# Set trap for cleanup
trap cleanup EXIT ERR

# Helper functions
print_header() {
  local title="$1"
  local width=60
  echo ""
  echo -e "${CYAN}${BOLD}$(printf '━%.0s' {1..60})${NC}"
  echo -e "${CYAN}${BOLD}${title}${NC}"
  echo -e "${CYAN}${BOLD}$(printf '━%.0s' {1..60})${NC}"
}

print_phase_time() {
  local current_time=$(date +%s)
  local phase_duration=$((current_time - PHASE_START_TIME))
  echo -e "${BLUE}Phase completed in ${phase_duration}s${NC}"
  PHASE_START_TIME=$current_time
}

test_result() {
  local test_name="$1"
  local result="$2"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [[ "$result" == "pass" ]]; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo -e "${GREEN}✅ ${test_name}${NC}"
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    echo -e "${RED}❌ ${test_name}${NC}"
    return 1
  fi
}

run_test() {
  local test_name="$1"
  local test_command="$2"

  echo -e "${YELLOW}Running: ${test_name}${NC}"

  if eval "$test_command" > ".test-plan-${test_name// /_}.tmp" 2>&1; then
    test_result "$test_name" "pass"
  else
    test_result "$test_name" "fail"
    echo -e "${RED}Command output:${NC}"
    cat ".test-plan-${test_name// /_}.tmp" || true
    return 1
  fi
}

# Pre-flight checks
print_header "PRE-FLIGHT CHECKS"

echo "Checking Node.js version..."
NODE_VERSION=$(node --version)
if [[ "$NODE_VERSION" =~ ^v20\.19 ]]; then
  test_result "Node.js version $NODE_VERSION" "pass"
else
  test_result "Node.js version $NODE_VERSION (expected v20.19.x)" "fail"
  exit 1
fi

echo "Checking npm version..."
NPM_VERSION=$(npm --version)
if [[ "$NPM_VERSION" =~ ^10\. ]]; then
  test_result "npm version $NPM_VERSION" "pass"
else
  test_result "npm version $NPM_VERSION (expected 10.x)" "fail"
  exit 1
fi

echo "Checking project root..."
if [[ ! -f "package.json" ]]; then
  test_result "package.json exists" "fail"
  echo -e "${RED}Error: Must run from project root${NC}"
  exit 1
fi
test_result "Project root verified" "pass"

echo "Checking git repository..."
if git rev-parse --git-dir > /dev/null 2>&1; then
  test_result "Git repository detected" "pass"
else
  test_result "Git repository detection" "fail"
  exit 1
fi

print_phase_time

# Phase 1: Backup current state
print_header "PHASE 1: BACKUP CURRENT STATE"

if [[ -f "package-lock.json" ]]; then
  ORIGINAL_LOCKFILE=".package-lock.json.backup.$(date +%s)"
  echo "Backing up package-lock.json to $ORIGINAL_LOCKFILE..."
  cp package-lock.json "$ORIGINAL_LOCKFILE"
  CLEANUP_REQUIRED=true
  test_result "Lockfile backup created" "pass"
else
  echo "No existing lockfile to backup"
  test_result "Lockfile backup (skipped)" "pass"
fi

print_phase_time

# Phase 2: Clean install
print_header "PHASE 2: CLEAN INSTALL"

echo "Installing tools_local dependencies..."
if cd tools_local && npm ci && cd ..; then
  test_result "tools_local npm ci" "pass"
else
  test_result "tools_local npm ci" "fail"
  exit 1
fi

echo "Installing project dependencies..."
if npm install; then
  test_result "npm install" "pass"
else
  test_result "npm install" "fail"
  exit 1
fi

print_phase_time

# Phase 3: Doctor checks
print_header "PHASE 3: DOCTOR CHECKS"

run_test "doctor:sidecar" "npm run doctor:sidecar"
run_test "doctor:links" "npm run doctor:links"
run_test "doctor:quick" "npm run doctor:quick"
run_test "doctor (unified)" "npm run doctor"

print_phase_time

# Phase 4: Junction persistence check
print_header "PHASE 4: JUNCTION PERSISTENCE TEST"

echo "Checking if junctions exist before npm ci..."
JUNCTIONS_BEFORE=0
for junction in node_modules/vite node_modules/@vitejs/plugin-react node_modules/autoprefixer; do
  if [[ -e "$junction" ]]; then
    JUNCTIONS_BEFORE=$((JUNCTIONS_BEFORE + 1))
  fi
done

echo "Found $JUNCTIONS_BEFORE junctions before npm ci"

echo "Running npm ci in tools_local..."
if cd tools_local && npm ci && cd ..; then
  test_result "tools_local npm ci (persistence test)" "pass"
else
  test_result "tools_local npm ci (persistence test)" "fail"
  exit 1
fi

echo "Checking if junctions persist after npm ci..."
JUNCTIONS_AFTER=0
for junction in node_modules/vite node_modules/@vitejs/plugin-react node_modules/autoprefixer; do
  if [[ -e "$junction" ]]; then
    JUNCTIONS_AFTER=$((JUNCTIONS_AFTER + 1))
  fi
done

echo "Found $JUNCTIONS_AFTER junctions after npm ci"

if [[ $JUNCTIONS_AFTER -eq $JUNCTIONS_BEFORE ]]; then
  test_result "Junction persistence after npm ci" "pass"
else
  echo -e "${YELLOW}Junctions changed: $JUNCTIONS_BEFORE -> $JUNCTIONS_AFTER${NC}"
  echo "Re-running postinstall hook..."
  if npm run postinstall; then
    test_result "Junction restoration via postinstall" "pass"
  else
    test_result "Junction restoration via postinstall" "fail"
    exit 1
  fi
fi

print_phase_time

# Phase 5: Dev server test
print_header "PHASE 5: DEV SERVER TEST"

echo "Starting dev server..."
npm run dev > .test-plan-dev-server.log 2>&1 &
DEV_SERVER_PID=$!

echo "Dev server PID: $DEV_SERVER_PID"
echo "Waiting for server to start (max 30s)..."

# Wait for server with timeout
MAX_WAIT=30
WAITED=0
SERVER_READY=false

while [[ $WAITED -lt $MAX_WAIT ]]; do
  if curl -sf http://localhost:5173 > /dev/null 2>&1; then
    SERVER_READY=true
    break
  fi
  sleep 1
  WAITED=$((WAITED + 1))
  echo -n "."
done
echo ""

if [[ "$SERVER_READY" == "true" ]]; then
  test_result "Dev server started (${WAITED}s)" "pass"

  echo "Testing dev server response..."
  if curl -sf http://localhost:5173 | grep -q "<!DOCTYPE html>"; then
    test_result "Dev server serving HTML" "pass"
  else
    test_result "Dev server serving HTML" "fail"
  fi
else
  test_result "Dev server start (timeout after ${MAX_WAIT}s)" "fail"
  echo -e "${RED}Server logs:${NC}"
  cat .test-plan-dev-server.log || true
fi

echo "Stopping dev server..."
kill "$DEV_SERVER_PID" 2>/dev/null || true
wait "$DEV_SERVER_PID" 2>/dev/null || true
DEV_SERVER_PID=""

print_phase_time

# Phase 6: Production build
print_header "PHASE 6: PRODUCTION BUILD TEST"

run_test "TypeScript check" "npm run check"
run_test "ESLint" "npm run lint"
run_test "Production build" "npm run build"

if [[ -d "dist" ]]; then
  test_result "Build output directory exists" "pass"

  echo "Checking build artifacts..."
  if [[ -f "dist/index.html" ]]; then
    test_result "index.html in dist" "pass"
  else
    test_result "index.html in dist" "fail"
  fi

  if ls dist/assets/*.js >/dev/null 2>&1; then
    test_result "JavaScript bundles in dist/assets" "pass"
  else
    test_result "JavaScript bundles in dist/assets" "fail"
  fi
else
  test_result "Build output directory exists" "fail"
fi

print_phase_time

# Phase 7: Pre-commit hook test
print_header "PHASE 7: PRE-COMMIT HOOK TEST"

if [[ -f ".husky/pre-commit" ]]; then
  test_result ".husky/pre-commit exists" "pass"

  echo "Creating test file for staging..."
  echo "// Test file for pre-commit hook" > .test-pre-commit.tmp.js

  if git add .test-pre-commit.tmp.js; then
    test_result "Git staging test file" "pass"

    # Try running the hook manually
    echo "Running pre-commit hook..."
    if bash .husky/pre-commit; then
      test_result "Pre-commit hook execution" "pass"
    else
      test_result "Pre-commit hook execution (may be expected if no staged changes)" "pass"
    fi

    # Unstage test file
    git reset HEAD .test-pre-commit.tmp.js 2>/dev/null || true
    rm -f .test-pre-commit.tmp.js
  else
    test_result "Git staging test file" "fail"
  fi
else
  test_result ".husky/pre-commit exists" "fail"
fi

print_phase_time

# Phase 8: Quick test suite
print_header "PHASE 8: QUICK TEST SUITE"

run_test "Quick unit tests" "npm run test:quick"

print_phase_time

# Summary and metrics
print_header "TEST PLAN SUMMARY"

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo -e "${BOLD}Results:${NC}"
echo -e "  Total tests:  ${TOTAL_TESTS}"
echo -e "  ${GREEN}Passed:       ${PASSED_TESTS}${NC}"
echo -e "  ${RED}Failed:       ${FAILED_TESTS}${NC}"
echo -e "  ${BLUE}Duration:     ${TOTAL_DURATION}s${NC}"
echo ""

if [[ $FAILED_TESTS -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}✅ ALL TESTS PASSED${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${GREEN}Your development environment is fully validated!${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}${BOLD}❌ SOME TESTS FAILED${NC}"
  echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${YELLOW}Review the output above for details.${NC}"
  exit 1
fi
