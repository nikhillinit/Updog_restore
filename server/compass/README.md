# Compass - Internal Valuation Sandbox

**⚠️ IMPORTANT DISCLAIMER**

This is an **internal decision-support tool** for GPs. Valuations shown are **FOR DISCUSSION ONLY** and do **NOT** represent official marks or NAV. Official valuations remain in the existing Excel-based process and are subject to auditor review.

## Purpose

Compass helps GPs:
- **Explore "what-if" scenarios** with different comps and assumptions
- **Validate intuition** before Investment Committee meetings
- **Prepare follow-on decisions** with implied multiple analysis
- **Visualize portfolio trends** across all companies

## What Compass Is NOT

- ❌ NOT for official LP reporting
- ❌ NOT IPEV-compliant (by design)
- ❌ NOT auditable or system of record
- ❌ NOT integrated with LP portals

## Architecture

```
Frontend (React)          Backend (Express)         Database
┌───────────────────┐    ┌──────────────────┐     ┌─────────────┐
│ Comp Selector UI  │───→│ /api/compass/    │────→│ PostgreSQL  │
│                   │    │   calculate      │     │ (compass    │
│ Real-time Calc    │←───│   search-comps   │←────│  schema)    │
│                   │    │   scenarios      │     └─────────────┘
│ Portfolio Heatmap │    └──────────────────┘              │
└───────────────────┘             │                        │
                                  ▼                        ▼
                          ┌──────────────────┐     ┌─────────────┐
                          │ Redis Cache      │     │ PitchBook   │
                          │ (Comp Data)      │     │ API         │
                          └──────────────────┘     └─────────────┘
```

## Quick Start

### 1. Database Setup

```bash
# Connect to PostgreSQL
psql -U postgres -d updog

# Run schema creation
\i server/compass/schema.sql

# Verify tables created
\dt compass.*
```

### 2. Start Backend

The Compass routes are auto-registered in `server/routes.ts`:

```bash
npm run dev:api
# Compass available at http://localhost:5000/api/compass/
```

### 3. Test Endpoints

```bash
# Health check
curl http://localhost:5000/api/compass/health

# Get valuation context for a company
curl http://localhost:5000/api/compass/portfolio-companies/{id}/valuation-context

# Calculate valuation
curl -X POST http://localhost:5000/api/compass/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "...",
    "inputs": {
      "revenue": 45000000,
      "selectedMultiple": 12.3,
      "iliquidityDiscount": 0.25,
      "controlPremium": 0
    },
    "compIds": ["pb_snowflake", "pb_datadog"]
  }'
```

## API Endpoints

### Core Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/compass/health` | Service health check |
| GET | `/api/compass/portfolio-companies/:id/valuation-context` | Get company data + suggested comps |
| GET | `/api/compass/comps/search?query=...` | Search for comparable companies |
| GET | `/api/compass/comps/:id` | Get full comp details |
| POST | `/api/compass/calculate` | Calculate sandbox valuation |
| POST | `/api/compass/scenarios` | Save a scenario |
| GET | `/api/compass/scenarios` | List user's scenarios |
| DELETE | `/api/compass/scenarios/:id` | Delete scenario |
| GET | `/api/compass/portfolio/heatmap` | Portfolio-wide view |

### Request/Response Examples

**Calculate Valuation**
```typescript
// POST /api/compass/calculate
{
  "companyId": "uuid",
  "inputs": {
    "revenue": 45000000,          // Annual revenue (USD)
    "selectedMultiple": 12.3,     // EV/Revenue multiple
    "iliquidityDiscount": 0.25,   // 25% discount
    "controlPremium": 0           // No premium
  },
  "compIds": ["pb_snowflake", "pb_datadog"]
}

// Response
{
  "result": {
    "sandboxValue": 415687500,
    "inputs": { ... },
    "compsUsed": ["pb_snowflake", "pb_datadog"],
    "metrics": {
      "baseEV": 553500000,
      "evWithControl": 553500000,
      "finalValue": 415125000,
      "impliedMultiple": 9.23,
      "vsLastRound": {
        "absoluteChange": 95687500,
        "percentChange": 29.9,
        "multipleChange": -2.17
      }
    },
    "calculatedAt": "2025-10-02T..."
  }
}
```

