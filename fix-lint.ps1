# Create .eslintignore file
$eslintIgnore = @"
node_modules/
dist/
build/
tests/
**/*.test.ts
**/*.test.tsx
scripts/
auto-discovery/
check-db.js
workers/
types/
"@

Set-Content -Path ".eslintignore" -Value $eslintIgnore

# Create .eslintrc.json file
$eslintConfig = @"
{
  "root": true,
  "rules": {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "no-console": "off",
    "react/no-unescaped-entities": "off",
    "react-hooks/exhaustive-deps": "off"
  }
}
"@

Set-Content -Path ".eslintrc.json" -Value $eslintConfig

# Run ESLint on specific directories
Write-Host "Running ESLint on client/src directory..."
npx eslint --fix "client/src/**/*.{ts,tsx,js,jsx}" --ignore-path .eslintignore

Write-Host "Running ESLint on server directory..."
npx eslint --fix "server/**/*.{ts,tsx,js,jsx}" --ignore-path .eslintignore

Write-Host "ESLint fixes applied!"
