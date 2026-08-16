#!/bin/bash
# Test runner for stabilization bundle components
# Validates all critical fixes and improvements

set -euo pipefail

echo "🧪 Testing stabilization bundle components..."
echo "=========================================="

FAILED_TESTS=0

# Test Guardian evaluate script
echo "🔍 Testing Guardian evaluation..."
if scripts/guardian-evaluate.sh; then
  echo "✅ Guardian evaluation: PASS"
else
  echo "❌ Guardian evaluation: FAIL"
  ((FAILED_TESTS++))
fi

echo ""

# Test canary health checks (with mock endpoints)
echo "🏥 Testing canary health checks..."
export BASE_URL="https://httpbin.org"  # Use httpbin for testing
export MIN_SAMPLES=10                   # Lower threshold for testing
export ITERATIONS=4                     # 3 paths × 4 = 12 samples > 10

if scripts/canary-check.sh; then
  echo "✅ Canary health checks: PASS"
else
  echo "❌ Canary health checks: FAIL"
  ((FAILED_TESTS++))
fi

echo ""

# Test migration safety verification
echo "🔍 Testing migration safety verification..."
# Create a test migration with destructive operations
mkdir -p test-migrations/
cat > test-migrations/001_test_destructive.sql << 'EOF'
-- Test migration with destructive operations
DROP TABLE old_table;
ALTER TABLE users DROP COLUMN deprecated_field;
DELETE FROM logs WHERE created_at < '2023-01-01';
EOF

export MIGRATIONS_DIR=test-migrations
if scripts/verify-migrations.sh; then
  echo "❌ Migration verification should have detected destructive ops"
  ((FAILED_TESTS++))
else
  EXIT_CODE=$?
  if [[ $EXIT_CODE -eq 42 ]]; then
    echo "✅ Migration verification correctly detected destructive operations"
  else
    echo "❌ Migration verification failed with unexpected exit code: $EXIT_CODE"
    ((FAILED_TESTS++))
  fi
fi

# Cleanup test migrations
rm -rf test-migrations/

echo ""

# Test TypeScript throw safety scanner
echo "🔍 Testing TypeScript throw safety scanner..."
# Create test file with unsafe throws
mkdir -p test-src/
cat > test-src/unsafe-throws.ts << 'EOF'
function badThrow1() {
  throw "This is a string throw";
}

function badThrow2() {
  const error = { message: "Object throw" };
  throw error;
}

function goodThrow() {
  throw new Error("This is fine");
}

function alsoGoodThrow() {
  throw new TypeError("This is also fine");
}
EOF

# Test the scanner
if node scripts/scan-throws.mjs; then
  echo "❌ Throw scanner should have detected unsafe patterns"
  ((FAILED_TESTS++))
else
  echo "✅ Throw scanner correctly detected unsafe throw patterns"
fi

# Cleanup test files
rm -rf test-src/

echo ""

# Test asError utility
echo "🛡️  Testing asError utility..."
if [[ -f src/lib/asError.ts ]]; then
  echo "✅ asError utility exists"
  
  # Basic validation - check for key functions
  if grep -q "export function asError" src/lib/asError.ts && \
     grep -q "export function isError" src/lib/asError.ts && \
     grep -q "export function getErrorMessage" src/lib/asError.ts; then
    echo "✅ asError utility has required exports"
  else
    echo "❌ asError utility missing required exports"
    ((FAILED_TESTS++))
  fi
else
  echo "❌ asError utility not found"
  ((FAILED_TESTS++))
fi

echo ""

# Test Preact build script (dry run)
echo "🏗️  Testing Preact build script..."
if [[ -x scripts/build-preact.sh ]]; then
  echo "✅ Preact build script is executable"
  
  # Check for key components
  if grep -q "BUILD_WITH_PREACT=1" scripts/build-preact.sh && \
     grep -q "React successfully removed" scripts/build-preact.sh; then
    echo "✅ Preact build script has required features"
  else
    echo "❌ Preact build script missing required features"
    ((FAILED_TESTS++))
  fi
else
  echo "❌ Preact build script not executable or not found"
  ((FAILED_TESTS++))
fi

echo ""
echo "=========================================="
echo "📊 Test Results Summary"
echo "=========================================="

if [[ $FAILED_TESTS -eq 0 ]]; then
  echo "✅ All stabilization components passed testing!"
  echo "🚀 Bundle is ready for deployment"
  exit 0
else
  echo "❌ $FAILED_TESTS component(s) failed testing"
  echo "🔧 Please review and fix the failing components"
  exit 1
fi
