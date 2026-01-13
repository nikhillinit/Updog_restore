# Bundle Size Capability Tiers

This document defines what analysis is possible based on available build artifacts.

## Tier A: Filesystem Only

**Data source:** `dist/` directory contents

**Always available after any build.**

### What You Can Determine

- Total size of all JS files (raw, gzip, brotli estimates)
- Total size of all CSS files
- List of emitted files sorted by size
- File count by type

### What You Cannot Determine

- Which files are loaded on initial page load
- Chunk relationships (imports/exports)
- Source module attribution

### How to Check

```bash
ls -la dist/public/assets/*.js | wc -l  # JS file count
```

## Tier B: Manifest Available

**Data source:** `dist/public/.vite/manifest.json`

**Available after `npm run build` with Vite.**

### What You Can Determine

Everything in Tier A, plus:
- Entry points vs dynamic chunks
- Import graph between chunks
- Initial load bundle (entry closure)
- Stable chunk identifiers (manifest keys vs hashed filenames)

### What You Cannot Determine

- Which npm packages contribute to each chunk
- Module-level size breakdown
- Tree-shaking effectiveness

### How to Check

```bash
cat dist/public/.vite/manifest.json | head -20
```

### Manifest Structure

```json
{
  "src/main.tsx": {
    "file": "assets/main-abc123.js",
    "isEntry": true,
    "css": ["assets/main-xyz789.css"],
    "imports": ["_vendor-def456.js"]
  }
}
```

### Computing Initial Load

Initial load = all chunks reachable via static imports from entry points.

```
Entry: src/main.tsx
  -> main-abc123.js (entry)
  -> _vendor-def456.js (imported)
  -> main-xyz789.css (CSS)

Total initial = sum of above sizes
```

Dynamic imports (`import('./lazy.ts')`) are NOT included in initial load.

## Tier C: Stats Available

**Data source:** `dist/stats.json` (from rollup-plugin-visualizer)

**NOT enabled by default. Requires vite.config.ts modification.**

### What You Can Determine

Everything in Tier A and B, plus:
- Module-level size breakdown
- npm package contribution (via path heuristics)
- Tree-shaking effectiveness (included vs available code)
- Duplicate module detection

### How to Enable

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    visualizer({
      filename: 'dist/stats.json',
      json: true,
    }),
  ],
});
```

### Tradeoffs

| Benefit | Cost |
|---------|------|
| Package attribution | +10-30s build time |
| Module breakdown | Larger artifact storage |
| Optimization insights | Stats format may change across versions |

### Attribution Confidence

Even with stats.json, package attribution uses path heuristics:
- `node_modules/lodash-es/` -> `lodash-es`
- `node_modules/@tanstack/react-query/` -> `@tanstack/react-query`

This is **heuristic**, not exact. Tree-shaking means a package's contribution
may be spread across multiple chunks.

## Detection Logic

When analyzing bundles, check tier availability in this order:

```
1. Check for stats.json      -> Tier C
2. Check for manifest.json   -> Tier B
3. Check for dist/ files     -> Tier A
4. No dist/ directory        -> Build required
```

## Claim Mapping

| Question Type | Minimum Tier | Example Response |
|---------------|--------------|------------------|
| "What's the total size?" | A | "Total JS is 245KB gzipped" |
| "What's the initial load?" | B | "Initial load is 89KB across 3 chunks" |
| "Which packages are largest?" | C | Requires stats.json - see dist/stats.html |
| "Why did size increase?" | B + diff | Need to compare manifest + review commits |
