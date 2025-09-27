#!/bin/bash

# Security pre-commit checks
# Add this to your pre-commit hook or use with husky/lefthook

set -euo pipefail

echo "🔐 Running security checks..."

# Check for shell: true in staged files
SHELL_TRUE=$(git diff --cached --name-only -z | xargs -0 grep -l "shell:\s*true" 2>/dev/null || true)
if [ -n "$SHELL_TRUE" ]; then
  echo "❌ Found 'shell: true' in staged files:"
  echo "$SHELL_TRUE"
  echo "Use execFileSafe/spawnSafe from shared/security/process instead"
  exit 1
fi

# Check for execSync with string interpolation
EXEC_SYNC=$(git diff --cached --name-only -z | xargs -0 grep -l 'execSync.*\${' 2>/dev/null || true)
if [ -n "$EXEC_SYNC" ]; then
  echo "❌ Found execSync with string interpolation in staged files:"
  echo "$EXEC_SYNC"
  echo "Use execFileSafe from shared/security/process instead"
  exit 1
fi

# Check for yaml.load
YAML_LOAD=$(git diff --cached --name-only -z | xargs -0 grep -l 'yaml\.load\(' 2>/dev/null || true)
if [ -n "$YAML_LOAD" ]; then
  echo "❌ Found unsafe yaml.load() in staged files:"
  echo "$YAML_LOAD"
  echo "Use parseYamlSafe from shared/security/yaml instead"
  exit 1
fi

# Check for hardcoded secrets (basic patterns)
SECRETS=$(git diff --cached --name-only -z | xargs -0 grep -E '(api[_-]?key|api[_-]?secret|password|token|private[_-]?key)\s*=\s*["\'][^"\']+["\']' 2>/dev/null || true)
if [ -n "$SECRETS" ]; then
  echo "⚠️  Possible hardcoded secrets found in staged files:"
  echo "$SECRETS"
  echo "Use environment variables instead"
  # Warning only, not blocking
fi

# Check for eval()
EVAL=$(git diff --cached --name-only -z | xargs -0 grep -l '\beval\s*\(' 2>/dev/null || true)
if [ -n "$EVAL" ]; then
  echo "❌ Found eval() in staged files:"
  echo "$EVAL"
  echo "eval() is dangerous and should never be used"
  exit 1
fi

# Run ESLint security rules on staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|mjs)$' || true)
if [ -n "$STAGED_FILES" ]; then
  echo "🔍 Running ESLint security checks..."
  npx eslint $STAGED_FILES --config eslint.security.config.js --max-warnings 0 || {
    echo "❌ ESLint security checks failed"
    exit 1
  }
fi

echo "✅ Security checks passed"