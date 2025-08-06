#!/bin/bash

# Comprehensive Testing Pipeline Script - Unix/Linux Version
# Implements the 9-step testing strategy

set -e  # Exit on any error (can be overridden with || true)

# Default configuration
ENVIRONMENT="${ENVIRONMENT:-local}"
BASE_URL="${BASE_URL:-http://localhost:5000}"
PROD_URL="${PROD_URL:-https://updog-restore.vercel.app}"
SKIP_BUILD="${SKIP_BUILD:-false}"
SKIP_E2E="${SKIP_E2E:-false}"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Emojis for better output
SUCCESS="✅"
ERROR="❌"
WARNING="⚠️"
INFO="ℹ️"
ROCKET="🚀"
CHART="📊"
DOCUMENT="📄"

# Functions
print_step() {
    local step_number=$1
    local step_name=$2
    local command=$3
    
    echo -e "\n${CYAN}Step ${step_number}${NC} - ${step_name}"
    if [ -n "$command" ]; then
        echo -e "${YELLOW}Command: ${command}${NC}"
    fi
    echo -e "${GRAY}============================================================${NC}"
}

print_success() {
    echo -e "${GREEN}${SUCCESS} $1${NC}"
}

print_error() {
    echo -e "${RED}${ERROR} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}${WARNING} $1${NC}"
}

print_info() {
    echo -e "${CYAN}${INFO} $1${NC}"
}

test_health_endpoint() {
    local url=$1
    local endpoints=("/healthz" "/api/health" "/health" "/")
    
    for endpoint in "${endpoints[@]}"; do
        if curl -sSf --connect-timeout 10 --max-time 30 "${url}${endpoint}" > /dev/null 2>&1; then
            print_success "Health endpoint ${endpoint} accessible"
            return 0
        fi
    done
    
    print_warning "No health endpoints accessible at $url"
    return 1
}

run_command() {
    local description=$1
    local command=$2
    local allow_failure=${3:-false}
    
    print_info "Running: $description"
    
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${GRAY}$command${NC}"
    fi
    
    if eval "$command"; then
        print_success "$description completed"
        return 0
    else
        if [ "$allow_failure" = "true" ]; then
            print_warning "$description failed (non-critical)"
            return 1
        else
            print_error "$description failed"
            return 1
        fi
    fi
}

# Initialize results tracking
declare -A step_results
start_time=$(date +%s)

# Header
echo -e "\n${ROCKET} ${CYAN}Starting Comprehensive Testing Pipeline${NC}"
echo -e "Environment: ${ENVIRONMENT}"
echo -e "Base URL: ${BASE_URL}"
if [ "$ENVIRONMENT" = "production" ] || [ "$ENVIRONMENT" = "preview" ]; then
    echo -e "Production URL: ${PROD_URL}"
fi
echo -e "${GRAY}============================================================${NC}"

# Step 0: Smoke Test (Production)
if [ "$ENVIRONMENT" = "production" ] || [ "$ENVIRONMENT" = "preview" ]; then
    print_step "0" "Smoke Test (Production)" "curl -sSf $PROD_URL/healthz"
    
    if test_health_endpoint "$PROD_URL"; then
        print_success "Production smoke test passed"
        step_results["0-smoke-prod"]="PASS"
    else
        print_error "Production smoke test failed"
        step_results["0-smoke-prod"]="FAIL"
        if [ "$ENVIRONMENT" = "production" ]; then
            print_error "Production is not accessible. Aborting pipeline."
            exit 1
        fi
    fi
fi

# Step 1: Lint / Type Checking
print_step "1" "Lint / Type Checking" "npm run lint && npx tsc --noEmit"

if run_command "ESLint" "npm run lint" true; then
    step_results["1-lint"]="PASS"
else
    step_results["1-lint"]="FAIL"
fi

if run_command "TypeScript check" "npx tsc --noEmit" true; then
    step_results["1-typecheck"]="PASS"
else
    step_results["1-typecheck"]="WARN"
fi

# Step 2: Unit / Component Tests
print_step "2" "Unit / Component Tests" "npm run test"

if run_command "Unit tests" "npm run test" false; then
    step_results["2-unit"]="PASS"
else
    step_results["2-unit"]="FAIL"
fi

# Step 3: API Integration Tests
print_step "3" "API Integration Tests" "npm run test:api"

