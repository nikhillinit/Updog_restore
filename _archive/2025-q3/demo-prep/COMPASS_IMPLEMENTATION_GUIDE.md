# COMPASS IMPLEMENTATION GUIDE

## For Intern + Dev Team - Complete Rollout Plan

**Project Status:** ✅ Backend foundation complete | ⏳ Frontend pending | ⏳
PitchBook integration pending

---

## 🎯 PROJECT OVERVIEW

**Goal:** Build an internal "valuation sandbox" where GPs can explore comp-based
valuations in real-time

**Timeline:** 3 months to MVP (6 months to full feature set)

**Your Role (Intern):**

- Product owner for Compass functionality
- Calculator logic validator
- Bridge between GPs (partners) and dev team
- Thesis: Document this as "Building Decision-Support Tools for VC Valuation"

---

## ✅ PHASE 0: COMPLETED (What's Already Done)

### Backend Files Created

```
server/compass/
├── types.ts              ✅ TypeScript interfaces for API
├── calculator.ts         ✅ Core valuation formulas
├── routes.ts            ✅ API endpoints (mock data for now)
├── schema.sql           ✅ PostgreSQL database schema
├── index.ts             ✅ Module exports
└── README.md            ✅ Technical documentation
```

### What Works Now

- ✅ Valuation calculator with input validation
- ✅ Median multiple calculation from comps
- ✅ API endpoint structure (returns mock data)
- ✅ Database schema designed

### What's Next

- ⏳ Connect API to real database
- ⏳ Build React frontend
- ⏳ Integrate PitchBook API
- ⏳ Deploy and test with GPs

---

## 📅 WEEK-BY-WEEK IMPLEMENTATION PLAN

### **WEEK 1: Setup & Backend Integration**

#### Day 1-2: Database Setup

**Intern Tasks:**

```bash
# 1. Connect to PostgreSQL
psql -U postgres -d updog_dev

# 2. Run schema creation
\i server/compass/schema.sql

# 3. Verify tables exist
\dt compass.*
# Should see: portfolio_company_metrics, comparable_companies_cache,
#             valuation_scenarios, comp_usage_analytics

# 4. Insert test data (already in schema.sql)
SELECT * FROM compass.portfolio_company_metrics;
# Should see: Acme AI Inc, CloudCo, DataViz Pro
```

**Validation:**

- [ ] All 4 tables exist in `compass` schema
- [ ] 3 portfolio companies seeded
- [ ] 3 comparable companies seeded

#### Day 3-4: Connect API to Database

**Dev Team Task (with Intern):**

Edit `server/compass/routes.ts` to replace mock data with real queries:

```typescript
// BEFORE (mock):
const company = {
  id: companyId,
  name: 'Acme AI Inc',
  currentRevenue: 45000000,
  ...
};

// AFTER (real query):
import { db } from '../db';

const result = await db.query(`
  SELECT
    id,
    company_name as name,
    current_revenue_usd as "currentRevenue",
    sector,
    stage,
    last_round_valuation_usd,
    last_round_date,
    last_round_revenue_usd,
    last_round_implied_multiple
  FROM compass.portfolio_company_metrics
  WHERE id = $1
`, [companyId]);

const company = result.rows[0];
if (!company) {
  return res.status(404).json({ error: 'Company not found' });
}
```

**Intern's Role:**

- Review SQL queries for correctness
- Test each endpoint with real data
- Document any edge cases found

**Validation:**

- [ ] GET /api/compass/portfolio-companies/:id/valuation-context returns real
      data
- [ ] POST /api/compass/calculate works with real company data
- [ ] Search endpoint returns comps from database

#### Day 5: Weekly Partner Review

**Agenda (90 minutes):**

- Demo: Working API endpoints with real data
- Show: Calculator logic validated against partners' Excel
- Discuss: Any formula adjustments needed
- Plan: Frontend mockup review

**Deliverables:**

- [ ] Partners approve calculator formulas
- [ ] Frontend wireframe sketched on whiteboard
- [ ] Next week's tasks clear

