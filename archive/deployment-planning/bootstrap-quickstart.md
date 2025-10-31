# 🚀 Bootstrap Quick Start

## TL;DR - Get Started in 30 Seconds

```cmd
REM 1. Right-click PowerShell → Run as Administrator
REM 2. Navigate to project
cd C:\dev\Updog_restore

REM 3. Run bootstrap
.\dev-bootstrap.bat
```

That's it! The script handles everything else.

---

## 📋 First Time Setup Checklist

- [ ] Run `dev-bootstrap.bat` as Administrator
- [ ] When prompted, create `.env.local` from example (press Y)
- [ ] Edit `.env.local` with your DATABASE_URL
- [ ] Generate secrets:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Paste secrets into `SESSION_SECRET` and `JWT_SECRET`
- [ ] Run `dev-bootstrap.bat` again

---

## 🎯 Common Commands

| Command                                                                                   | Description                    |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| `dev-bootstrap.bat`                                                                       | Normal mode (Redis via Docker) |
| `dev-bootstrap.bat -MemoryCache`                                                          | Skip Redis, use memory cache   |
| `dev-bootstrap.bat -LocalPostgres "postgres://postgres:postgres@localhost:5432/postgres"` | Use local Postgres             |

---

## 🔧 What You Need

### Minimum Requirements

- ✅ Node.js installed
- ✅ npm installed
- ✅ Administrator access

### Optional (for full features)

- Docker Desktop (for Redis/Postgres containers)
- OR Valkey for Windows (Redis alternative)
- OR Use `-MemoryCache` flag

---

## 🚨 Quick Troubleshooting

| Issue                | Solution                                  |
| -------------------- | ----------------------------------------- |
| "ECONNREFUSED 6379"  | Run with `-MemoryCache` flag              |
| "Cannot find module" | Script auto-installs, wait for completion |
| "Access denied"      | Run as Administrator                      |
| Dependencies fail    | Add Windows Defender exclusion for C:\dev |

---

## 📍 Key Files

- **`dev-bootstrap.bat`** ← Double-click this (as admin)
- **`.env.local`** ← Your config (create from .env.local.example)
- **`DEV_BOOTSTRAP_README.md`** ← Full documentation

---

## ✅ Success Indicators

You'll see:

```
✅ In C:\dev\Updog_restore
✅ Loaded .env.local
✅ Node processes terminated
✅ npm config cleaned
✅ vite, concurrently & tsx present
✅ Redis is listening on 6379
✅ Neon WebSocket constructor is wired

==> Starting dev servers (npm run dev)
```

Then your servers will start! 🎉

---

## 🆘 Still Stuck?

1. Read `DEV_BOOTSTRAP_README.md` for detailed docs
2. Check your `.env.local` has correct values
3. Try memory cache mode: `dev-bootstrap.bat -MemoryCache`
4. Verify Docker is running: `docker ps`