# Check if test:api script exists
if npm run --silent test:api --dry-run > /dev/null 2>&1; then
    if run_command "API integration tests" "npm run test:api" true; then
        step_results["3-api"]="PASS"
    else
        step_results["3-api"]="WARN"
    fi
else
    print_warning "API integration tests not configured"
    step_results["3-api"]="SKIP"
fi

# Step 4: Build Verification
if [ "$SKIP_BUILD" != "true" ]; then
    print_step "4" "Build Verification" "npm run build"
    
    if run_command "Build" "npm run build" false; then
        # Check if build output exists
        if [ -f "dist/public/index.html" ] || [ -f "dist/index.html" ] || [ -f "build/index.html" ]; then
            print_success "Build output verified"
            step_results["4-build"]="PASS"
        else
            print_warning "Build completed but output not found at expected location"
            step_results["4-build"]="WARN"
        fi
    else
        step_results["4-build"]="FAIL"
    fi
else
    print_warning "Build step skipped"
    step_results["4-build"]="SKIP"
fi

# Step 5: Static Preview
if [ "${step_results[4-build]}" = "PASS" ] && { [ -d "dist/public" ] || [ -d "dist" ] || [ -d "build" ]; }; then
    print_step "5" "Static Preview" "npx serve dist/public -l 4173"
    
    # Find the correct build directory
    BUILD_DIR=""
    if [ -d "dist/public" ]; then
        BUILD_DIR="dist/public"
    elif [ -d "dist" ]; then
        BUILD_DIR="dist"
    elif [ -d "build" ]; then
        BUILD_DIR="build"
    fi
    
    if [ -n "$BUILD_DIR" ]; then
        # Start static server in background
        npx serve "$BUILD_DIR" -l 4173 > /dev/null 2>&1 &
        SERVER_PID=$!
        
        # Wait for server to start
        sleep 5
        
        # Test static preview
        if test_health_endpoint "http://localhost:4173"; then
            print_success "Static preview server is healthy"
            step_results["5-preview"]="PASS"
        else
            print_warning "Static preview server may not be fully ready"
            step_results["5-preview"]="WARN"
        fi
        
        # Stop the server
        kill $SERVER_PID > /dev/null 2>&1 || true
    else
        print_warning "No build directory found"
        step_results["5-preview"]="SKIP"
    fi
else
    print_warning "Static preview skipped (build not available)"
    step_results["5-preview"]="SKIP"
fi

# Step 6: End-to-End Tests (Local)
if [ "$SKIP_E2E" != "true" ]; then
    print_step "6" "End-to-End Tests (Local)" "npm run test:e2e:smoke && npm run test:e2e:core"
    
    # Install Playwright browsers if needed
    print_info "Installing Playwright browsers..."
    if npx playwright install chromium --with-deps > /dev/null 2>&1; then
        print_success "Playwright browsers installed"
    else
        print_warning "Playwright browser installation had issues"
    fi
    
    # Run smoke tests first
    if run_command "E2E smoke tests" "npm run test:e2e:smoke" false; then
        step_results["6-e2e-smoke"]="PASS"
        
        # Run core tests if smoke passed
        if run_command "E2E core tests" "npm run test:e2e:core" true; then
            step_results["6-e2e-core"]="PASS"
        else
            step_results["6-e2e-core"]="FAIL"
        fi
    else
        step_results["6-e2e-smoke"]="FAIL"
        step_results["6-e2e-core"]="SKIP"
        print_warning "Skipping core E2E tests due to smoke test failure"
    fi
else
    print_warning "E2E tests skipped"
    step_results["6-e2e-smoke"]="SKIP"
    step_results["6-e2e-core"]="SKIP"
fi

# Step 7: End-to-End Tests (Preview/Production)
if [ "$ENVIRONMENT" = "production" ] || [ "$ENVIRONMENT" = "preview" ]; then
    print_step "7" "End-to-End Tests (Preview/Production)" "BASE_URL=$PROD_URL npm run test:e2e:production"
    
    export BASE_URL="$PROD_URL"
    export PROD_URL="$PROD_URL"
    
    if run_command "Production E2E tests" "npm run test:e2e:production" true; then
        step_results["7-e2e-prod"]="PASS"
    else
        step_results["7-e2e-prod"]="FAIL"
    fi
    
    unset BASE_URL PROD_URL
