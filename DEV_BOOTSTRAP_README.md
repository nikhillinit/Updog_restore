# Dev Bootstrap System

Complete Windows development environment setup for Updog_restore.

## 🚀 Quick Start

### Option 1: Using the Batch Launcher (Easiest)
```cmd
REM Right-click and "Run as Administrator"
dev-bootstrap.bat
```

### Option 2: Direct PowerShell
```powershell
# Run in Administrator PowerShell
.\dev-bootstrap.ps1
```

## 📋 What It Does

The bootstrap script automatically:

1. ✅ **Kills stray Node processes** - Clean slate for development
2. ✅ **Installs all dependencies** - Including dev dependencies (vite, concurrently, tsx)
3. ✅ **Sets up Redis** - Tries Docker first, falls back gracefully
4. ✅ **Installs Neon deps** - `@neondatabase/serverless` + `ws` for WebSocket support
5. ✅ **Loads `.env.local`** - Auto-loads environment variables into the session
6. ✅ **Validates setup** - Checks for Neon WebSocket wiring
7. ✅ **Starts dev servers** - Runs `npm run dev`

## 🎯 Usage Examples

### Normal Mode (with Redis via Docker)
```cmd
dev-bootstrap.bat
```

### Memory Cache Mode (skip Redis)
```cmd
dev-bootstrap.bat -MemoryCache
```

### Local Postgres (instead of Neon)
```cmd
dev-bootstrap.bat -LocalPostgres "postgres://postgres:postgres@localhost:5432/postgres"
```

### Combined Flags
```cmd
dev-bootstrap.bat -MemoryCache -LocalPostgres "postgres://postgres:postgres@localhost:5432/postgres"
```

## 🔧 Setup Steps

### First Time Setup

1. **Copy the environment template**
   ```cmd
   copy .env.local.example .env.local
   ```
   
   Or let the script create it automatically on first run.

2. **Edit `.env.local`** with your actual values:
   - `DATABASE_URL` - Your Neon connection string or local Postgres
   - `SESSION_SECRET` - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `JWT_SECRET` - Generate with the same command
   - Other optional settings as needed

3. **Run the bootstrap script**
   ```cmd
   dev-bootstrap.bat
   ```

## 📁 Files Created

- **`dev-bootstrap.ps1`** - Main PowerShell bootstrap script
- **`dev-bootstrap.bat`** - Batch launcher for easy execution
- **`.env.local.example`** - Template for environment variables
- **`server/bootstrap.ts`** - Modified with Neon WebSocket wiring

## 🔍 What Was Modified

### `server/bootstrap.ts`
Added Neon WebSocket constructor wiring at the top:
```typescript
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;
```

This is **required** for Neon serverless to work in Node.js (Node 20+ has fetch but not WebSocket).

## ⚙️ Environment Variables

Key variables in `.env.local`:

```bash
# Core
NODE_ENV=development
PORT=5000

# Database (choose one)
DATABASE_URL=postgres://user:pass@project.neon.tech/db?sslmode=require  # Neon
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres      # Local

# Cache (choose one)
REDIS_URL=redis://127.0.0.1:6379  # Redis
# REDIS_URL=memory://              # In-memory fallback

# Security
SESSION_SECRET=your-32-char-secret-here
JWT_SECRET=your-32-char-secret-here
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:5175
```

See `.env.local.example` for all available options.

## 🐳 Redis Options

### Option 1: Docker (Automatic)
The script automatically starts Redis via Docker:
```bash
docker run -d --name dev-redis -p 6379:6379 redis:7
```

### Option 2: Valkey for Windows
Download and install [Valkey for Windows](https://github.com/valkey-io/valkey) (Redis-compatible).

### Option 3: Memory Cache (No Redis)
Use the `-MemoryCache` flag to bypass Redis entirely:
```cmd
dev-bootstrap.bat -MemoryCache
```

## 🗄️ Database Options

### Option 1: Neon (Serverless Postgres)
1. Sign up at [console.neon.tech](https://console.neon.tech)
2. Create a project and get your connection string
3. Add to `.env.local`:
   ```
   DATABASE_URL=postgres://user:pass@project.neon.tech/db?sslmode=require
   ```

### Option 2: Local Postgres
```bash
# Via Docker
docker run -d --name dev-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16

# In .env.local
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
```

Or use the flag:
```cmd
dev-bootstrap.bat -LocalPostgres "postgres://postgres:postgres@localhost:5432/postgres"
```

## 🚨 Troubleshooting

### "ECONNREFUSED 127.0.0.1:6379"
Redis isn't running. Options:
1. Ensure Docker is running: `docker ps`
2. Or use memory mode: `dev-bootstrap.bat -MemoryCache`
3. Or install Valkey for Windows

### "Cannot find module '@neondatabase/serverless'"
The bootstrap script will install it automatically. If it fails:
```bash
npm i @neondatabase/serverless ws
```

### "WebSocket constructor not found"
Ensure `server/bootstrap.ts` has the Neon wiring (already added by this setup).

### "vite or concurrently not found"
```bash
npm install --include=dev
```

### Windows Defender Blocking
Add exclusion for `C:\dev`:
1. Windows Security → Virus & threat protection
2. Manage settings → Exclusions → Add folder
3. Select `C:\dev`

## 📊 Verification Commands

After running the bootstrap, verify everything is working:

```powershell
# Check Redis
netstat -ano | findstr :6379

# Check Neon connectivity (if using Neon)
Test-NetConnection your-project.neon.tech -Port 443

# Check installed packages
npm ls vite
npm ls concurrently
npm ls @neondatabase/serverless
npm ls ws

# View environment
$env:DATABASE_URL
$env:REDIS_URL
$env:NODE_ENV
```

## 🎓 Next Steps

After successful bootstrap:

1. **Access the application**
   - API: http://localhost:5000
   - Frontend: http://localhost:5173 (or port shown in terminal)

2. **Run database migrations** (if needed)
   ```bash
   npm run db:migrate
   ```

3. **Seed development data** (if available)
   ```bash
   npm run db:seed
   ```

## 🔄 Daily Development

After initial setup, simply run:
```cmd
dev-bootstrap.bat
```

This ensures:
- All dependencies are up to date
- Redis is running
- Environment is loaded
- Servers start cleanly

## 📝 Notes

- **Admin privileges required** - The script kills processes and manages Docker
- **First run takes longer** - Installs all dependencies
- **Subsequent runs are fast** - Only validates and starts services
- **Press Ctrl+C** to stop the dev servers

## 🆘 Support

If you encounter issues:

1. Check the terminal output for specific error messages
2. Verify your `.env.local` has correct values
3. Ensure Docker is running (if using Redis/Postgres via Docker)
4. Try with `-MemoryCache` flag for simpler setup
5. Delete `node_modules` and rerun if dependencies are corrupted

---

**Happy coding! 🚀**
