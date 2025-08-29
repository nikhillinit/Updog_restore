# Security Vulnerability Update Strategy

## Current Vulnerabilities (9 total: 4 low, 5 moderate)

### 1. esbuild (Moderate) - Development Server Request Vulnerability
**Affected packages:**
- vite (0.11.0 - 6.1.6)
- @esbuild-kit/core-utils
- @esbuild-kit/esm-loader
- drizzle-kit

**Safe Update Path:**
```bash
# Update Vite to latest (should be safe for dev)
npm install --save-dev vite@latest

# Test the build
npm run build:web

# If successful, update drizzle-kit
npm install --save-dev drizzle-kit@latest
```

### 2. tmp (Low) - Symbolic Link Vulnerability
**Affected packages:**
- @lhci/cli
- inquirer (3.0.0 - 8.2.6)
- external-editor

**Safe Update Path:**
```bash
# Update inquirer first (most commonly used)
npm install --save-dev inquirer@latest

# Test interactive scripts
npm run dev

# If OK, update Lighthouse CI
npm install --save-dev @lhci/cli@latest
```

## Recommended Approach

### Phase 1: Low-Risk Updates (Do Now)
```bash
# 1. Update build tools (dev dependencies only)
npm install --save-dev vite@latest

# 2. Test the build
npm run build:web
npm run check

# 3. If successful, commit
git add package*.json
git commit -m "chore: update vite to latest for security fixes"
```

### Phase 2: Medium-Risk Updates (After TypeScript fixes)
```bash
# 1. Update interactive tools
npm install --save-dev inquirer@latest @lhci/cli@latest

# 2. Update drizzle-kit
npm install --save-dev drizzle-kit@latest

# 3. Full test suite
npm test
```

### Phase 3: Replace Deprecated Packages (Next Sprint)
As noted in VERCEL_DEPLOYMENT_FIX.md:

```bash
# Replace deprecated packages
npm uninstall rimraf glob lodash.get lodash.isequal react-beautiful-dnd
npm install --save-dev rimraf@latest glob@latest
npm install @hello-pangea/dnd  # react-beautiful-dnd replacement
```

## Testing After Each Update

1. **Build Test**: `npm run build`
2. **Type Check**: `npm run check`
3. **Lint Check**: `npm run lint`
4. **Quick Tests**: `npm run test:quick`
5. **Dev Server**: `npm run dev` (manual smoke test)

## Rollback Plan

If any update causes issues:
```bash
git checkout -- package*.json
npm install
```

## Notes

- All vulnerable packages are in devDependencies, so production is not affected
- The esbuild vulnerability only affects development server (not production builds)
- Updates should be done incrementally with testing between each