else
    print_warning "Production E2E tests skipped (not production environment)"
    step_results["7-e2e-prod"]="SKIP"
fi

# Step 8: Performance Budget
print_step "8" "Performance Budget" "k6 run tests/performance/k6-load-test.js"

if command -v k6 > /dev/null 2>&1; then
    export BASE_URL="$BASE_URL"
    export TEST_ENVIRONMENT="$ENVIRONMENT"
    
    if run_command "k6 performance tests" "k6 run tests/performance/k6-load-test.js" true; then
        step_results["8-performance"]="PASS"
    else
        step_results["8-performance"]="FAIL"
    fi
    
    unset BASE_URL TEST_ENVIRONMENT
else
    # Fallback to Playwright performance tests
    print_info "k6 not available, running Playwright performance tests..."
    if run_command "Playwright performance tests" "npm run test:e2e:performance" true; then
        step_results["8-performance"]="PASS"
    else
        step_results["8-performance"]="WARN"
    fi
fi

# Step 9: Accessibility
print_step "9" "Accessibility Tests" "npm run test:e2e:accessibility"

if run_command "Accessibility tests" "npm run test:e2e:accessibility" true; then
    step_results["9-accessibility"]="PASS"
else
    step_results["9-accessibility"]="WARN"
fi

# Summary Report
end_time=$(date +%s)
duration=$((end_time - start_time))
duration_formatted=$(date -ud "@$duration" +'%M:%S')

echo -e "\n${CHART} ${CYAN}TEST PIPELINE SUMMARY${NC}"
echo -e "${GRAY}============================================================${NC}"
echo -e "Total Duration: ${duration_formatted}"
echo -e "Environment: ${ENVIRONMENT}"

# Count results
total_steps=${#step_results[@]}
passed_steps=0
failed_steps=0
warn_steps=0
skipped_steps=0

for result in "${step_results[@]}"; do
    case $result in
        "PASS") ((passed_steps++)) ;;
        "FAIL") ((failed_steps++)) ;;
        "WARN") ((warn_steps++)) ;;
        "SKIP") ((skipped_steps++)) ;;
    esac
done

echo -e "\nResults:"
echo -e "  ${GREEN}${SUCCESS} Passed: ${passed_steps}${NC}"
echo -e "  ${RED}${ERROR} Failed: ${failed_steps}${NC}"
echo -e "  ${YELLOW}${WARNING} Warning: ${warn_steps}${NC}"
echo -e "  ${GRAY}⏭️  Skipped: ${skipped_steps}${NC}"

echo -e "\nDetailed Results:"
for step in $(printf '%s\n' "${!step_results[@]}" | sort); do
    result="${step_results[$step]}"
    case $result in
        "PASS") icon="${SUCCESS}"; color="${GREEN}" ;;
        "FAIL") icon="${ERROR}"; color="${RED}" ;;
        "WARN") icon="${WARNING}"; color="${YELLOW}" ;;
        "SKIP") icon="⏭️"; color="${GRAY}" ;;
        *) icon="❓"; color="${NC}" ;;
    esac
    echo -e "  ${color}${icon} ${step}: ${result}${NC}"
done

# Generate JSON report
mkdir -p test-results

cat > test-results/pipeline-report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "duration": ${duration},
  "environment": "${ENVIRONMENT}",
  "baseUrl": "${BASE_URL}",
  "results": {
$(
    first=true
    for step in $(printf '%s\n' "${!step_results[@]}" | sort); do
        [ "$first" = true ] && first=false || echo ","
        echo -n "    \"${step}\": \"${step_results[$step]}\""
    done
)
  },
  "summary": {
    "total": ${total_steps},
    "passed": ${passed_steps},
    "failed": ${failed_steps},
    "warnings": ${warn_steps},
    "skipped": ${skipped_steps},
    "success": $( [ $failed_steps -eq 0 ] && echo "true" || echo "false" )
  }
}
EOF

echo -e "\n${DOCUMENT} ${CYAN}Report saved to: test-results/pipeline-report.json${NC}"

# Exit with appropriate code
if [ $failed_steps -gt 0 ]; then
    echo -e "\n${RED}${ERROR} Pipeline completed with failures${NC}"
    exit 1
else
    echo -e "\n${GREEN}${SUCCESS} Pipeline completed successfully${NC}"
    exit 0
fi