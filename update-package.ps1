# Read the package.json file
$packageJsonPath = "package.json"
$packageJson = Get-Content -Path $packageJsonPath -Raw | ConvertFrom-Json

# Update the lint script
$packageJson.scripts.lint = "eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0 --no-error-on-unmatched-pattern"
$packageJson.scripts."lint:fix" = "eslint . --ext .ts,.tsx,.js,.jsx --fix --no-error-on-unmatched-pattern"

# Add a new script to disable specific ESLint rules
# Use Add-Member to add a new property to the scripts object
$packageJson.scripts | Add-Member -MemberType NoteProperty -Name "lint:disable-warnings" -Value "eslint . --ext .ts,.tsx,.js,.jsx --rule '@typescript-eslint/no-explicit-any: off' --rule '@typescript-eslint/no-unused-vars: off' --rule 'no-console: off' --rule 'react/no-unescaped-entities: off' --rule 'react-hooks/exhaustive-deps: off' --no-error-on-unmatched-pattern"

# Save the updated package.json
$packageJson | ConvertTo-Json -Depth 10 | Set-Content -Path $packageJsonPath
