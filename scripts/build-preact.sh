#!/bin/bash
# Preact build script with parity verification
# Ensures React/Preact builds produce equivalent bundles
# Usage: ./scripts/build-preact.sh [--verify-parity]

set -euo pipefail

VERIFY_PARITY="${VERIFY_PARITY:-false}"
if [[ "$1" == "--verify-parity" ]]; then
  VERIFY_PARITY=true
fi

echo "🏗️  Building Preact version..."

# Clean previous builds
rm -rf dist/

# Set environment variables for Preact build
export BUILD_WITH_PREACT=1
export VITE_SENTRY_DSN=""  # Disable Sentry for cleaner bundle analysis

# Build with Preact
echo "📦 Compiling with Preact substitution..."
npm run build

# Analyze bundle
if command -v du >/dev/null 2>&1; then
  BUNDLE_SIZE=$(du -sh dist/public/assets/*.js 2>/dev/null | awk '{sum+=$1} END {print sum "K"}' || echo "unknown")
  echo "📊 Preact bundle size: $BUNDLE_SIZE"
fi

# Verify no React remnants
echo "🔍 Verifying React removal..."
REACT_FOUND=false

# Check for React signatures in built files
if find dist/public/assets -name "*.js" -exec grep -l "React\|__SECRET_INTERNALS\|react.production" {} \; 2>/dev/null | head -1; then
  echo "⚠️  React signatures found in Preact build!"
  REACT_FOUND=true
fi

# Check for React imports
if find dist/public/assets -name "*.js" -exec grep -l "from.*react" {} \; 2>/dev/null | head -1; then
  echo "⚠️  React imports found in Preact build!"
  REACT_FOUND=true
fi

if [[ "$REACT_FOUND" == false ]]; then
  echo "✅ React successfully removed from Preact build"
else
  echo "❌ React contamination detected in Preact build"
  exit 1
fi

# Parity verification (optional)
if [[ "$VERIFY_PARITY" == true ]]; then
  echo "🧪 Running React/Preact parity test..."
  
  # Build React version for comparison
  echo "📦 Building React version for comparison..."
  rm -rf dist-react/
  mkdir -p dist-react/
  
  unset BUILD_WITH_PREACT
  export VITE_SENTRY_DSN=""
  npm run build
  mv dist/public dist-react/
  
  # Compare critical files
  echo "🔍 Comparing bundle structures..."
  
  # Check that both builds have the same entry points
  PREACT_ENTRIES=$(find dist/public/assets -name "index-*.js" | wc -l)
  REACT_ENTRIES=$(find dist-react/public/assets -name "index-*.js" | wc -l)
  
  if [[ "$PREACT_ENTRIES" == "$REACT_ENTRIES" ]]; then
    echo "✅ Entry point count matches: $PREACT_ENTRIES"
  else
    echo "⚠️  Entry point mismatch: Preact=$PREACT_ENTRIES, React=$REACT_ENTRIES"
  fi
  
  # Size comparison
  if command -v du >/dev/null 2>&1; then
    PREACT_SIZE=$(du -sb dist/public/assets/*.js 2>/dev/null | awk '{sum+=$1} END {print sum}' || echo "0")
    REACT_SIZE=$(du -sb dist-react/public/assets/*.js 2>/dev/null | awk '{sum+=$1} END {print sum}' || echo "0")
    
    if [[ "$PREACT_SIZE" -lt "$REACT_SIZE" ]]; then
      SAVINGS=$((REACT_SIZE - PREACT_SIZE))
      PERCENT=$((SAVINGS * 100 / REACT_SIZE))
      echo "✅ Preact bundle is ${SAVINGS} bytes smaller (${PERCENT}% reduction)"
    else
      echo "⚠️  Preact bundle is not smaller than React"
    fi
  fi
  
  # Cleanup comparison build
  rm -rf dist-react/
fi

echo "🎉 Preact build complete!"
echo "📁 Output: dist/public/"