# COMPASS QUICKSTART
## Get Running in 15 Minutes

---

## ✅ PRE-FLIGHT CHECKLIST

Before starting, ensure you have:
- [ ] PostgreSQL running locally
- [ ] Node.js v18+ installed
- [ ] Database `updog_dev` created
- [ ] Terminal access

---

## 🚀 5-STEP SETUP

### 1. Create Database Schema (2 minutes)

```bash
# Connect to your local PostgreSQL
psql -U postgres -d updog_dev

# Run the schema creation script
\i server/compass/schema.sql

# Verify tables were created
\dt compass.*
# You should see: portfolio_company_metrics, comparable_companies_cache,
#                 valuation_scenarios, comp_usage_analytics

# Check seed data
SELECT * FROM compass.portfolio_company_metrics;
# You should see: Acme AI Inc, CloudCo, DataViz Pro

# Exit psql
\q
```

**Expected Output:**
```
CREATE SCHEMA
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
INSERT 0 3
INSERT 0 3
```

---

### 2. Register Routes in Server (1 minute)

Edit `server/routes.ts` and add after the other route imports:

```typescript
// Add at top with other imports
import { compassRoutes } from './compass/index.js';

// Add with other app.use() calls (around line 50-60)
app.use('/api/compass', compassRoutes);
```

Save the file.

---

### 3. Start the Backend (1 minute)

```bash
# From project root
npm run dev:api

# Wait for server to start...
# You should see: "Server running on http://localhost:5000"
```

Keep this terminal running.

---

### 4. Test API Endpoints (5 minutes)

Open a new terminal and test each endpoint:

```bash
# Test 1: Health check
curl http://localhost:5000/api/compass/health

# Expected: {"service":"compass","status":"healthy",...}

# Test 2: Get valuation context (use a real company ID from your DB)
curl http://localhost:5000/api/compass/portfolio-companies/COMPANY_ID_HERE/valuation-context

# Expected: JSON with company data and suggested comps

# Test 3: Calculate valuation
curl -X POST http://localhost:5000/api/compass/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "COMPANY_ID_HERE",
    "inputs": {
      "revenue": 45000000,
      "selectedMultiple": 12.3,
      "iliquidityDiscount": 0.25,
      "controlPremium": 0
    },
    "compIds": ["pb_snowflake", "pb_datadog"]
  }'

# Expected: JSON with calculated valuation result

# Test 4: Search comps
curl "http://localhost:5000/api/compass/comps/search?query=Snowflake"

# Expected: JSON with search results

# Test 5: Portfolio heatmap
curl http://localhost:5000/api/compass/portfolio/heatmap

# Expected: JSON with all portfolio companies
```

**All 5 tests pass?** ✅ Backend is working!

---

### 5. Explore the Code (5 minutes)

```bash
# Read the core calculator
cat server/compass/calculator.ts

# Read the API routes
cat server/compass/routes.ts

# Read the database schema
cat server/compass/schema.sql

# Read the types
cat server/compass/types.ts
```

---

## 🎯 YOU'RE READY!

The backend is now running and responding to API calls.

### Next Steps

**For Intern:**
1. Read: `COMPASS_IMPLEMENTATION_GUIDE.md`
2. Start: Week 1 tasks (connect API to real database)
3. Schedule: Kickoff meeting with partners

**For Dev Team:**
1. Review: `server/compass/README.md`
2. Replace: Mock data with real database queries in `routes.ts`
3. Build: Frontend components (see implementation guide)

**For Partners:**
1. Read: `COMPASS_EXECUTIVE_SUMMARY.md`
2. Review: Formula in `calculator.ts`
3. Prepare: First case study for Workshop 1

---

## 🐛 TROUBLESHOOTING

### "Cannot find module './compass/index.js'"
**Fix:** Ensure the files were created in `server/compass/` directory
```bash
ls -la server/compass/
# Should show: calculator.ts, index.ts, routes.ts, schema.sql, types.ts
```

### "Database 'updog_dev' does not exist"
**Fix:** Create the database first
```bash
psql -U postgres -c "CREATE DATABASE updog_dev;"
```

### "Port 5000 already in use"
**Fix:** Kill the process on port 5000
```bash
# Mac/Linux
lsof -ti:5000 | xargs kill -9

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID_FROM_ABOVE> /F
```

### "Connection refused to PostgreSQL"
**Fix:** Start PostgreSQL
```bash
# Mac (Homebrew)
brew services start postgresql

# Linux
sudo service postgresql start

# Windows
# Start PostgreSQL service from Services app
```

### API returns 404
**Fix:** Check that routes are registered correctly
```bash
# Search for compass routes in server/routes.ts
grep -n "compass" server/routes.ts

# Should see: app.use('/api/compass', compassRoutes);
```

---

## 📚 DOCUMENTATION INDEX

| Document | Purpose | Audience |
|----------|---------|----------|
| `COMPASS_QUICKSTART.md` | Get running in 15 min | Everyone |
| `COMPASS_EXECUTIVE_SUMMARY.md` | Project overview & timeline | Partners |
| `COMPASS_IMPLEMENTATION_GUIDE.md` | Week-by-week plan | Intern + Devs |
| `server/compass/README.md` | Technical deep-dive | Dev Team |

**Read them in that order.** ⬆️

---

## 🎉 SUCCESS!

If you got here and all tests passed, you're ready to build Compass!

**Questions?**
- Check `server/compass/README.md` for technical details
- Read `COMPASS_IMPLEMENTATION_GUIDE.md` for next steps
- Ask in Slack if stuck

**Ship it!** 🚀

---

*Last Updated: 2025-10-02*
