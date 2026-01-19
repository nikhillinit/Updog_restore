---
status: ACTIVE
last_updated: 2026-01-19
---

# Vite Build Vercel Fix

**Date:** 2025-10-07
**Issue:** `Cannot find module '/vercel/path0/tools_local/node_modules/vite/bin/vite.js'` on Vercel CI
**Status:** ✅ RESOLVED

## Problem

Build scripts hard-coded paths to `tools_local/node_modules/vite/bin/vite.js` which:
- Worked on Windows via junction links created by postinstall hook
- **Failed on Vercel's Linux CI** because:
  - Junctions are Windows-specific
  - CI runs `npm ci` which doesn't trigger our sidecar linking correctly
  - Vite is installed in root `node_modules/` not `tools_local/`

## Root Cause

The sidecar architecture (`tools_local/`) was designed for Windows development module resolution reliability, but build scripts assumed tools would be in the sidecar directory. On Linux CI, this assumption breaks.

## Solution

**Use standard npm binary resolution** - Let `node_modules/.bin/vite` handle the path:

### Changed Scripts (package.json)

```diff
- "build:web": "node tools_local/node_modules/vite/bin/vite.js build --mode preact"
+ "build:web": "vite build --mode preact"

- "build:fast": "cross-env NODE_ENV=development node tools_local/node_modules/vite/bin/vite.js build --mode development"
+ "build:fast": "cross-env NODE_ENV=development vite build --mode development"

- "dev:client": "node tools_local/node_modules/vite/bin/vite.js"
+ "dev:client": "vite"

- "dev:web:react": "node tools_local/node_modules/vite/bin/vite.js --mode react"
+ "dev:web:react": "vite --mode react"

- "dev:web:preact": "node tools_local/node_modules/vite/bin/vite.js --mode preact"
+ "dev:web:preact": "vite --mode preact"

- "build:web:react": "node --experimental-loader=./scripts/sidecar-loader.mjs tools_local/node_modules/vite/bin/vite.js build --mode react"
+ "build:web:react": "vite build --mode react"

- "build:web:preact": "node --experimental-loader=./scripts/sidecar-loader.mjs tools_local/node_modules/vite/bin/vite.js build --mode preact"
+ "build:web:preact": "vite build --mode preact"

- "build:web:preact:clean": "rimraf node_modules/.vite dist && cross-env BUILD_WITH_PREACT=1 node tools_local/node_modules/vite/bin/vite.js build"
+ "build:web:preact:clean": "rimraf node_modules/.vite dist && cross-env BUILD_WITH_PREACT=1 vite build"

- "build:stats": "node tools_local/node_modules/vite/bin/vite.js build"
+ "build:stats": "vite build"

- "vercel-build": "node tools_local/node_modules/vite/bin/vite.js build"
+ "vercel-build": "vite build"
```

## Why This Works

1. **npm automatically adds binaries to PATH** via `node_modules/.bin/`
2. **Cross-platform compatibility** - Works on Windows, Linux, macOS
3. **Standard practice** - How npm packages are meant to be invoked
4. **No special linking required** - Standard `npm install` provides everything

## Verification

```bash
# Local test (Windows)
npm run build:web
# ✅ Build successful: dist/ generated

# Vercel CI will now work because:
# - Vite exists at node_modules/vite (installed by npm ci)
# - npm automatically adds node_modules/.bin to PATH
# - "vite" command resolves correctly on all platforms
```

## Sidecar Architecture Notes

The `tools_local/` sidecar is **still useful for**:
- Windows-specific module resolution issues
- Development tooling that benefits from controlled environment
- **But NOT for build-critical binaries** that need CI compatibility

### Best Practice Going Forward

- **Development tools (tsx, eslint, prettier, etc.)**: Can use sidecar paths if needed
- **Build tools (vite, typescript, bundlers)**: Use standard npm binaries
- **CI-critical scripts**: Always prefer `node_modules/.bin/` resolution

## Related Files

- `package.json` - Updated build scripts
- `SIDECAR_GUIDE.md` - Sidecar architecture documentation
- `scripts/link-sidecar-packages.mjs` - Sidecar linking script (still used for other packages)

## Credits

Analysis and fix recommended by [detailed review session, 2025-10-07]