## Calculator Logic

See [calculator.ts](./calculator.ts) for full implementation.

**Formula:**
```
1. Base EV = Revenue × Selected Multiple
2. EV with Control = Base EV × (1 + Control Premium)
3. Final Value = EV with Control × (1 - Illiquidity Discount)
4. Sandbox Value = round(Final Value)
```

**Validation:**
- Revenue ≥ 0
- Multiple ≥ 0
- Illiquidity Discount: 0 to 1 (0% to 100%)
- Control Premium ≥ -1 (minimum -100%)

## Database Schema

### Key Tables

**compass.portfolio_company_metrics**
- Stores current revenue, last round data
- Used as input for valuations

**compass.comparable_companies_cache**
- Persistent cache of comp data from PitchBook
- Reduces API calls, enables offline work

**compass.valuation_scenarios**
- User-saved scenarios (personal bookmarks)
- Can be deleted without audit trail concerns

**compass.comp_usage_analytics**
- Tracks which comps are used most frequently
- Optimizes caching strategy

## Integration with PitchBook

### Setup

1. Get API credentials from PitchBook account manager
2. Add to `.env`:
```
PITCHBOOK_API_KEY=your_key_here
PITCHBOOK_API_SECRET=your_secret_here
```

3. Implement comp fetching service (TODO):
```typescript
// server/compass/services/pitchbook.ts
export async function fetchCompData(companyName: string) {
  // Call PitchBook API
  // Cache results in compass.comparable_companies_cache
  // Return comp data
}
```

### Caching Strategy

**2-Layer Cache:**
1. **Redis (Hot)**: 24hr TTL, ultra-fast lookups
2. **PostgreSQL (Persistent)**: Survives Redis flushes, queryable

**Cache Flow:**
```
Request → Check Redis → [HIT] Return
                ↓ [MISS]
          Check PostgreSQL → [HIT] Update Redis, Return
                ↓ [MISS]
          Call PitchBook API → Cache in Redis + PostgreSQL, Return
```

## Frontend Development

### React Components to Build

1. **CompSelector** - Checkbox list of comps with live median calculation
2. **ValuationSliders** - Interactive inputs (revenue, multiple, DLOM)
3. **LastRoundAnchor** - Display last round context
4. **SandboxValueDisplay** - Large number with breakdown
5. **PortfolioHeatmap** - Sortable table of all companies
6. **ScenarioManager** - Save/load/delete scenarios

### Example Component

```tsx
// client/src/pages/Compass/CompSelector.tsx
import { useState, useEffect } from 'react';
import { calculateMedianMultiple } from '@/lib/compass-calculator';

export function CompSelector({ onCompChange }) {
  const [selectedComps, setSelectedComps] = useState([]);
  const [medianMultiple, setMedianMultiple] = useState(0);

  useEffect(() => {
    const median = calculateMedianMultiple(selectedComps);
    setMedianMultiple(median);
    onCompChange(selectedComps, median);
  }, [selectedComps]);

  return (
    <div className="space-y-2">
      <h3>Select Comparable Companies</h3>
      {comps.map(comp => (
        <label key={comp.id}>
          <input
            type="checkbox"
            checked={selectedComps.includes(comp)}
            onChange={e => {
              if (e.target.checked) {
                setSelectedComps([...selectedComps, comp]);
              } else {
                setSelectedComps(selectedComps.filter(c => c.id !== comp.id));
              }
            }}
          />
          {comp.name} ({comp.evRevenueMultiple}x)
        </label>
      ))}
      <div className="font-bold">
        Median Multiple: {medianMultiple.toFixed(2)}x
      </div>
    </div>
  );
}
```

## Development Workflow (Intern-Led)

### Week 1-2: Backend Foundation
- [ ] Run schema.sql to create tables
- [ ] Test API endpoints with curl/Postman
- [ ] Validate calculator logic with test cases
- [ ] Document any formula questions for partners

