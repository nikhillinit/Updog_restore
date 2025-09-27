# Triage Guide

## Overview
This guide helps debug Step 2→3 regression issues and build flakiness in the fund setup wizard using a comprehensive triage kit.

## When to Use
- Step 2→3 transition fails or loops infinitely
- Build succeeds locally but dynamic import returns 500 in dev
- Intermittent dev-only regressions
- Zustand store update loops
- Unexpected selector re-renders

## One-time Setup

### Install Dependencies (if needed)
```bash
# For automated HAR + console collection (optional)
npm i -D @playwright/test
```

### Environment Variables
Add to your `.env.local` for persistent debug mode:
```bash
VITE_WIZARD_DEBUG=1
```

## Collect Triage Bundle

### 1. Start Dev with Debug Mode
```bash
# Windows
set VITE_WIZARD_DEBUG=1 && npm run dev

# macOS/Linux
VITE_WIZARD_DEBUG=1 npm run dev
```

### 2. Reproduce the Issue
1. Navigate to `/fund-setup?step=2`
2. Fill in any required fields
3. Click "Next" to transition to Step 3
4. Observe console for WIZARD traces

### 3. Run Triage Collection Script
```bash
# Stop dev server first, then:
npm run triage
```

This generates `triage-output/` with:
- `commit.txt` - Git branch and commit hash
- `env.txt` - Node and npm versions
- `typecheck.txt` - TypeScript compilation results
- `build-local.txt` - Build output with timing
- `assets.txt` - List of built assets
- `selector-scan.txt` - Suspicious Zustand selectors
- `package-versions.txt` - Dependency versions

### 4. Collect Browser Data

#### Option A: Automated (Playwright)
```bash
npm run triage:auto
```
Generates:
- `triage-output/network.har` - All network traffic
- `triage-output/console.txt` - Console output
- `triage-output/errors.txt` - Page and network errors

#### Option B: Manual Export
1. **Network HAR**: 
   - Open DevTools Network tab
   - Right-click any request → "Save all as HAR"
   - Save as `triage-output/network.har`

2. **Console Logs**:
   - Filter console by "WIZARD"
   - Copy all lines
   - Save as `triage-output/wizard-trace-console.txt`

3. **React Profiler** (optional):
   - Start profiling
   - Reproduce Step 2→3 transition
   - Stop and export
   - Save as `triage-output/react-profiler.json`

## What's Collected

### Instrumentation Output
- **Wizard Traces**: Timestamped events with component tags
- **Fetch Tap**: All HTTP requests with status and timing
- **Store Tracer**: Zustand state changes with timestamps

### Analysis Files
- **selector-scan.txt**: Object-returning selectors without equality functions
- **build-local.txt**: Build duration and any transform errors
- **assets.txt**: Emitted bundles and sourcemaps

## Analyzing Results

### Common Issues to Check

#### 1. Infinite Loop Detection
Look for repeated `WRITE_FROM_STRATEGY` events in console:
```
WIZARD {event: "WRITE_FROM_STRATEGY", hash: "abc123..."}
WIZARD {event: "WRITE_FROM_STRATEGY", hash: "abc123..."} // Same hash = loop!
```

#### 2. Selector Identity Issues
Check `selector-scan.txt` for problematic selectors:
```
client/src/pages/SomePage.tsx:24: useFundStore(s => ({ data: s.data }))
```

#### 3. Transform/Build Errors
In `network.har`, search for 500 responses on `.tsx` files:
```json
{
  "status": 500,
  "url": "http://localhost:5173/src/pages/fund-setup.tsx"
}
```

#### 4. Store Publishing Patterns
In console, filter by `[fund-store publish]`:
```
[fund-store publish] stages,sectorProfiles
[fund-store publish] stages,sectorProfiles // Repeated = issue
```

### Debug Flags Reference

| Flag | Purpose | Location |
|------|---------|----------|
| `VITE_WIZARD_DEBUG=1` | Enable all debug instrumentation | Environment |
| `import.meta.env.DEV` | Dev-only code paths | Source code |

## Troubleshooting

### Triage Script Fails
- Ensure you're in the project root
- Check Node.js version matches `.nvmrc`
- Verify git repository is initialized

### Playwright Tests Timeout
- Increase timeout in `tests/triage.spec.ts`
- Ensure dev server is running on expected port
- Check for required form validation blocking navigation

### Missing Debug Output
- Verify `VITE_WIZARD_DEBUG=1` is set
- Check browser console for errors
- Ensure instrumentation files are imported

## Advanced Usage

### Custom Trace Points
Add traces in your components:
```typescript
import { traceWizard } from '@/debug/wizard-trace';

traceWizard('CUSTOM_EVENT', { data }, { component: 'MyComponent' });
```

### Filtering Store Updates
Modify store tracer in `useFundStore.ts`:
```typescript
if (state.specificField !== prev.specificField) {
  console.debug('[store] specificField changed', {
    old: prev.specificField,
    new: state.specificField
  });
}
```

## Cleanup
After debugging:
1. Remove `VITE_WIZARD_DEBUG=1` from environment
2. Delete `triage-output/` directory
3. Clear browser cache if needed

## Support
- File issues with `triage-output/` attached
- Include reproduction steps
- Note any environment-specific factors