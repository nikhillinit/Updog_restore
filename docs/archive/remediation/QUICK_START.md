# Quick Start - Server Dependency Remediation

## 🚀 Fastest Path (3 commands)

```powershell
# 1. Run automated remediation
.\REMEDIATION_EXEC.ps1

# 2. Verify & start dev server
npm run dev

# 3. Commit changes
git add . && git commit -m "fix(deps): deterministic dependency resolution + Windows hardening"
```

## ✅ Success Check

After Step 2, you should see:
```
[doctor] ✅ vite@5.4.11
[doctor] ✅ concurrently@9.2.1
[doctor] ✅ tsx@4.19.2
[api] API server listening on http://localhost:5000
[client] VITE v5.4.11 ready
```

Open http://localhost:5173 - app should load ✅

## 🆘 If It Fails

```powershell
# Try antivirus exclusion
Add-MpPreference -ExclusionPath "c:\dev\Updog_restore"
npm install
Remove-MpPreference -ExclusionPath "c:\dev\Updog_restore"
```

Still failing? See [REMEDIATION_FALLBACK.md](./REMEDIATION_FALLBACK.md)

## 📚 Full Documentation

- **Detailed Plan**: [REMEDIATION_SUMMARY.md](./REMEDIATION_SUMMARY.md)
- **Fallback Strategies**: [REMEDIATION_FALLBACK.md](./REMEDIATION_FALLBACK.md)
- **Infrastructure Context**: [docs/INFRASTRUCTURE_REMEDIATION.md](./docs/INFRASTRUCTURE_REMEDIATION.md)

## 🔄 Future Recovery

If dependencies break again:

```powershell
npm run reset:deps
```

That's it! 🎉
