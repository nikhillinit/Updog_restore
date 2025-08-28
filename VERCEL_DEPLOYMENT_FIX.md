# Vercel Deployment Fix Guide

## 1. CRITICAL: Missing VITE_API_BASE_URL Environment Variable

The build is failing because `VITE_API_BASE_URL` is not set. This is required for the frontend to know where to make API calls.

### Solution:
Go to your Vercel project settings and add the environment variable:

1. Navigate to your project in Vercel Dashboard
2. Go to Settings → Environment Variables
3. Add the following variable:
   - **Name**: `VITE_API_BASE_URL`
   - **Value**: Your API URL (e.g., `https://your-api-domain.vercel.app` or `https://api.yourdomain.com`)
   - **Environment**: Select appropriate environments (Production, Preview, Development)

For Vercel deployments where you're hosting both frontend and API together, you might use:
- Production: `https://your-app.vercel.app`
- Preview: `https://${VERCEL_URL}` (Vercel provides this automatically)

## 2. Deprecated Package Warnings

The following packages need updating:

### High Priority (Security-related):
```bash
# Update ESLint to v9+
npm uninstall eslint @humanwhocodes/config-array @humanwhocodes/object-schema
npm install --save-dev eslint@latest @eslint/config-array @eslint/object-schema

# Replace deprecated rimraf with v5+
npm uninstall rimraf
npm install --save-dev rimraf@latest

# Update glob to v10+
npm uninstall glob
npm install --save-dev glob@latest
```

### Medium Priority:
```bash
# Replace lodash utilities with native JavaScript
npm uninstall lodash.get lodash.isequal

# Replace inflight (memory leak issues)
npm uninstall inflight
npm install --save-dev lru-cache@latest

# Replace react-beautiful-dnd (deprecated)
npm uninstall react-beautiful-dnd
npm install @hello-pangea/dnd  # Community-maintained fork
```

### Low Priority:
```bash
# Merge esbuild-kit into tsx
npm uninstall @esbuild-kit/esm-loader @esbuild-kit/core-utils
# tsx should already be installed
```

## 3. Security Vulnerabilities

Run the following to see detailed vulnerability information:
```bash
npm audit
```

For automatic fixes (use with caution):
```bash
npm audit fix
```

For aggressive fixes (may include breaking changes):
```bash
npm audit fix --force
```

## 4. Alternative Build Script for Vercel

If you want to bypass the API URL check during build (not recommended for production), create a Vercel-specific build script:

```json
// In package.json, add:
"scripts": {
  "build:vercel": "cross-env BUILD_WITH_PREACT=1 vite build && echo 'Skipping API URL verification for Vercel'",
  // ... existing scripts
}
```

Then update `vercel.json`:
```json
{
  "buildCommand": "npm run build:vercel",
  // ... rest of config
}
```

## 5. Recommended vercel.json Configuration

```json
{
  "buildCommand": "npm run build",
  "installCommand": "npm ci --ignore-scripts",
  "framework": null,
  "ignoreCommand": "bash -lc 'if [ \"$VERCEL_GIT_PULL_REQUEST_ID\" != \"\" ] && [ \"$VERCEL_ENV\" != \"production\" ]; then echo Skip PR build; exit 0; else exit 1; fi'",
  "env": { 
    "NODE_VERSION": "20.15.1"
  },
  "build": {
    "env": {
      "VITE_API_BASE_URL": "@vite-api-base-url"
    }
  }
}
```

## 6. Environment Variable Template

Create these environment variables in Vercel:

```
# Required
VITE_API_BASE_URL=https://your-api-url.com
DATABASE_URL=postgresql://...
SESSION_SECRET=<generate-random-string>

# Optional but recommended
NODE_ENV=production
PORT=5000
REDIS_URL=redis://...

# Feature flags (set to 0 initially)
ENABLE_RUM_V2=0
VITE_ENABLE_RUM_V2=0
ENABLE_SENTRY=0
VITE_ENABLE_SENTRY=0
```

## Quick Fix Steps:

1. **Immediate fix** (to get deployment working):
   - Add `VITE_API_BASE_URL` environment variable in Vercel dashboard
   - Redeploy

2. **Cleanup** (can be done after deployment is working):
   - Update deprecated packages
   - Fix security vulnerabilities
   - Consider migrating from react-beautiful-dnd to @hello-pangea/dnd

3. **Testing locally**:
   ```bash
   # Test the build locally with the environment variable
   VITE_API_BASE_URL=https://your-api-url.com npm run build
   ```

## Notes:
- The warning about inflight.ts being both dynamically and statically imported is minor and can be ignored
- The bundle size looks good (371KB for vendor-charts is the largest chunk)
- Build time is reasonable (10.40s)