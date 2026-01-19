---
status: ACTIVE
last_updated: 2026-01-19
---

# Build Stabilization: Iteration Log

## Session Metadata
- Start Time: 2026-01-19
- Objective: Fix Vite/Server builds & Docker contracts
- Status: IN PROGRESS

## Gaps Identified
1. Frontend outputs to `dist/` but scripts expect `dist/public/`
2. `build:server` is a no-op stub
3. `npm start` points to `dist/server/server/index.js` (non-existent)
4. No post-build verification

## Iterations

### Iteration 0: Gap Analysis (COMPLETE)
- Explored vite.config.ts, package.json, Dockerfile
- Confirmed ESBuild v0.25.10 already installed
- Validated Vercel unchanged (uses build:web)
- Decision: `packages: 'external'` for ESBuild

### Iteration 1: Implementation (COMPLETE)
- Phase 1: Documentation setup [DONE]
- Phase 2: vite.config.ts update [DONE] - outDir changed to dist/public
- Phase 3: build-server.mjs creation [DONE] - ESBuild with packages:external
- Phase 4: package.json updates [DONE] - build:server, start, postbuild
- Phase 5: verify-build.mjs creation [DONE]

### Iteration 2: Verification (COMPLETE)
- Frontend build: dist/public/index.html (795 bytes)
- Server build: dist/index.js (1,199,495 bytes)
- Assets directory: dist/public/assets/ (directory exists)
- Build verification: PASSED

## Summary
All build stabilization changes implemented successfully:
1. Vite outputs to dist/public/ (aligns with server/vite.ts expectations)
2. ESBuild compiles server to dist/index.js (matches Dockerfile CMD)
3. npm start now uses correct path (dist/index.js)
4. postbuild verification gate added
5. verify-api-url.mjs updated for new asset path

### Iteration 3: Environment Alignment (COMPLETE)
Additional fixes to fully align Docker/Railway/Vercel environments:

1. **server/vite.ts serveStatic** - Fixed path resolution
   - Before: `path.resolve(import.meta.dirname, "public")` → `server/public/` (wrong)
   - After: `path.resolve(import.meta.dirname, "..", "dist", "public")` → `dist/public/` (correct)

2. **Runtime assets moved** - Copied to client/public/ so Vite includes them:
   - `runtime-config.json` - Runtime configuration
   - `fonts/` - PDF generation fonts (Inter, Poppins)
   - `dashboard.html` - Static dashboard

3. **Dockerfile.railway aligned** - Now uses same entry as main Dockerfile:
   - Before: `CMD ["node", "server/bootstrap.js"]`
   - After: `CMD ["node", "dist/index.js"]`

**Verification:**
```
OK: Server entry (1199495 bytes)
OK: Frontend entry (795 bytes)
OK: Frontend assets (directory)
Build verification passed
```

**Assets in dist/public/:**
- runtime-config.json (293 bytes)
- dashboard.html (9853 bytes)
- fonts/ (5 TTF files, ~1.5MB total)
