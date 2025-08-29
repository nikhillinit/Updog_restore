# Zencoder AI Integration Guide

## Overview

Zencoder integration provides AI-powered automated fixes for common codebase issues including TypeScript errors, test failures, ESLint violations, and security vulnerabilities.

## Architecture

```
┌─────────────────────────────────────────┐
│         AI Tools Gateway (CLI)          │
│        scripts/ai-tools/index.js        │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│       Zencoder Integration Layer        │
│   packages/zencoder-integration/        │
├─────────────────────────────────────────┤
│ • ZencoderAgent (BaseAgent)            │
│ • Task-specific fix generators         │
│ • Local AI fallback logic              │
└────────────────┬────────────────────────┘
                 │
     ┌───────────┼───────────┬─────────────┐
     ▼           ▼           ▼             ▼
TypeScript    Test       ESLint      Dependencies
  Fixer      Fixer       Fixer        Updater
```

## Quick Start

### 1. Fix TypeScript Errors
```bash
# Fix up to 10 TypeScript errors (default)
npm run ai zencoder typescript

# Fix specific number of errors
npm run ai zencoder typescript --max-fixes=25

# Verbose output for debugging
npm run ai zencoder typescript --verbose
```

### 2. Fix ESLint Violations
```bash
# Fix ESLint errors (focuses on unused variables)
npm run ai zencoder eslint --max-fixes=50

# Target specific files
npm run ai zencoder eslint --files=src/components/Dashboard.tsx,src/utils/helpers.ts
```

### 3. Repair Failing Tests
```bash
# Fix test failures
npm run ai zencoder test

# Fix specific test file
npm run ai zencoder test --files=tests/auth.test.ts
```

### 4. Update Dependencies
```bash
# Fix security vulnerabilities
npm run ai zencoder deps

# Limit number of updates
npm run ai zencoder deps --max-fixes=5
```

## Automated Workflows

### Complete Fix Pipeline
Run all fixes in sequence:
```powershell
# PowerShell (Windows)
.\scripts\zencoder-full-fix.ps1 -All

# Interactive mode
.\scripts\zencoder-full-fix.ps1
```

### TypeScript-Specific Workflow
```powershell
.\scripts\zencoder-typescript-fix.ps1 -MaxFixes 25 -Verbose
```

## Integration with Existing Tools

### Combining with Test Repair Agent
```bash
# First use test repair agent for pattern detection
npm run ai repair --max-repairs=5

# Then use Zencoder for complex fixes
npm run ai zencoder test --max-fixes=10
```

### Bundle Optimization Pipeline
```bash
# Analyze bundle first
npm run ai bundle-analyze

# Fix imports and dependencies
npm run ai zencoder deps

# Re-optimize bundle
npm run ai bundle-optimize --target=400
```

## Configuration

### Environment Variables
```bash
# Optional: Configure external Zencoder API
ZENCODER_API_KEY=your-api-key
ZENCODER_ENDPOINT=https://api.zencoder.ai/v1

# Without API key, uses local AI implementation
```

### Project Settings
Add to `package.json`:
```json
{
  "zencoder": {
    "maxFixes": 10,
    "autoFix": ["typescript", "eslint"],
    "excludePaths": ["node_modules", "dist", "build"]
  }
}
```

## How It Works

### 1. Error Detection
- Parses compiler/linter output
- Identifies error patterns
- Groups related issues

### 2. Fix Generation
- Analyzes code context
- Generates appropriate patches
- Validates fixes won't break functionality

### 3. Application
- Applies fixes incrementally
- Runs validation after each fix
- Rolls back if tests fail

### 4. Verification
- Runs type checking
- Executes affected tests
- Reports success metrics

## Common Use Cases

### Daily Development
```bash
# Morning cleanup routine
npm run ai zencoder eslint --max-fixes=20
npm run ai zencoder typescript
npm test
```

### Pre-Commit
```bash
# Fix issues before committing
npm run lint
npm run ai zencoder eslint
npm run check
npm run ai zencoder typescript
git add -A
git commit -m "fix: resolve linting and type issues"
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Auto-fix issues
  run: |
    npm run ai zencoder typescript --max-fixes=50
    npm run ai zencoder eslint --max-fixes=100
    npm run ai zencoder test --max-fixes=10
```

## Metrics & Monitoring

### Success Metrics
- Files analyzed vs. fixed
- Time saved (estimated 10 min/fix)
- Fix success rate
- Test pass rate after fixes

### View Metrics
```bash
# Check metrics endpoint
npm run ai metrics

# View in Prometheus
curl http://localhost:3000/metrics | grep zencoder
```

## Troubleshooting

### Build Issues After Fixes
```bash
# Verify TypeScript compilation
npm run check:client

# Run isolated build
npm run build:client
```

### Test Failures After Fixes
```bash
# Run only affected tests
npm run test -- --changed

# Revert last fix
git checkout -- <file>
```

### ESLint Still Showing Errors
```bash
# Run manual cleanup first
node scripts/clean-unused.mjs

# Then use Zencoder
npm run ai zencoder eslint
```

## Best Practices

1. **Start Small**: Fix 5-10 issues at a time
2. **Review Changes**: Always `git diff` before committing
3. **Test Incrementally**: Run tests after each fix phase
4. **Use Version Control**: Commit working state before major fixes
5. **Combine Tools**: Use with existing repair agents for best results

## Limitations

- Complex architectural changes require manual intervention
- May not handle project-specific conventions perfectly
- Performance optimizations need human review
- Security-critical code should be manually verified

## Future Enhancements

- [ ] Real-time fix suggestions in IDE
- [ ] Learning from project patterns
- [ ] Automatic PR creation with fixes
- [ ] Integration with code review tools
- [ ] Custom fix strategies per project

## Support

For issues or questions:
1. Check the logs in `ai-logs/` directory
2. Run with `--verbose` flag for detailed output
3. Review `CODEBASE_ISSUES_SUMMARY.md` for context
4. Create issue in project repository