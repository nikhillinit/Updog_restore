---
status: ACTIVE
audience: both
last_updated: 2026-06-23
owner: 'Platform Team'
review_cadence: P30D
categories: [design, audits, frontend, financial-calculations]
keywords: [client-derived-math, moic, overview-tab, provenance, trust-boundary]
---

# Client-derived math inventory: Portfolio OverviewTab

**Purpose:** catalog financial calculations that currently execute in the React
client instead of being sourced from computed, provenance-bearing API responses.
These are known trust-boundary violations flagged for the H0/H1 trust-audit
follow-up.

**Scope audited:** `client/src/components/portfolio/tabs/OverviewTab.tsx` as of
`main`.

**Method:** static trace of derived numeric values that are rendered as
financial metrics without a corresponding server-side calculation or
`FinancialProvenance` payload.

---

## Violation 1: per-company MOIC

- **File:** `client/src/components/portfolio/tabs/OverviewTab.tsx`
- **Lines:** 94-97
- **Code:**

```typescript
function buildPortfolioRow(company: PortfolioCompany): PortfolioRow {
  const invested = toNumber(company.investmentAmount);
  const currentValue = toNumber(company.currentValuation);
  const moic = invested > 0 ? currentValue / invested : 0;
  // ...
}
```

- **What is computed:** company-level MOIC =
  `currentValuation / investmentAmount`.
- **Why it is a violation:** the value is derived from raw string/number fields
  returned by `usePortfolioCompanies` (`/api/portfolio-companies`) and is not
  accompanied by a `FinancialProvenance` record. The same concept is computed
  server-side for the live reserves-MOIC ranking endpoint
  (`/api/funds/:fundId/moic/rankings`,
  `server/services/fund-moic-ranking-service.ts`), but the Overview table uses
  its own ad-hoc formula.
- **Rendered at:**
  - Mobile card: line 175 (`company.moic.toFixed(2)}x`)
  - Desktop table: line 606 (`company.moic.toFixed(2)}x`)

---

## Violation 2: portfolio-level average MOIC and return percentage

- **File:** `client/src/components/portfolio/tabs/OverviewTab.tsx`
- **Lines:** 234-242
- **Code:**

```typescript
const portfolioMetrics = useMemo(() => {
  const activeCompanies = companyRows.filter(
    (company) => !isExitedStatus(company.status)
  );
  const totalInvested = companyRows.reduce(
    (sum, company) => sum + company.invested,
    0
  );
  const totalValue = companyRows.reduce(
    (sum, company) => sum + company.currentValue,
    0
  );
  const averageMOIC =
    companyRows.length > 0
      ? companyRows.reduce((sum, company) => sum + company.moic, 0) /
        companyRows.length
      : 0;
  const returnPct =
    totalInvested > 0
      ? ((totalValue - totalInvested) / totalInvested) * 100
      : 0;

  return {
    totalCompanies: companyRows.length,
    activeCompanies: activeCompanies.length,
    exitedCompanies: companyRows.filter((company) =>
      isExitedStatus(company.status)
    ).length,
    totalInvested,
    totalValue,
    averageMOIC,
    returnPct,
  };
}, [companyRows]);
```

- **What is computed:**
  - `averageMOIC`: arithmetic mean of the already-client-derived per-company
    MOICs.
  - `returnPct`: simple total-return percentage across the portfolio
    (`(totalValue - totalInvested) / totalInvested * 100`).
- **Why it is a violation:** these are portfolio-level financial metrics
  computed from client-side intermediate values. There is no server-side
  aggregation endpoint returning these figures with provenance. In historical
  (`asOf`) mode the same client code path runs against time-machine data, so a
  future server-side replacement must preserve that contract.

---

## Violation 3: rendering of unaudited average MOIC and return percentage

- **File:** `client/src/components/portfolio/tabs/OverviewTab.tsx`
- **Lines:** 297-305 (mobile metric cards)
- **Code:**

```typescript
{
  id: 'value',
  title: isHistoricalMode ? 'Historical Value' : 'Current Value',
  value: formatCurrency(portfolioMetrics.totalValue),
  subtitle: isHistoricalMode ? `As of ${historicalLabel}` : 'Portfolio value',
  change: `${portfolioMetrics.returnPct >= 0 ? '+' : ''}${portfolioMetrics.returnPct.toFixed(1)}%`,
  trend: portfolioMetrics.returnPct > 0 ? 'up' : 'down',
  severity: portfolioMetrics.returnPct > 0 ? 'success' : 'warning',
  icon: Target,
},
{
  id: 'moic',
  title: 'Average MOIC',
  value: `${portfolioMetrics.averageMOIC.toFixed(2)}x`,
  subtitle: 'Multiple on invested capital',
  // ...
}
```

- **What is rendered:** mobile `SwipeableMetricCards` display the client-derived
  `returnPct` and `averageMOIC` as primary KPIs.
- **Additional desktop render site:** lines 544-555 (the four `KpiCard`
  components inside the hidden-on-mobile grid), specifically:
  - Line 547: `portfolioMetrics.returnPct.toFixed(1)}%`
  - Line 552: `portfolioMetrics.averageMOIC.toFixed(2)}x`
- **Why it is a violation:** these KPIs are presented to the user as
  authoritative portfolio performance numbers, yet they originate from client
  arithmetic rather than a computed, versioned, provenance-bearing API response.

---

## Recommended disposition

1. Do **not** perform additional client-side derivation for these metrics in new
   features.
2. When the portfolio summary API is extended, return `averageMOIC` and
   `returnPct` (or their replacements) with a `FinancialProvenance` payload.
3. Until a server-side source exists, treat these three locations as a
   documented exception and preserve the existing behavior to avoid UI drift.
4. If OverviewTab is refactored, route the metrics through the same fund-scoped
   `/api/funds/:fundId/moic/rankings` or a new portfolio-summary endpoint so the
   client becomes a pure renderer.

---

## Cross-references

- `docs/design/audits/2026-06-23-trust-audit.md` — API route scope and MOIC
  caller inventory.
- `docs/design/audits/2026-06-23-entity-access-boundary.md` — fund-scope
  enforcement for the underlying entity routes.
