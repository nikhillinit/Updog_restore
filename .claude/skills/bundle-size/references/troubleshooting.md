# Bundle Size Troubleshooting

Common issues and their solutions.

## Build Issues

### "dist/ directory not found"

**Cause:** Build hasn't been run.

**Solution:**
```bash
npm run build
```

### "manifest.json not found"

**Cause:** Vite manifest generation not enabled or build incomplete.

**Check:**
```bash
ls dist/public/.vite/manifest.json
```

**Solution:** Ensure `build.manifest: true` in vite.config.ts (should be default).

### "stats.json not found"

**Cause:** Rollup visualizer not configured for JSON output.

**Solution:** This is expected behavior. Tier C is not enabled by default.
See capability-tiers.md for how to enable if needed.

## Budget Check Issues

### "check-budgets.cjs fails with 'file not found'"

**Cause:** Budget configuration references files that don't exist.

**Check:**
```bash
cat .size-limit.json
```

**Solution:** Ensure paths in `.size-limit.json` match actual build output paths.

### "Budget always passes even with large bundles"

**Cause:** Budget limits may be set too high or targeting wrong files.

**Check current limits:**
```bash
node -e "console.log(JSON.stringify(require('./.size-limit.json'), null, 2))"
```

### "Budget fails but bundle looks fine"

**Cause:** Compression estimates may differ from actual serving.

**Note:** The tool uses Node.js zlib for gzip estimates. Actual CDN compression
may vary by 5-10%. If budgets are tight, add a small margin.

## CI/CD Issues

### "Baseline artifact not found"

**Cause:** No successful main branch build, or artifact expired.

**Solutions:**
1. Manually trigger baseline workflow on main
2. Artifact retention is 30 days - check if baseline is expired
3. For first-time setup, absolute budgets apply (no regression check)

### "PR fails but changes are intentional"

**Solution:** Add label `approved:perf-budget-change` to bypass regression check.

**Caution:** This should be rare. If frequent, consider adjusting budgets.

### "Comparison shows wrong baseline"

**Cause:** Artifact downloaded from wrong branch or workflow run.

**Check:** Review workflow logs for which artifact was downloaded.

## Size Report Issues

### "size-report.mjs shows unexpected files"

**Cause:** Previous build artifacts not cleaned.

**Solution:**
```bash
rm -rf dist/
npm run build
node scripts/size-report.mjs
```

### "Gzip sizes seem wrong"

**Cause:** Using different compression level than production.

**Note:** Scripts use gzip level 9 (maximum compression). Production CDN
settings may differ. Use for trending, not exact byte counts.

## Common Misconceptions

### "The bundle increased but I only changed one file"

Bundle size is not linear with source changes because:
- Minifier optimizations vary based on code structure
- Hash changes cause cache-busting renames
- Shared chunks may be reorganized
- Source maps are included in some metrics

### "Package X shows 0 KB but I know I use it"

Tree-shaking may eliminate unused exports. The package is imported but
only the used parts are bundled. This is correct behavior.

### "Two chunks have the same code"

Possible duplicate bundling. Check if:
- Same dependency is in multiple package.json locations
- Version mismatch causing separate bundles
- Dynamic import boundary splits shared code

Use `dist/stats.html` treemap to investigate.

## Getting Help

If issues persist:
1. Check `dist/stats.html` for visual analysis
2. Run `npm run build -- --debug` for verbose output
3. Compare with a known-good commit
