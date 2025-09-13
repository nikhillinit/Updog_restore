#!/bin/bash

# Check if type-aware rules are disabled in ESLint config
if grep -Rni --exclude-dir=node_modules '"@typescript-eslint/no-unsafe-call": "off"' eslint.config.js; then
  echo "❌ Type-aware rules are disabled; remove before merge."
  exit 1
fi

if grep -Rni --exclude-dir=node_modules '"@typescript-eslint/no-unsafe-assignment": "off"' eslint.config.js; then
  echo "❌ Type-aware rules are disabled; remove before merge."
  exit 1
fi

echo "✅ Type-aware rules are properly configured"
exit 0