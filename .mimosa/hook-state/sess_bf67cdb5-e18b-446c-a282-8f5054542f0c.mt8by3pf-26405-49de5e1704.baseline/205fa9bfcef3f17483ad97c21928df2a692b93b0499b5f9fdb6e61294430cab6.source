#!/usr/bin/env bash
# -------------------------------------------
# Updog Quickstart – idempotent dev bootstrap
# -------------------------------------------
set -euo pipefail

echo "🚀  Updog Quickstart"
echo "==================="

# -------------------------------------------
# Dependencies & Build
# -------------------------------------------
if [ ! -d node_modules ]; then
  echo "📦  Installing dependencies..."
  npm ci --ignore-scripts
else
  echo "✅  Dependencies already installed"
fi

# -------------------------------------------
# VS Code workspace defaults
# -------------------------------------------
mkdir -p .vscode
if [ ! -f .vscode/settings.json ]; then
  cat > .vscode/settings.json << 'EOF'
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "deployment.csv": true,
    ".perf-baseline": true
  },
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
EOF
  echo "🛠️  VS Code workspace settings added"
fi

# -------------------------------------------
# Git hook – block direct commits to main
# -------------------------------------------
if [ -d .git ]; then
  HOOK=".git/hooks/pre-commit"
  if [[ ! -f $HOOK ]]; then
    cat > "$HOOK" <<'EOF'
#!/bin/sh
# Block direct commits to main unless HUSKY=0
if [ -n "$HUSKY" ] && [ "$HUSKY" = "0" ]; then
  exit 0
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = "main" ]; then
  echo "⛔  Direct commits to main blocked. Create a feature branch:"
  echo "    git checkout -b feature/your-feature"
  echo "    (Or set HUSKY=0 for automated commits)"
  exit 1
fi
EOF
    chmod +x "$HOOK"
    echo "🔒  pre‑commit hook installed"
  fi
fi

# -------------------------------------------
# Make scripts executable
# -------------------------------------------
chmod +x scripts/*.sh *.sh 2>/dev/null || true

# -------------------------------------------
# Development server
# -------------------------------------------
echo ""
echo "🎯  Quick commands:"
echo "   ./scripts/debug.sh     → diagnostic report"
echo "   npm run dev           → start dev server"
echo ""
echo "✅  Setup complete!"

# Auto-start dev server if not already running
if ! pgrep -f "vite.*3000" >/dev/null 2>&1; then
  echo "🔄  Starting dev server..."
  npm run dev &
  echo "📍  Server will be available at http://localhost:3000"
else
  echo "ℹ️  Dev server already running"
fi
