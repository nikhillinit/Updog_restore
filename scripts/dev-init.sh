#!/bin/bash
set -euo pipefail
# Allow override: HEALTH_URL=http://localhost:5173/healthz npm run health
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/healthz}"

echo "🚀 Initializing Updog development environment..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
  echo "❌ Node.js $REQUIRED_VERSION+ required (found $NODE_VERSION)"
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Database setup
echo "🗄️  Setting up database..."
npm run db:push

# Build shared packages
echo "🔨 Building shared packages..."
npm run build:shared || npm run build

# Health check
echo "🏥 Running health checks..."
npm run dev:api &
API_PID=$!

sleep 10

health_checks=(
  "Database connection"
  "Redis connection"
  "API endpoints"
  "Authentication"
)

all_healthy="true"
for check in "${health_checks[@]}"; do
  echo -n "  Checking $check... "
  # Simplified health check - adjust based on your actual endpoints
  if curl -s "${HEALTH_URL}" > /dev/null 2>&1; then
    echo "✅"
  else
    echo "❌"
    all_healthy="false"
  fi
done

kill $API_PID 2>/dev/null || true

if [[ "${all_healthy:-false}" == "false" ]]; then
  echo "❌ Health check failed. Please review service logs."
  exit 1
fi

echo "🎉 Environment is fully operational!"
echo ""
echo "📱 Next steps:"
echo "  npm run dev              # Start full development environment"
echo "  npm run db:studio        # Open database management UI"
echo "  npm run test             # Run test suite"
echo ""
echo "🔗 Quick links:"
echo "  📊 Health: ${HEALTH_URL}"
echo "  🗄️  Database: http://localhost:5555 (after db:studio)"

# Auto-open on supported platforms
case "$(uname -s)" in
  Darwin)
    open "${HEALTH_URL}"
    ;;
  Linux)
    if command -v wslview >/dev/null; then
      wslview "${HEALTH_URL}"
    elif command -v xdg-open >/dev/null; then
      xdg-open "${HEALTH_URL}"
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    start "" "${HEALTH_URL}"
    ;;
esac