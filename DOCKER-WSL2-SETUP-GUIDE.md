---
status: ACTIVE
last_updated: 2026-01-19
---

# Docker on ARM64 Windows - WSL2 Setup Guide

## Current Status: WORKING

Docker is **fully operational** using Docker Engine in WSL2.

### System Information
- **OS**: Windows 11 Home (Build 26200)
- **Architecture**: ARM64-based PC
- **WSL Version**: 2.6.3
- **Docker Version**: 28.3.2 (Docker Engine - Community)
- **Docker Architecture**: linux/arm64 (native ARM64)
- **Default Distribution**: Ubuntu-22.04

### Why Docker Desktop Doesn't Work
Docker Desktop requires Windows build 27653+ for ARM64 support (you have 26200). The workaround is using Docker Engine directly in WSL2, which works perfectly on your current Windows version.

---

## How to Use Docker

### Option 1: Run Docker from WSL2 (Recommended)
```bash
# Enter your Ubuntu WSL distribution
wsl -d Ubuntu-22.04

# Now you can use Docker normally
docker ps
docker images
docker run -it ubuntu bash
docker-compose up
```

### Option 2: Run Docker Commands from Windows PowerShell/CMD
```powershell
# Run any Docker command by prefixing with WSL
wsl -d Ubuntu-22.04 docker ps
wsl -d Ubuntu-22.04 docker run --rm hello-world
wsl -d Ubuntu-22.04 docker-compose up

# Or create an alias in PowerShell profile
function docker { wsl -d Ubuntu-22.04 docker @args }
```

### Option 3: Set Up PowerShell Alias (One-time Setup)
```powershell
# Open PowerShell profile
notepad $PROFILE

# Add this line:
function docker { wsl -d Ubuntu-22.04 docker @args }
function docker-compose { wsl -d Ubuntu-22.04 docker-compose @args }

# Save and reload
. $PROFILE

# Now you can use docker directly from PowerShell:
docker ps
docker run --rm hello-world
```

---

## Quick Reference

### Start Docker Service (if not running)
```bash
wsl -d Ubuntu-22.04 sudo service docker start
```

### Check Docker Status
```bash
wsl -d Ubuntu-22.04 sudo service docker status
```

### Stop Docker Service
```bash
wsl -d Ubuntu-22.04 sudo service docker stop
```

### Test Docker Installation
```bash
wsl -d Ubuntu-22.04 docker run --rm hello-world
```

---

## Working with Projects

### Your Current Project (Updog_restore)
Your project files in `c:/dev/Updog_restore` are accessible from WSL at:
```bash
/mnt/c/dev/Updog_restore
```

Example workflow:
```bash
# Enter WSL
wsl -d Ubuntu-22.04

# Navigate to your project
cd /mnt/c/dev/Updog_restore

# Run docker-compose or any Docker commands
docker-compose up
docker build -t myapp .
docker run -p 3000:3000 myapp
```

---

## Important Notes for ARM64

### Image Compatibility
1. **Prefer ARM64 or multi-arch images**: Most official images now support ARM64
2. **Check image architecture**: 
   ```bash
   docker image inspect <image-name> | grep Architecture
   ```
3. **Run x86_64 images (slower, emulated)**:
   ```bash
   docker run --platform linux/amd64 <image-name>
   ```

### Common Multi-Arch Images That Work Great
- `node`
- `python`
- `postgres`
- `redis`
- `nginx`
- `ubuntu`
- `alpine`

---

## Troubleshooting

### Docker Service Not Starting
```bash
wsl -d Ubuntu-22.04 sudo service docker start
```

### Permission Denied Errors
```bash
# Add your user to docker group (one-time setup)
wsl -d Ubuntu-22.04 sudo usermod -aG docker $USER

# Restart WSL
wsl --shutdown
wsl -d Ubuntu-22.04
```

### WSL Issues
```bash
# Restart WSL
wsl --shutdown
wsl -d Ubuntu-22.04
```

### Check Docker Logs
```bash
wsl -d Ubuntu-22.04 sudo journalctl -u docker.service -n 50
```

---

## Auto-Start Docker (Optional)

To auto-start Docker when WSL starts, add this to your `~/.bashrc` in WSL:

```bash
# Auto-start Docker
if ! service docker status > /dev/null 2>&1; then
    sudo service docker start > /dev/null 2>&1
fi
```

---

## Verified Working

- [x] Docker Engine 28.3.2 installed
- [x] Docker service running
- [x] ARM64 native support
- [x] `hello-world` container tested successfully
- [x] WSL 2 properly configured

---

## Running Testcontainers Integration Tests

This project uses [Testcontainers](https://node.testcontainers.org/) for integration testing with real PostgreSQL and Redis containers.

### From WSL2 (Local Development)
```bash
# Enter WSL
wsl -d Ubuntu-22.04

# Navigate to project
cd /mnt/c/dev/Updog_restore

# Ensure Docker is running
sudo service docker start

# Run testcontainers integration tests
npm test -- --config vitest.config.testcontainers.ts
```

### From Windows (Requires Docker in PATH)
Testcontainers needs Docker available. If using WSL2 Docker Engine, the tests must run from WSL2.

### CI Environment
Testcontainers tests run automatically on GitHub Actions via `.github/workflows/testcontainers-ci.yml`. The CI uses Ubuntu runners with native Docker support.

### Current Test Coverage
The testcontainers config (`vitest.config.testcontainers.ts`) includes:
- `tests/integration/testcontainers-smoke.test.ts` - Basic container connectivity
- `tests/integration/migration-runner.test.ts` - Drizzle migration utilities

### Troubleshooting Testcontainers

**Container startup timeout:**
```bash
# Increase timeout in test file
await new PostgreSqlContainer('pgvector/pgvector:pg16')
  .withStartupTimeout(120000)  // 2 minutes
  .start();
```

**Permission errors:**
```bash
# Ensure your user is in docker group
sudo usermod -aG docker $USER
# Restart WSL
wsl --shutdown
```

**Migration table not found:**
The project uses `migrationsSchema: 'public'` for drizzle migrations. If you see "drizzle_migrations does not exist", ensure the migration helper uses the correct schema.

---

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [WSL 2 Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Docker Hub](https://hub.docker.com/) (search for ARM64-compatible images)

---

## You're Ready to Go

Docker is fully operational on your ARM64 Windows system through WSL2. This setup is actually preferred by many developers as it provides a true Linux environment for Docker.

**Quick Test:**
```bash
wsl -d Ubuntu-22.04 docker run --rm -it ubuntu bash
```
