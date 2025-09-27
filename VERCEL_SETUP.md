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
- **Required**: ✅ This must be set manually in Vercel dashboard

### 2. Node.js Version
**Location**: Settings → General → Node.js Version

- **Select**: `20.x`
- **Why**: Matches our `package.json` engines requirement and `.node-version` file
- **Required**: ✅ This must be set manually in Vercel dashboard (vercel.json cannot control runtime version)

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

### Manual Configuration Steps
1. **In Vercel Dashboard:**
   - [ ] Set Node.js version to `20.x` (Settings → General)
   - [ ] Add `NODE_OPTIONS=--max-old-space-size=4096` environment variable (Settings → Environment Variables)
   - [ ] Verify build commands match vercel.json: `npm ci` and `npm run build`

2. **Deploy with Clear Cache:**
   - [ ] Trigger new deployment with "Clear build cache" enabled
   - [ ] Monitor build logs for memory errors or stalls

### Post-Deployment Verification
3. **Build Performance:**
   - [ ] Build completes without memory errors
   - [ ] No `.map` files in deployed assets
   - [ ] Upload size is ~15MB or less (previously 50MB+ with sourcemaps)
   - [ ] Deployment completes in ~1-2 minutes

4. **Runtime Verification:**
   - [ ] Initial route doesn't load `vendor-charts-*.js` (verify in browser Network tab)
   - [ ] Charts load correctly when navigating to planning page
   - [ ] No JavaScript errors in browser console

5. **Bundle Verification:**
   - [ ] Run `curl -s https://your-app.vercel.app/_next/static/chunks/ | grep -o 'vendor-[^"]*\.js' | head -5` to verify chunk names
   - [ ] Check browser Network tab for lazy loading of chart components

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
1. **Verify Manual Settings:**
   - Check `NODE_OPTIONS=--max-old-space-size=4096` is set in Vercel environment variables
   - Confirm Node.js version is set to `20.x` in dashboard
2. **Clear build cache and redeploy**
3. **Check that sourcemaps are disabled** (VITE_SOURCEMAP not set)

### Bundle Size Violations
1. **Run local checks:**
   ```bash
   npm run bundle:check                    # Uncompressed sizes
   npm run bundle:check -- --compressed    # Gzip sizes
   ```
2. **Investigate with bundle analyzer:**
   ```bash
   npx vite-bundle-visualizer
   ```

### Runtime Issues
1. **Chart Loading Problems:**
   - Verify `vendor-charts-*.js` is NOT loaded on initial page
   - Check browser Network tab for proper lazy loading
   - Look for JavaScript errors in console

### Environment Drift
1. **Version Consistency:**
   - Local: `.node-version` (20)
   - CI: GitHub Actions (20)
   - Vercel: Dashboard setting (20.x) ✅ **Manual**
2. **Dependency Management:**
   - Use `npm ci` not `npm install`
   - Ensure `package-lock.json` is committed

## 📝 Notes

- **Build System**: Uses Vercel's Build Output API (`.vercel/output`)
- **Sourcemaps**: Disabled by default for production (reduces upload from 50MB to ~15MB)
- **Bundle Budgets**: Enforced in CI via `npm run ci:build`
- **Manual Configuration Required**: Node.js version and NODE_OPTIONS must be set in Vercel dashboard
- **vercel.json Limitations**: Cannot control runtime Node.js version (only build commands and deployment settings)