---

### **WEEK 2: Frontend Foundation**

#### Day 1-2: Create Compass Frontend Structure

**Dev Team Task:**

```bash
# Create new directory
mkdir -p client/src/pages/Compass
mkdir -p client/src/lib/compass

# Create route in App.tsx
# Add: <Route path="/compass" element={<CompassDashboard />} />
```

**Files to Create:**

**1. API Client (`client/src/lib/compass/api.ts`):**

```typescript
export async function getValuationContext(companyId: string) {
  const response = await fetch(
    `/api/compass/portfolio-companies/${companyId}/valuation-context`
  );
  return response.json();
}

export async function calculateValuation(request: CalculateValuationRequest) {
  const response = await fetch('/api/compass/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function searchComps(query: string) {
  const response = await fetch(`/api/compass/comps/search?query=${query}`);
  return response.json();
}
```

**2. Calculator Hook (`client/src/lib/compass/useValuationCalculator.ts`):**

```typescript
import { useState, useEffect } from 'react';
import type { ValuationInputs, ValuationResult } from '@/types/compass';

export function useValuationCalculator(
  initialInputs: ValuationInputs,
  comps: ComparableCompany[]
) {
  const [inputs, setInputs] = useState(initialInputs);
  const [result, setResult] = useState<ValuationResult | null>(null);

  // Client-side calculation for instant feedback
  useEffect(() => {
    // Calculate locally (using calculator logic ported to client)
    const calculated = calculateSandboxValuation(inputs, comps);
    setResult(calculated);
  }, [inputs, comps]);

  return {
    inputs,
    setInputs,
    result,
  };
}
```

**Intern's Role:**

- Port calculator.ts logic to TypeScript for client-side use
- Write unit tests for client-side calculator
- Ensure math matches server-side exactly

**Validation:**

- [ ] Client-side calculation matches server-side (test 10 scenarios)
- [ ] Sub-second recalculation when changing inputs

#### Day 3-4: Build Core UI Components

**Dev Team + Intern:**

**Component 1: Comp Selector**

```tsx
// client/src/pages/Compass/CompSelector.tsx
export function CompSelector({
  comps,
  selected,
  onSelectionChange,
}: CompSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredComps, setFilteredComps] = useState(comps);

  const median = calculateMedianMultiple(selected);

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search comps..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-4 py-2 border rounded"
      />

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredComps.map((comp) => (
          <label
            key={comp.id}
            className="flex items-center gap-2 p-2 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(comp)}
              onChange={(e) => {
                if (e.target.checked) {
                  onSelectionChange([...selected, comp]);
                } else {
                  onSelectionChange(selected.filter((c) => c.id !== comp.id));
                }
              }}
            />
            <div className="flex-1">
              <div className="font-medium">{comp.name}</div>
              <div className="text-sm text-gray-500">
                {comp.ticker} • {comp.evRevenueMultiple}x EV/Revenue
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="p-4 bg-blue-50 rounded">
        <div className="text-sm text-gray-600">Selected Median Multiple</div>
        <div className="text-2xl font-bold">{median.toFixed(2)}x</div>
      </div>
    </div>
  );
}
```

**Component 2: Valuation Inputs**

```tsx
// client/src/pages/Compass/ValuationInputs.tsx
export function ValuationInputs({ inputs, onChange }: ValuationInputsProps) {
  return (
    <div className="space-y-6">
      {/* Revenue Input */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Annual Revenue (USD)
        </label>
        <input
          type="number"
          value={inputs.revenue}
          onChange={(e) =>
            onChange({ ...inputs, revenue: Number(e.target.value) })
          }
          className="w-full px-4 py-2 border rounded"
        />
      </div>

      {/* Multiple Slider */}
      <div>
        <label className="block text-sm font-medium mb-2">
          EV/Revenue Multiple: {inputs.selectedMultiple.toFixed(1)}x
        </label>
        <input
          type="range"
          min="5"
          max="25"
          step="0.1"
          value={inputs.selectedMultiple}
          onChange={(e) =>
            onChange({ ...inputs, selectedMultiple: Number(e.target.value) })
          }
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>5x</span>
          <span>25x</span>
        </div>
      </div>

      {/* Illiquidity Discount Slider */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Illiquidity Discount: {(inputs.iliquidityDiscount * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0"
          max="0.5"
          step="0.01"
          value={inputs.iliquidityDiscount}
          onChange={(e) =>
            onChange({ ...inputs, iliquidityDiscount: Number(e.target.value) })
          }
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>0%</span>
          <span>50%</span>
        </div>
      </div>
    </div>
  );
}
```