### Week 3-4: Frontend MVP
- [ ] Build CompSelector component
- [ ] Build ValuationSliders component
- [ ] Wire up POST /calculate endpoint
- [ ] Display results with breakdown

### Week 5-6: Portfolio View
- [ ] Build PortfolioHeatmap table
- [ ] Add sorting/filtering
- [ ] Connect to GET /portfolio/heatmap

### Week 7-8: Polish
- [ ] Add scenario save/load
- [ ] Improve UI/UX based on GP feedback
- [ ] Add loading states, error handling

## Testing

### Unit Tests (Calculator Logic)

```typescript
import { calculateSandboxValuation, calculateMedianMultiple } from './calculator';

describe('calculateMedianMultiple', () => {
  it('returns 0 for empty array', () => {
    expect(calculateMedianMultiple([])).toBe(0);
  });

  it('calculates median for odd number of comps', () => {
    const comps = [
      { evRevenueMultiple: 10 },
      { evRevenueMultiple: 15 },
      { evRevenueMultiple: 20 },
    ];
    expect(calculateMedianMultiple(comps)).toBe(15);
  });

  it('calculates median for even number of comps', () => {
    const comps = [
      { evRevenueMultiple: 10 },
      { evRevenueMultiple: 20 },
    ];
    expect(calculateMedianMultiple(comps)).toBe(15);
  });
});

describe('calculateSandboxValuation', () => {
  it('validates negative revenue', () => {
    expect(() => calculateSandboxValuation({ revenue: -1000, ... })).toThrow();
  });

  it('calculates correct valuation', () => {
    const result = calculateSandboxValuation(
      {
        revenue: 10_000_000,
        selectedMultiple: 10,
        iliquidityDiscount: 0.25,
        controlPremium: 0,
      },
      comps,
      company
    );
    expect(result.sandboxValue).toBe(75_000_000); // 10M × 10 × 0.75
  });
});
```

### Integration Tests

```bash
# Test full flow: Create company → Search comps → Calculate → Save scenario
npm run test:integration
```

## Deployment

### Production Checklist

- [ ] Run database migrations on production PostgreSQL
- [ ] Set environment variables (PitchBook API keys)
- [ ] Deploy backend (ensure /api/compass routes are registered)
- [ ] Deploy frontend (build & serve React app)
- [ ] Monitor logs for errors
- [ ] Get GP feedback in first week

### Monitoring

```bash
# Check Compass service health
curl https://your-domain.com/api/compass/health

# Monitor Redis cache hit rate
redis-cli INFO stats | grep hit

# Check database query performance
SELECT * FROM pg_stat_statements WHERE query LIKE '%compass%' ORDER BY total_time DESC;
```

## FAQ

### Q: Can this replace our Excel valuation process?
**A: No.** Compass is explicitly for internal "what-if" analysis only. Official valuations must remain in Excel and be reviewed by auditors.

### Q: Should we show Compass outputs in LP reports?
**A: Absolutely not.** Compass is NOT for LP-facing materials. It has no audit trail and is not IPEV-compliant.

### Q: Can we use Compass valuations for follow-on decisions?
**A: Yes, as directional guidance.** GPs can use Compass to explore scenarios and inform their judgment, but final decisions should still be documented in official memos.

### Q: What if Compass and Excel show different numbers?
**A: Excel wins.** Compass is a sandbox; Excel is the source of truth. Any discrepancies should be investigated (likely different assumptions), but Excel always prevails for official purposes.

### Q: Can we add more features like Monte Carlo?
**A: Yes, but be careful.** Only add features that enhance the "sandbox" experience. Avoid anything that makes this feel like an official system (e.g., PDF reports, audit logs, approval workflows).

## Support

- **Technical Issues**: Check logs in `server/compass/`
- **Formula Questions**: Review `calculator.ts` or ask the intern/partners
- **Feature Requests**: Discuss with GPs first to ensure it fits the "sandbox" philosophy

## License

Internal tool for Press On Ventures. Not for external distribution.

---

**Built with love by the Compass team** 🧭
