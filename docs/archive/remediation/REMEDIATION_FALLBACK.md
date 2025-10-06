# Remediation Fallback Strategies

## If `npm list vite` Still Shows `(empty)` After Main Remediation

### Fallback 1: Windows Defender Exclusion (Temporary)

Windows Defender can block package extraction. Try temporarily excluding the project directory:

```powershell
# Add exclusion (run as Administrator)
Add-MpPreference -ExclusionPath "c:\dev\Updog_restore"

# Retry installation
Remove-Item -Recurse -Force node_modules
npm install

# Verify
npm list vite

# IMPORTANT: Remove exclusion after successful install (security hygiene)
Remove-MpPreference -ExclusionPath "c:\dev\Updog_restore"
```

### Fallback 2: NPX Workaround (Emergency Bridge)

If packages still won't materialize locally, use NPX to run directly from registry:

**Update `package.json` scripts:**

```json
{
  "scripts": {
    "dev:client": "npx vite",
    "dev:api": "npx tsx server/bootstrap.ts",
    "dev": "npx concurrently -k \"npm:dev:client\" \"npm:dev:api\""
  }
}
```

**Document as Technical Debt:**

Create `TECH_DEBT.md`:

```markdown
# Technical Debt

## NPX Fallback for Dev Tools

**Issue**: vite/tsx/concurrently refuse to install locally despite pinning.

**Possible Causes**:
- Windows Defender blocking extraction
- npm cache corruption (persists despite clean --force)
- Filesystem permissions issue

**Current Workaround**: Using `npx` to run tools directly from npm registry.

**Impact**: ~2-3s slower dev server startup.

**Next Steps**:
1. Test on fresh Windows VM to isolate root cause
2. Check Windows Event Viewer for file access denials
3. Try different npm cache location (npm config set cache C:\npm-cache)
```

### Fallback 3: Fresh npm Cache Location

```powershell
# Set new cache location
npm config set cache "C:\npm-cache-new"

# Clean and retry
npm cache clean --force
Remove-Item -Recurse -Force node_modules
npm install
```

### Fallback 4: Disable npm Package Lock (Not Recommended)

```powershell
# Last resort - disable package lock temporarily
npm config set package-lock false
npm install
npm config set package-lock true
npm install  # Regenerate lockfile
```

## Success Criteria

After any fallback:
- [ ] `npm run dev` starts successfully
- [ ] Vite dev server on http://localhost:5173
- [ ] API server on http://localhost:5000
- [ ] React app loads in browser

## Reporting Issues

If all fallbacks fail, collect diagnostics:

```powershell
# System info
node --version
npm --version
Get-ComputerInfo | Select-String "Windows"

# npm configuration
npm config list

# Package installation attempt with debug
npm install vite@5.4.11 --loglevel=silly > npm-debug.log 2>&1

# Check Event Viewer for file access denials
Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" -MaxEvents 50 | Where-Object {$_.Message -like "*Updog_restore*"}
```

Share `npm-debug.log` and event viewer output for further diagnosis.