**Component 3: Valuation Display**

```tsx
// client/src/pages/Compass/ValuationDisplay.tsx
export function ValuationDisplay({ result }: ValuationDisplayProps) {
  if (!result) {
    return <div>Enter inputs to calculate valuation...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Big Number */}
      <div className="p-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg text-white">
        <div className="text-sm opacity-80">Sandbox Valuation</div>
        <div className="text-4xl font-bold">
          {formatValuation(result.sandboxValue)}
        </div>
        <div className="text-sm opacity-80 mt-2">
          {result.metrics.impliedMultiple.toFixed(2)}x implied multiple
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Base EV</span>
          <span className="font-medium">
            {formatValuation(result.metrics.baseEV)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">After Control Premium</span>
          <span className="font-medium">
            {formatValuation(result.metrics.evWithControl)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">After Illiquidity Discount</span>
          <span className="font-medium">
            {formatValuation(result.metrics.finalValue)}
          </span>
        </div>
      </div>

      {/* vs Last Round */}
      {result.metrics.vsLastRound && (
        <div className="p-4 bg-gray-50 rounded">
          <div className="text-sm font-medium mb-2">vs. Last Round</div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-xs text-gray-600">Change</div>
              <div className="text-lg font-bold">
                {result.metrics.vsLastRound.percentChange > 0 ? '+' : ''}
                {result.metrics.vsLastRound.percentChange.toFixed(1)}%
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-600">Multiple Change</div>
              <div className="text-lg font-bold">
                {result.metrics.vsLastRound.multipleChange > 0 ? '+' : ''}
                {result.metrics.vsLastRound.multipleChange.toFixed(2)}x
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Validation:**

- [ ] Comp selector shows/hides comps with checkboxes
- [ ] Sliders update valuation in real-time (< 100ms)
- [ ] Large valuation number displays prominently
- [ ] Breakdown shows step-by-step calculation

#### Day 5: Weekly Partner Review

**Demo:**

- Partners can select comps and adjust sliders
- Valuation updates instantly
- Show breakdown calculation

**Feedback:**

- Which comps should be pre-selected?
- Are slider ranges appropriate?
- What additional context is needed?

---

### **WEEK 3-4: Portfolio Heatmap & Scenarios**

#### Portfolio Heatmap Table

**Goal:** Show all portfolio companies on one screen

```tsx
// client/src/pages/Compass/PortfolioHeatmap.tsx
export function PortfolioHeatmap() {
  const [entries, setEntries] = useState([]);
  const [sortBy, setSortBy] = useState('percentChange');

  useEffect(() => {
    fetch('/api/compass/portfolio/heatmap')
      .then((res) => res.json())
      .then((data) => setEntries(data.entries));
  }, []);

  const sorted = [...entries].sort((a, b) => {
    if (sortBy === 'percentChange') {
      return (
        (b.vsLastMark?.percentChange || 0) - (a.vsLastMark?.percentChange || 0)
      );
    }
    // Add other sort options
  });

  return (
    <table className="w-full">
      <thead>
        <tr>
          <th onClick={() => setSortBy('companyName')}>Company</th>
          <th onClick={() => setSortBy('stage')}>Stage</th>
          <th onClick={() => setSortBy('sandboxValue')}>Sandbox Value</th>
          <th onClick={() => setSortBy('percentChange')}>Change</th>
          <th>Implied Multiple</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((entry) => (
          <tr key={entry.companyId}>
            <td>{entry.companyName}</td>
            <td>{entry.stage}</td>
            <td>{formatValuation(entry.sandboxValue)}</td>
            <td
              className={
                entry.vsLastMark?.percentChange > 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }
            >
              {entry.vsLastMark?.percentChange > 0 ? '▲' : '▼'}
              {Math.abs(entry.vsLastMark?.percentChange || 0).toFixed(1)}%
            </td>
            <td>{entry.impliedMultiple.toFixed(2)}x</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

#### Scenario Save/Load

**Goal:** Personal bookmarks for scenarios

```tsx
// client/src/pages/Compass/ScenarioManager.tsx
export function ScenarioManager({ companyId, currentResult }) {
  const [scenarios, setScenarios] = useState([]);
  const [scenarioName, setScenarioName] = useState('');

  const handleSave = async () => {
    const response = await fetch('/api/compass/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolioCompanyId: companyId,
        scenarioName,
        result: currentResult,
      }),
    });
    const saved = await response.json();
    setScenarios([...scenarios, saved.scenario]);
    setScenarioName('');
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Scenario name (e.g., Base Case)"
          value={scenarioName}
          onChange={(e) => setScenarioName(e.target.value)}
          className="flex-1 px-4 py-2 border rounded"
        />
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Save Scenario
        </button>
      </div>

      <div className="space-y-2">
        {scenarios.map((scenario) => (
          <div
            key={scenario.id}
            className="p-3 border rounded hover:bg-gray-50"
          >
            <div className="font-medium">{scenario.scenarioName}</div>
            <div className="text-sm text-gray-600">
              {formatValuation(scenario.result.sandboxValue)} •
              {new Date(scenario.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Validation:**

- [ ] Can save scenarios with custom names
- [ ] Scenarios persist in database
- [ ] Can load saved scenario to restore inputs
- [ ] Can delete scenarios

---

### **WEEK 5-6: PitchBook Integration**

#### Setup API Credentials

**Intern Task:**

1. Contact PitchBook account manager
2. Request API access (Excel API or Data Management API)
3. Get credentials: API key + secret
4. Add to `.env`:

```
PITCHBOOK_API_KEY=your_key
PITCHBOOK_API_SECRET=your_secret
```

#### Build PitchBook Service

**Dev Team Task:**

```typescript
// server/compass/services/pitchbook.ts
import axios from 'axios';
import { db } from '../../db';

const PITCHBOOK_BASE_URL = 'https://api.pitchbook.com/v1'; // Example

export async function searchCompanies(query: string, sector?: string) {
  // 1. Check cache first
  const cached = await db.query(
    `
    SELECT * FROM compass.comparable_companies_cache
    WHERE company_name ILIKE $1
    AND ($2::text IS NULL OR sector = $2)
    AND last_fetched_at > NOW() - INTERVAL '24 hours'
  `,
    [`%${query}%`, sector]
  );

  if (cached.rows.length > 0) {
    return cached.rows;
  }

  // 2. Call PitchBook API
  const response = await axios.get(`${PITCHBOOK_BASE_URL}/companies/search`, {
    params: { q: query, sector },
    headers: {
      Authorization: `Bearer ${process.env.PITCHBOOK_API_KEY}`,
    },
  });

  // 3. Cache results
  for (const company of response.data.results) {
    await db.query(
      `
      INSERT INTO compass.comparable_companies_cache
        (pitchbook_id, company_name, sector, is_public, metrics, raw_data)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (pitchbook_id) DO UPDATE
        SET last_fetched_at = NOW(), fetch_count = fetch_count + 1
    `,
      [
        company.id,
        company.name,
        company.sector,
        company.isPublic,
        JSON.stringify({
          evRevenueMultiple: company.multiple,
          revenue: company.revenue,
        }),
        JSON.stringify(company),
      ]
    );
  }

  return response.data.results;
}
```

**Validation:**

- [ ] Can search for "Snowflake" and get results
- [ ] Results cached in database
- [ ] Subsequent searches use cache (< 50ms)
- [ ] Cache refresh after 24 hours

---

### **WEEK 7-8: Polish & GP Testing**

#### User Testing Session

**Schedule with each GP (1 hour each):**

1. Watch them use Compass for real IC prep
2. Note where they get stuck
3. Ask: "What's missing?"
4. Document feedback

#### Common Polish Items

- [ ] Loading states for API calls
- [ ] Error messages for invalid inputs
- [ ] Mobile-friendly layout (if needed)
- [ ] Keyboard shortcuts (e.g., Cmd+S to save scenario)
- [ ] Export to CSV (portfolio heatmap)
- [ ] Filters (stage, sector) on heatmap

#### Final Validation

- [ ] All GPs have tested and approved
- [ ] No critical bugs
- [ ] Performance < 1 second for calculations
- [ ] Partners use Compass in at least 1 IC meeting

---

## 🚀 DEPLOYMENT

### Pre-Deployment Checklist

- [ ] All database migrations run on production
- [ ] PitchBook API credentials set in production .env
- [ ] Redis cache configured
- [ ] Frontend build tested in production mode
- [ ] Monitoring/logging enabled

### Deployment Steps

```bash
# 1. Database migration
psql -h production-db.example.com -U app_user -d updog_prod
\i server/compass/schema.sql

# 2. Deploy backend
npm run build
# Deploy to your hosting (Heroku/Railway/AWS/etc.)

# 3. Deploy frontend
npm run build:client
# Deploy static files to CDN or serve from Express
```

### Post-Deployment

- [ ] Smoke test: Visit /compass and calculate 1 valuation
- [ ] Monitor logs for first week
- [ ] Schedule weekly GP check-ins

---

## 📊 SUCCESS METRICS

### Week 4 (MVP)

- [ ] 3+ GPs have used Compass
- [ ] 10+ valuations calculated
- [ ] 5+ scenarios saved
- [ ] Partners say "This is useful" (8/10 rating)

### Week 8 (Full Feature Set)

- [ ] All 4 GPs use weekly
- [ ] Used in 80% of IC meetings
- [ ] 10+ hours/week saved across team
- [ ] Zero requests to make it "official" (good sign!)

---

## 🎓 INTERN-SPECIFIC GUIDANCE

### Your Weekly Routine

**Monday:**

- Review last week's progress
- Plan this week's tasks with dev team

**Tuesday-Thursday:**

- Hands-on coding/testing
- Document questions for partners

**Friday (9am):**

- Demo progress to partners (90 min)
- Get feedback
- Update plan for next week

### Thesis Integration

**Chapter Mapping:**

1. **Lit Review:** Comps-based valuation theory → DONE by Month 2
2. **Methodology:** Calculator formulas + API design → DONE by Month 3
3. **Implementation:** System architecture + UI/UX → DONE by Month 4
4. **Validation:** User testing + GP feedback → DONE by Month 5
5. **Results:** Usage metrics + time saved → DONE by Month 6

### Skills You'll Learn

- ✅ **Finance:** DCF, comps, illiquidity discounts
- ✅ **Backend:** Express APIs, PostgreSQL, caching
- ✅ **Frontend:** React, real-time UIs, state management
- ✅ **Product:** User research, iterative design
- ✅ **Communication:** Bridging business + technical teams

---

## 📞 SUPPORT

**Questions?**

- **Technical:** Ask dev team lead
- **Formula:** Ask partners (Friday sessions)
- **General:** Check server/compass/README.md

**Stuck?**

- Don't spin your wheels > 30 minutes
- Post in Slack or schedule quick call
- "I tried X, expected Y, got Z" is the best way to ask for help

---

## 🎉 YOU'VE GOT THIS!

Remember: This is a **sandbox tool**, not brain surgery. Iterate fast, get
feedback early, and have fun building something GPs will actually use.

The best feature is a simple feature that ships. Don't over-engineer.

**Shipping > Perfection**

---

_Last Updated: 2025-10-02_
