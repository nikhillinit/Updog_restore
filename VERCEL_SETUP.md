# Vercel Production Setup Guide

This guide documents the required Vercel dashboard settings for production deployments.

## ✅ Required Settings

### 1. Environment Variables
**Location**: Settings → Environment Variables

Add the following environment variable:
```
NODE_OPTIONS=--max-old-space-size=4096
```
- **Purpose**: Prevents OOM errors during builds by increasing Node.js memory limit
- **Environments**: Production, Preview, Development

### 2. Node.js Version
**Location**: Settings → General → Node.js Version

- **Select**: `20.x`
- **Why**: Matches our `package.json` engines requirement and `.nvmrc` file

### 3. Build & Development Settings
**Location**: Settings → Build & Development Settings

- **Install Command**: `npm ci` (should match vercel.json)
- **Build Command**: `npm run build` (should match vercel.json)
- **Output Directory**: Leave empty (uses Vercel Build Output API)
- **Framework Preset**: None/Other

### 4. Ignored Build Step (Optional)
**Location**: Settings → Git

If you want to skip PR preview builds:
- The `vercel.json` already contains an `ignoreCommand` that skips non-production PR builds
- This saves build minutes for draft PRs

## 📊 Verification Checklist

After configuration, trigger a deployment with "Clear build cache" and verify:

- [ ] Build completes without memory errors
- [ ] No `.map` files in deployed assets
- [ ] Upload size is ~15MB or less (previously 50MB+ with sourcemaps)
- [ ] Deployment completes in ~1-2 minutes
- [ ] Initial route doesn't load `vendor-charts-*.js`

## 🔧 Local Development

### Testing Production Build Locally
```bash
# Standard build (no sourcemaps)
npm run build

# Build with sourcemaps for debugging
VITE_SOURCEMAP=true npm run build

# Test with compressed size budgets
BUNDLE_CHECK_COMPRESSED=true npm run bundle:check
```

### Using Correct Node Version
```bash
# If using nvm
nvm use

# If using volta
volta pin node@20

# Verify version
node --version  # Should show v20.x.x
```

## 🚀 CI/CD Integration

### GitHub Actions Example
```yaml
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'

- name: Build and Check
  run: npm run ci:build
  env:
    CI: true
```

### Bundle Size Monitoring
The project includes automatic bundle size checking:
- Uncompressed limits: vendor-charts (400KB), vendor-ui-core (150KB)
- Compressed limits: vendor-charts (120KB), vendor-ui-core (40KB)
- Run `npm run bundle:check` to verify

## 🔍 Troubleshooting

### Build Stalls or Times Out
1. Verify `NODE_OPTIONS` is set in environment variables
2. Clear build cache and redeploy
3. Check that sourcemaps are disabled (VITE_SOURCEMAP not set)

### Bundle Size Violations
1. Run `npm run bundle:check` locally
2. Use `npm run bundle:check -- --compressed` for gzip sizes
3. Investigate with `npx vite-bundle-visualizer`

### Environment Drift
1. Ensure Node version matches: local (.nvmrc) = CI = Vercel (20.x)
2. Use `npm ci` not `npm install`
3. Check `package-lock.json` is committed

## 📝 Notes

- The project uses Vercel's Build Output API (`.vercel/output`)
- Sourcemaps are disabled by default for production
- Bundle budgets are enforced in CI via `npm run ci:build`
- All settings in `vercel.json` should match dashboard settings