# Sidecar Architecture Guide

This project uses a **sidecar workspace** (`tools_local/`) to isolate Vite and related dependencies from the main `node_modules`, preventing Windows-specific installation issues and ensuring reliable module resolution.

## Architecture Overview

```
Updog_restore/
├── node_modules/           # Root dependencies + junctions to sidecar
│   ├── vite/              → tools_local/node_modules/vite (junction)
│   ├── @vitejs/           → tools_local/node_modules/@vitejs/* (junctions)
│   └── ...
├── tools_local/           # Isolated sidecar workspace
│   ├── package.json       # CLI tools + Vite plugins
│   └── node_modules/      # Actual packages (source of truth)
└── scripts/
    ├── link-sidecar-packages.mjs    # Creates junctions
    ├── sidecar-packages.json        # Package list config
    └── doctor-links.mjs             # Verifies junctions
```

## Why Sidecar?

1. **Windows Defender Immunity**: Dependencies in sidecar aren't blocked by real-time protection
2. **Absolute Path Resolution**: Windows junctions with absolute paths ensure Node ESM can always resolve modules
3. **Deterministic**: `npm ci --prefix tools_local` gives exact reproducibility
4. **Self-Healing**: Postinstall hook automatically recreates junctions after any `npm install`

## Quick Start

### After pulling / switching branches:

```bash
npm ci --prefix tools_local
npm install
npm run doctor:links
```

### If dev wipes `node_modules/`:

It's OK—postinstall will relink automatically. If not, run:

```bash
node scripts/link-sidecar-packages.mjs
```

### Fast verification:

```bash
npm run doctor:quick    # Check core modules resolve
npm run doctor:links    # Verify all junctions
```

## Troubleshooting

### Problem: "Cannot find package 'vite'"

**Cause**: Junction missing or pointing to wrong path

**Fix**:
```powershell
# Stop Node processes (PowerShell/CMD)
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Remove stale junction
cmd /c rmdir node_modules\vite 2> NUL

# Recreate junctions
node scripts/link-sidecar-packages.mjs

# Verify
npm run doctor:links
```

### Problem: Junction exists but module not found

**Cause**: POSIX symlink created instead of Windows junction (Git Bash issue)

**Fix**:
```powershell
# ALWAYS run from PowerShell/CMD, not Git Bash
cmd /c rmdir node_modules\vite 2> NUL
node scripts/link-sidecar-packages.mjs
```

### Problem: Junctions break after `npm install`

**Cause**: Postinstall hook failed or was skipped

**Fix**:
```bash
# Manually run postinstall
node scripts/link-sidecar-packages.mjs

# Or reinstall to trigger postinstall
npm install
```

### Problem: New package needs to be in sidecar

**Fix**:
1. Add to `tools_local/package.json`:
   ```json
   {
     "dependencies": {
       "new-package": "^1.0.0"
     }
   }
   ```

2. Add to `scripts/sidecar-packages.json`:
   ```json
   {
     "packages": [
       "vite",
       "new-package"
     ]
   }
   ```

3. Install and link:
   ```bash
   npm install --prefix tools_local
   node scripts/link-sidecar-packages.mjs
   ```

## CI/CD Integration

### GitHub Actions (optional Windows job):

```yaml
- name: Setup sidecar workspace
  run: npm ci --prefix tools_local

- name: Create package junctions
  run: node scripts/link-sidecar-packages.mjs

- name: Verify Vite resolves
  run: node -e "console.log(require('vite/package.json').version)"

- name: Run tests
  run: npm test
```

## Platform Notes

### Windows
- **Execute link scripts from PowerShell/CMD** (not Git Bash) to create proper junctions
- Enable Developer Mode or run elevated shell if mklink fails
- Junctions use absolute paths: `C:\dev\Updog_restore\tools_local\node_modules\vite`

### Unix/macOS
- Automatically creates relative symlinks
- No special permissions needed
- Works identically but uses `ln -s` instead of `mklink /J`

## Advanced

### Adding a new package to sidecar:

1. Edit `scripts/sidecar-packages.json` (no code changes needed)
2. Add to `tools_local/package.json` dependencies
3. Run `npm install --prefix tools_local && node scripts/link-sidecar-packages.mjs`

### Verifying junction health:

```powershell
# PowerShell - check if junction points to correct target
Get-Item node_modules\vite | Format-List Name,LinkType,Target

# Should show:
# Name     : vite
# LinkType : Junction
# Target   : {C:\dev\Updog_restore\tools_local\node_modules\vite}
```

### Debugging resolution:

```bash
# Check what Node resolves
node -e "console.log(require.resolve('vite'))"
# Should print: C:\dev\Updog_restore\tools_local\node_modules\vite\dist\node\index.js

# Check all linked packages
npm run doctor:links
```

## Related Documentation

- [WINDOWS_NPX_WORKAROUND.md](WINDOWS_NPX_WORKAROUND.md) - Original NPX issues
- [REMEDIATION_SUMMARY.md](REMEDIATION_SUMMARY.md) - Evolution of the fix
- [scripts/sidecar-packages.json](scripts/sidecar-packages.json) - Package configuration
