# Investment-Rounds UI (v2 look, live data) + Flag Enablement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Workflow contract:** every code/test edit is dispatched via Hermes (`node orchestrate.js --phase production --task "..."`), each diff reviewed before commit. The local box is Node 24 (outside engine range) and missing vite modules, so trust CI for the suite: dispatch `gh workflow run ci-unified.yml --ref docs/investment-rounds-ui-v2-spec -f run_full_suite=true` after each phase.

**Goal:** Ship a flag-gated (`enable_investment_rounds`) investment-rounds surface on the live `/portfolio/company/:id` page — presson-v2 visual treatment on real, fund-scoped data — then ramp the flag dev→staging→prod.

**Architecture:** A new `<InvestmentRoundsSection>` mounts on the live company page behind `useFlag`. It bridges `companyId`→`investmentId` via a fund-scoped investments query, lists current rounds (read+write), draws a data-driven pv2 trajectory ribbon, and opens a full-pv2 dialog wired through the existing `toInvestmentRoundCreatePayload` serializer + `useCreateRound`. Supersede is exposed per row; the list endpoint returns current rounds only, so the only derivable status is `corrected`.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Radix Dialog (shadcn) for a11y mechanics, presson-v2 CSS vocabulary, Vitest + React Testing Library (client/jsdom project), Zod contracts in `@shared`.

**Spec:** `docs/superpowers/specs/2026-06-21-investment-rounds-ui-v2-design.md`

---

## File Structure

**New files**
- `client/src/hooks/useCompanyInvestments.ts` — fund-scoped investments, filtered by companyId.
- `client/src/hooks/useInvestmentRounds.ts` — current rounds for an investment.
- `client/src/lib/investment-round-error.ts` — status/errorCode → user message.
- `client/src/components/investments/rounds-table.tsx` — pv2 list + per-row supersede + add.
- `client/src/components/investments/trajectory-ribbon.tsx` — data-driven pv2 ribbon.
- `client/src/components/investments/investment-rounds-section.tsx` — orchestrator (resolver + list + ribbon + dialog).
- Tests alongside each (`*.test.ts[x]`).

**Modified files**
- `client/src/styles/presson-v2.css` — append pv2 form-control classes (reduced-motion-safe).
- `client/src/components/investments/new-round-dialog.tsx` — rewire + full pv2 restyle + field changes + charcoal.
- `client/src/pages/portfolio-company-summary.tsx` — flag-gated mount of the section.
- `flags/registry.yaml` (+ regenerated artifacts) — Part B ramps.

**Untouched:** server routes/contract/service (already landed); `add-event-dropdown.tsx` (orphaned, off the v1 path).

---

## Phase A — UI (flag OFF)

### Task 1: `useCompanyInvestments` hook

**Files:**
- Create: `client/src/hooks/useCompanyInvestments.ts`
- Test: `client/src/hooks/useCompanyInvestments.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCompanyInvestments } from './useCompanyInvestments';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});
const mockApi = vi.mocked(apiRequest);

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useCompanyInvestments', () => {
  beforeEach(() => mockApi.mockReset());

  it('filters fund investments down to the company', async () => {
    mockApi.mockResolvedValue([
      { id: 1, fundId: 7, companyId: 42 },
      { id: 2, fundId: 7, companyId: 99 },
      { id: 3, fundId: 7, companyId: 42 },
    ] as never);
    const { result } = renderHook(() => useCompanyInvestments(7, 42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApi).toHaveBeenCalledWith('GET', '/api/investments?fundId=7');
    expect(result.current.investments.map((i) => i.id)).toEqual([1, 3]);
  });

  it('is disabled without both ids', () => {
    const { result } = renderHook(() => useCompanyInvestments(undefined, 42), { wrapper: wrapper() });
    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.investments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/hooks/useCompanyInvestments.test.tsx`
Expected: FAIL — `useCompanyInvestments` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import { useQuery } from '@tanstack/react-query';
import type { Investment } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

export function companyInvestmentsQueryKey(
  fundId: number | undefined,
  companyId: number | undefined
) {
  return ['company-investments', fundId ?? null, companyId ?? null] as const;
}

export function useCompanyInvestments(
  fundId: number | undefined,
  companyId: number | undefined
) {
  const query = useQuery<Investment[]>({
    queryKey: companyInvestmentsQueryKey(fundId, companyId),
    enabled: fundId != null && companyId != null,
    staleTime: 60_000,
    queryFn: async () => {
      const all = await apiRequest<Investment[]>('GET', `/api/investments?fundId=${fundId}`);
      return all.filter((inv) => inv.companyId === companyId);
    },
  });

  return {
    investments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --project=client client/src/hooks/useCompanyInvestments.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useCompanyInvestments.ts client/src/hooks/useCompanyInvestments.test.tsx
git commit -m "feat(investment-rounds): useCompanyInvestments bridge hook"
```

---

### Task 2: `useInvestmentRounds` hook

**Files:**
- Create: `client/src/hooks/useInvestmentRounds.ts`
- Test: `client/src/hooks/useInvestmentRounds.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInvestmentRounds } from './useInvestmentRounds';
import { investmentRoundsQueryKey } from './useCreateRound';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});
const mockApi = vi.mocked(apiRequest);

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useInvestmentRounds', () => {
  beforeEach(() => mockApi.mockReset());

  it('unwraps the list response under the shared query key', async () => {
    mockApi.mockResolvedValue({ data: [{ id: 5 }, { id: 6 }] } as never);
    const { result } = renderHook(() => useInvestmentRounds(3), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApi).toHaveBeenCalledWith('GET', '/api/investments/3/rounds');
    expect(result.current.rounds.map((r) => r.id)).toEqual([5, 6]);
    // shares the key useCreateRound invalidates
    expect(investmentRoundsQueryKey(3)).toEqual(['investment-rounds', 3]);
  });

  it('is disabled without an investmentId', () => {
    const { result } = renderHook(() => useInvestmentRounds(undefined), { wrapper: wrapper() });
    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.rounds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/hooks/useInvestmentRounds.test.tsx`
Expected: FAIL — `useInvestmentRounds` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import { useQuery } from '@tanstack/react-query';
import type {
  InvestmentRoundListResponse,
  InvestmentRoundResponse,
} from '@shared/contracts/investments/investment-round.contract';
import { apiRequest } from '@/lib/queryClient';
import { investmentRoundsQueryKey } from '@/hooks/useCreateRound';

export function useInvestmentRounds(investmentId: number | undefined) {
  const query = useQuery<InvestmentRoundResponse[]>({
    queryKey: investmentRoundsQueryKey(investmentId),
    enabled: investmentId != null,
    queryFn: async () => {
      const res = await apiRequest<InvestmentRoundListResponse>(
        'GET',
        `/api/investments/${investmentId}/rounds`
      );
      return res.data;
    },
  });

  return {
    rounds: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --project=client client/src/hooks/useInvestmentRounds.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useInvestmentRounds.ts client/src/hooks/useInvestmentRounds.test.tsx
git commit -m "feat(investment-rounds): useInvestmentRounds list hook (current-only)"
```

---

### Task 3: round error-message mapper

**Files:**
- Create: `client/src/lib/investment-round-error.ts`
- Test: `client/src/lib/investment-round-error.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/queryClient';
import { roundErrorMessage } from './investment-round-error';

describe('roundErrorMessage', () => {
  it('distinguishes 409 sub-codes via errorCode', () => {
    expect(roundErrorMessage(new ApiError(409, 'x', 'round_already_superseded'))).toMatch(/already corrected/i);
    expect(roundErrorMessage(new ApiError(409, 'x', 'idempotency_key_reused'))).toMatch(/duplicate/i);
  });

  it('maps auth and not-found states', () => {
    expect(roundErrorMessage(new ApiError(401, 'x'))).toMatch(/session expired/i);
    expect(roundErrorMessage(new ApiError(403, 'x'))).toMatch(/access to this fund/i);
    expect(roundErrorMessage(new ApiError(404, 'x', 'supersede_target_missing'))).toMatch(/correcting no longer exists/i);
    expect(roundErrorMessage(new ApiError(400, 'x', 'supersede_target_other_investment'))).toMatch(/different investment/i);
  });

  it('falls back for non-ApiError', () => {
    expect(roundErrorMessage(new Error('boom'))).toMatch(/something went wrong/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/lib/investment-round-error.test.ts`
Expected: FAIL — `roundErrorMessage` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import { ApiError } from '@/lib/queryClient';

const GENERIC = 'Something went wrong saving the round. Try again.';

export function roundErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  const code = error.errorCode;
  switch (error.status) {
    case 400:
      if (code === 'supersede_target_other_investment') return 'That round belongs to a different investment.';
      if (code === 'fundId mismatch') return 'Internal fund mismatch. Refresh and retry.';
      return 'Check the highlighted fields and try again.';
    case 401:
      return 'Your session expired. Sign in and retry.';
    case 403:
      return "You don't have access to this fund.";
    case 404:
      if (code === 'supersede_target_missing') return 'The round you are correcting no longer exists. Refresh and retry.';
      return 'That investment no longer exists. Refresh and retry.';
    case 409:
      if (code === 'round_already_superseded') return 'This round was already corrected. Refresh to see the latest.';
      return 'This looks like a duplicate submission. Refresh and retry.';
    case 428:
      return 'Could not submit the round (missing precondition). Refresh and retry.';
    default:
      return GENERIC;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --project=client client/src/lib/investment-round-error.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/investment-round-error.ts client/src/lib/investment-round-error.test.ts
git commit -m "feat(investment-rounds): truthful round error-message mapper"
```

---

### Task 4: round formatting util (shared by table + ribbon)

**Files:**
- Create: `client/src/lib/investment-round-format.ts`
- Test: `client/src/lib/investment-round-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { formatRoundMoney, formatRoundDate } from './investment-round-format';

describe('investment-round-format', () => {
  it('formats ISO-currency decimal strings as whole money', () => {
    expect(formatRoundMoney('25000', 'USD')).toBe('$25,000');
    expect(formatRoundMoney(null, 'USD')).toBe('—');
    expect(formatRoundMoney('not-a-number', 'USD')).toBe('—');
  });

  it('formats YYYY-MM-DD in UTC (no off-by-one)', () => {
    expect(formatRoundDate('2024-06-01')).toBe('Jun 1, 2024');
    expect(formatRoundDate('')).toBe('Unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/lib/investment-round-format.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
export function formatRoundMoney(amount: string | null | undefined, currency: string): string {
  if (amount == null) return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString('en-US')}`;
  }
}

export function formatRoundDate(roundDate: string): string {
  if (!roundDate) return 'Unknown';
  const parsed = new Date(`${roundDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --project=client client/src/lib/investment-round-format.test.ts`
Expected: PASS (2 tests). Note: the suite runs under `TZ=UTC`, so the date assertion is stable.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/investment-round-format.ts client/src/lib/investment-round-format.test.ts
git commit -m "feat(investment-rounds): shared money/date formatters"
```

---

### Task 5: pv2 form-control CSS (reduced-motion-safe)

**Files:**
- Modify: `client/src/styles/presson-v2.css` (append at end of file)

No unit test (pure CSS). DESIGN.md compliance: token-driven, charcoal focus ring, no entrance motion (so reduced-motion is satisfied by construction; the file's existing `@media (prefers-reduced-motion: no-preference)` block is not regressed).

- [ ] **Step 1: Append the form-control classes**

```css

/* ── Investment-rounds form controls (pv2) ───────────────────────────────
   Token-driven, no transitions on entrance; safe under reduced-motion. */
.pv2-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.pv2-label {
  font-family: var(--pv2-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--pv2-mute);
}
.pv2-input,
.pv2-select {
  font-family: var(--pv2-font-mono);
  font-size: 14px;
  color: var(--pv2-ink);
  background: #fff;
  border: 1px solid var(--pv2-rule, #E0D8D1);
  border-radius: 4px;
  padding: 8px 10px;
  font-variant-numeric: tabular-nums;
}
.pv2-input:focus-visible,
.pv2-select:focus-visible {
  outline: none;
  border-color: var(--pv2-ink);
  box-shadow: 0 0 0 3px rgba(41, 41, 41, 0.25);
}
.pv2-supersede-banner {
  font-family: var(--pv2-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--pv2-ink);
  background: var(--pv2-warm);
  border: 1px solid var(--pv2-rule, #E0D8D1);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 16px;
}
.pv2-form-error {
  font-family: var(--pv2-font-mono);
  font-size: 11px;
  color: var(--pv2-neg);
  margin-top: 8px;
}
.pv2-rounds-empty {
  font-family: var(--pv2-font-mono);
  font-size: 12px;
  color: var(--pv2-mute);
  padding: 24px 0;
  text-align: center;
}
```

- [ ] **Step 2: Verify no token regression**

Run: `npm run lint -- client/src/styles/presson-v2.css 2>/dev/null || npm run check`
Expected: no new errors (CSS is not type-checked; this just confirms the build still parses). Manual: classes use only existing `--pv2-*` vars (`--pv2-ink`, `--pv2-mute`, `--pv2-warm`, `--pv2-rule`, `--pv2-neg`, `--pv2-font-mono`).

- [ ] **Step 3: Commit**

```bash
git add client/src/styles/presson-v2.css
git commit -m "feat(investment-rounds): pv2 form-control styles (reduced-motion safe)"
```

---

### Task 6: `<RoundsTable>` (pv2 list, read + per-row supersede)

**Files:**
- Create: `client/src/components/investments/rounds-table.tsx`
- Test: `client/src/components/investments/rounds-table.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { RoundsTable } from './rounds-table';

function round(over: Partial<InvestmentRoundResponse>): InvestmentRoundResponse {
  return {
    id: 1, investmentId: 3, fundId: 7, roundName: 'Seed', securityType: 'equity',
    roundDate: '2024-06-01', currency: 'USD', investmentAmount: '25000',
    roundSize: null, preMoneyValuation: null, supersedesRoundId: null,
    createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z', etag: 'W/"1"',
    ...over,
  };
}

describe('RoundsTable', () => {
  it('shows the corrected tag only when supersedesRoundId is set', () => {
    render(
      <RoundsTable
        rounds={[round({ id: 1, roundName: 'Seed' }), round({ id: 2, roundName: 'Series A', supersedesRoundId: 1 })]}
        onAdd={() => {}}
        onSupersede={() => {}}
      />
    );
    expect(screen.getAllByText(/corrected/i)).toHaveLength(1);
    expect(screen.getByText('Series A')).toBeInTheDocument();
  });

  it('wires add and per-row supersede', () => {
    const onAdd = vi.fn();
    const onSupersede = vi.fn();
    const r = round({ id: 9, roundName: 'Seed' });
    render(<RoundsTable rounds={[r]} onAdd={onAdd} onSupersede={onSupersede} />);
    fireEvent.click(screen.getByRole('button', { name: /add round/i }));
    fireEvent.click(screen.getByRole('button', { name: /^correct$/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSupersede).toHaveBeenCalledWith(r);
  });

  it('renders an empty state', () => {
    render(<RoundsTable rounds={[]} onAdd={() => {}} onSupersede={() => {}} />);
    expect(screen.getByText(/no rounds recorded/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/components/investments/rounds-table.test.tsx`
Expected: FAIL — `RoundsTable` is not defined.

- [ ] **Step 3: Write minimal implementation**

```tsx
import type { CSSProperties } from 'react';
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { Btn, ChartCard, Tag } from '@/components/presson-v2/primitives';
import { formatRoundDate, formatRoundMoney } from '@/lib/investment-round-format';

const SECURITY_LABEL: Record<string, string> = {
  equity: 'Equity',
  convertible_note: 'Convertible Note',
  safe: 'SAFE',
  warrant: 'Warrant',
  other: 'Other',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--pv2-mute)',
  padding: '6px 8px',
  borderBottom: '1px solid var(--pv2-rule, #E0D8D1)',
};
const tdStyle: CSSProperties = { padding: '8px', fontSize: 13, color: 'var(--pv2-ink)' };
const numStyle: CSSProperties = { ...tdStyle, fontVariantNumeric: 'tabular-nums' };

interface RoundsTableProps {
  rounds: InvestmentRoundResponse[];
  onAdd: () => void;
  onSupersede: (round: InvestmentRoundResponse) => void;
}

export function RoundsTable({ rounds, onAdd, onSupersede }: RoundsTableProps) {
  return (
    <ChartCard title="Investment rounds" meta={<Btn primary onClick={onAdd}>Add round</Btn>}>
      {rounds.length === 0 ? (
        <div className="pv2-rounds-empty">No rounds recorded yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Round', 'Security', 'Date', 'Investment', 'Round size', 'Pre-money', ''].map((h, i) => (
                <th key={h || `actions-${i}`} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id} data-testid="round-row">
                <td style={tdStyle}>
                  {r.roundName}{' '}
                  {r.supersedesRoundId != null && <Tag>corrected</Tag>}
                </td>
                <td style={tdStyle}><Tag>{SECURITY_LABEL[r.securityType] ?? r.securityType}</Tag></td>
                <td style={numStyle}>{formatRoundDate(r.roundDate)}</td>
                <td style={numStyle}>{formatRoundMoney(r.investmentAmount, r.currency)}</td>
                <td style={numStyle}>{formatRoundMoney(r.roundSize, r.currency)}</td>
                <td style={numStyle}>{formatRoundMoney(r.preMoneyValuation, r.currency)}</td>
                <td style={tdStyle}><Btn onClick={() => onSupersede(r)}>Correct</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --project=client client/src/components/investments/rounds-table.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/investments/rounds-table.tsx client/src/components/investments/rounds-table.test.tsx
git commit -m "feat(investment-rounds): pv2 RoundsTable with corrected tag + supersede action"
```

---

### Task 7: `<TrajectoryRibbon>` (data-driven pv2 ribbon)

**Files:**
- Create: `client/src/components/investments/trajectory-ribbon.tsx`
- Test: `client/src/components/investments/trajectory-ribbon.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { TrajectoryRibbon } from './trajectory-ribbon';

function round(over: Partial<InvestmentRoundResponse>): InvestmentRoundResponse {
  return {
    id: 1, investmentId: 3, fundId: 7, roundName: 'Seed', securityType: 'equity',
    roundDate: '2024-06-01', currency: 'USD', investmentAmount: '25000',
    roundSize: null, preMoneyValuation: null, supersedesRoundId: null,
    createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z', etag: 'W/"1"',
    ...over,
  };
}

describe('TrajectoryRibbon', () => {
  it('renders one node per round, sorted by date ascending', () => {
    render(
      <TrajectoryRibbon
        rounds={[
          round({ id: 2, roundName: 'Series A', roundDate: '2025-01-10' }),
          round({ id: 1, roundName: 'Seed', roundDate: '2024-06-01' }),
        ]}
      />
    );
    const nodes = screen.getAllByTestId('ribbon-node');
    expect(nodes).toHaveLength(2);
    // earliest date renders first
    expect(nodes[0]).toHaveTextContent('Seed');
    expect(nodes[1]).toHaveTextContent('Series A');
  });

  it('centers a single round without NaN positions', () => {
    const { container } = render(<TrajectoryRibbon rounds={[round({ id: 1 })]} />);
    const circle = container.querySelector('circle[cx]') as SVGCircleElement;
    expect(Number.isFinite(Number(circle.getAttribute('cx')))).toBe(true);
  });

  it('renders nothing for no rounds', () => {
    const { container } = render(<TrajectoryRibbon rounds={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/components/investments/trajectory-ribbon.test.tsx`
Expected: FAIL — `TrajectoryRibbon` is not defined.

- [ ] **Step 3: Write minimal implementation**

```tsx
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { presson } from '@/theme/presson.tokens';
import { formatRoundDate, formatRoundMoney } from '@/lib/investment-round-format';

const WIDTH = 1180;
const PAD = 80;
const Y = 120;

export function TrajectoryRibbon({ rounds }: { rounds: InvestmentRoundResponse[] }) {
  if (rounds.length === 0) return null;

  const sorted = [...rounds].sort((a, b) => a.roundDate.localeCompare(b.roundDate));
  const times = sorted.map((r) => Date.parse(`${r.roundDate}T00:00:00Z`));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = max - min;
  const inner = WIDTH - PAD * 2;

  const xFor = (i: number): number => {
    if (sorted.length === 1) return PAD + inner / 2;
    if (span === 0) return PAD + (i * inner) / (sorted.length - 1);
    return PAD + ((times[i]! - min) / span) * inner;
  };

  return (
    <svg viewBox={`0 0 ${WIDTH} 200`} role="img" aria-label="Capital trajectory" style={{ width: '100%', height: 200 }}>
      <line x1={PAD} y1={Y} x2={WIDTH - PAD} y2={Y} stroke={presson.color.highlight} strokeWidth={2} />
      {sorted.map((r, i) => {
        const x = xFor(i);
        return (
          <g key={r.id} data-testid="ribbon-node" fontFamily="JetBrains Mono" fontSize={10} fill={presson.color.textMuted}>
            <circle cx={x} cy={Y} r={7} fill={presson.color.text} />
            <text x={x} y={Y - 16} textAnchor="middle" fill={presson.color.text} fontFamily="Inter" fontSize={12} fontWeight={600}>
              {formatRoundMoney(r.investmentAmount, r.currency)}
            </text>
            <text x={x} y={Y + 24} textAnchor="middle" fill={presson.color.text} fontWeight={600}>
              {r.roundName}
            </text>
            <text x={x} y={Y + 38} textAnchor="middle">{formatRoundDate(r.roundDate)}</text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --project=client client/src/components/investments/trajectory-ribbon.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/investments/trajectory-ribbon.tsx client/src/components/investments/trajectory-ribbon.test.tsx
git commit -m "feat(investment-rounds): data-driven pv2 trajectory ribbon"
```

---

### Task 8: rework `new-round-dialog.tsx` (wire API + full pv2 + field changes)

**Files:**
- Modify (full rewrite): `client/src/components/investments/new-round-dialog.tsx`
- Test: `client/src/components/investments/new-round-dialog.test.tsx`

Removes: month free-text, graduation rate, advanced share data, client-side
Post-money/Ownership calc block, blue/yellow classes. Adds: real `type="date"`,
pv2 controls, charcoal, serializer + `useCreateRound` wiring, supersede banner,
truthful errors.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/queryClient';
import NewRoundDialog from './new-round-dialog';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/hooks/useCreateRound', async (orig) => {
  const actual = await orig<typeof import('@/hooks/useCreateRound')>();
  return { ...actual, useCreateRound: () => ({ mutate, isPending: false }) };
});

function fill() {
  fireEvent.change(screen.getByLabelText(/round name/i), { target: { value: 'Series A' } });
  fireEvent.change(screen.getByLabelText(/round date/i), { target: { value: '2024-06-01' } });
  fireEvent.change(screen.getByLabelText(/investment amount/i), { target: { value: '25000' } });
}

describe('NewRoundDialog', () => {
  beforeEach(() => mutate.mockReset());

  it('omits deferred fields', () => {
    render(<NewRoundDialog isOpen onOpenChange={() => {}} investmentId={3} fundId={7} />);
    expect(screen.queryByLabelText(/graduation/i)).toBeNull();
    expect(screen.queryByText(/advanced share data/i)).toBeNull();
    expect(screen.queryByText(/post-money/i)).toBeNull();
    expect((screen.getByLabelText(/round date/i) as HTMLInputElement).type).toBe('date');
  });

  it('serializes the form and closes on success', () => {
    const onOpenChange = vi.fn();
    mutate.mockImplementation((_p, opts) => opts?.onSuccess?.());
    render(<NewRoundDialog isOpen onOpenChange={onOpenChange} investmentId={3} fundId={7} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /add round/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).toMatchObject({ fundId: 7, roundName: 'Series A', roundDate: '2024-06-01', securityType: 'equity', currency: 'USD', investmentAmount: '25000' });
    expect(payload).not.toHaveProperty('supersedesRoundId');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a truthful error and stays open on failure', () => {
    const onOpenChange = vi.fn();
    mutate.mockImplementation((_p, opts) => opts?.onError?.(new ApiError(409, 'x', 'idempotency_key_reused')));
    render(<NewRoundDialog isOpen onOpenChange={onOpenChange} investmentId={3} fundId={7} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /add round/i }));
    expect(screen.getByText(/duplicate submission/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('pre-seeds supersedesRoundId and shows the correcting banner', () => {
    mutate.mockImplementation((_p, opts) => opts?.onSuccess?.());
    render(
      <NewRoundDialog
        isOpen
        onOpenChange={() => {}}
        investmentId={3}
        fundId={7}
        supersedesRound={{ id: 11, roundName: 'Seed', roundDate: '2023-01-01' }}
      />
    );
    expect(screen.getByText(/correcting/i)).toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /save correction/i }));
    expect(mutate.mock.calls[0][0]).toMatchObject({ supersedesRoundId: 11 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/components/investments/new-round-dialog.test.tsx`
Expected: FAIL — current dialog has no `investmentId`/`fundId` props and does not call the API.

- [ ] **Step 3: Write the implementation (full file replacement)**

```tsx
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Btn } from '@/components/presson-v2/primitives';
import { useCreateRound } from '@/hooks/useCreateRound';
import {
  toInvestmentRoundCreatePayload,
  type InvestmentRoundEditForm,
} from '@/lib/investment-round-edit-model';
import { roundErrorMessage } from '@/lib/investment-round-error';

interface SupersedeTarget {
  id: number;
  roundName: string;
  roundDate: string;
}

interface NewRoundDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  investmentId: number;
  fundId: number;
  companyName?: string;
  supersedesRound?: SupersedeTarget | null;
}

const SECURITY_OPTIONS = ['Equity', 'Convertible Note', 'SAFE', 'Warrant', 'Other'];
const CURRENCY_OPTIONS = [
  'United States Dollar ($)',
  'Euro (€)',
  'British Pound (£)',
  'Canadian Dollar (CAD)',
];

export default function NewRoundDialog({
  isOpen,
  onOpenChange,
  investmentId,
  fundId,
  companyName,
  supersedesRound,
}: NewRoundDialogProps) {
  const [securityType, setSecurityType] = useState('Equity');
  const [roundName, setRoundName] = useState('');
  const [roundDate, setRoundDate] = useState('');
  const [currency, setCurrency] = useState('United States Dollar ($)');
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [roundSize, setRoundSize] = useState('');
  const [preMoneyValuation, setPreMoneyValuation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreateRound(investmentId);
  const isCorrection = supersedesRound != null;

  const reset = () => {
    setSecurityType('Equity');
    setRoundName('');
    setRoundDate('');
    setCurrency('United States Dollar ($)');
    setInvestmentAmount('');
    setRoundSize('');
    setPreMoneyValuation('');
    setError(null);
  };

  const close = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleSave = () => {
    setError(null);
    if (!roundName.trim() || !roundDate || investmentAmount.trim() === '') {
      setError('Round name, date, and investment amount are required.');
      return;
    }

    const form: InvestmentRoundEditForm = {
      roundName: roundName.trim(),
      securityType,
      roundDate,
      currency,
      investmentAmount: Number(investmentAmount),
      roundSize: roundSize.trim() === '' ? null : Number(roundSize),
      preMoneyValuation: preMoneyValuation.trim() === '' ? null : Number(preMoneyValuation),
      supersedesRoundId: supersedesRound?.id ?? null,
    };

    let payload;
    try {
      payload = toInvestmentRoundCreatePayload(form, fundId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid round values.');
      return;
    }

    mutation.mutate(payload, {
      onSuccess: () => close(false),
      onError: (e) => setError(roundErrorMessage(e)),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCorrection ? 'Correct round' : 'Add round'}</DialogTitle>
          <DialogDescription>
            {isCorrection
              ? 'Record a corrected round; the original is superseded.'
              : `Add an investment round${companyName ? ` for ${companyName}` : ''}.`}
          </DialogDescription>
        </DialogHeader>

        {isCorrection && supersedesRound && (
          <div className="pv2-supersede-banner">
            Correcting {supersedesRound.roundName} ({supersedesRound.roundDate})
          </div>
        )}

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-security">Security type</label>
          <select id="round-security" className="pv2-select" value={securityType} onChange={(e) => setSecurityType(e.target.value)}>
            {SECURITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-name">Round name</label>
          <input id="round-name" className="pv2-input" value={roundName} onChange={(e) => setRoundName(e.target.value)} placeholder="Series A" />
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-date">Round date</label>
          <input id="round-date" type="date" className="pv2-input" value={roundDate} onChange={(e) => setRoundDate(e.target.value)} />
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-currency">Currency</label>
          <select id="round-currency" className="pv2-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-amount">Investment amount</label>
          <input id="round-amount" className="pv2-input" inputMode="decimal" value={investmentAmount} onChange={(e) => setInvestmentAmount(e.target.value)} placeholder="25000" />
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-size">Round size (optional)</label>
          <input id="round-size" className="pv2-input" inputMode="decimal" value={roundSize} onChange={(e) => setRoundSize(e.target.value)} />
        </div>

        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-premoney">Pre-money valuation (optional)</label>
          <input id="round-premoney" className="pv2-input" inputMode="decimal" value={preMoneyValuation} onChange={(e) => setPreMoneyValuation(e.target.value)} />
        </div>

        {error && <div className="pv2-form-error" role="alert">{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12 }}>
          <Btn onClick={() => close(false)}>Cancel</Btn>
          <Btn primary onClick={handleSave}>
            {mutation.isPending ? 'Saving…' : isCorrection ? 'Save correction' : 'Add round'}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --project=client client/src/components/investments/new-round-dialog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Update the orphaned consumer's prop call (compile guard)**

`add-event-dropdown.tsx` passes the old `investment={{id,company}}` prop shape and
will no longer typecheck. It is not on the v1 live path. Make its `NewRoundDialog`
usage compile by passing the new props from a numeric id, or remove that dialog
from the dropdown for now. Minimal change — replace the `<NewRoundDialog .../>` in
`add-event-dropdown.tsx` with a typed stub call guarded by a numeric id:

```tsx
{investment?.id && /^\d+$/.test(investment.id) && (
  <NewRoundDialog
    isOpen={showNewRoundDialog}
    onOpenChange={setShowNewRoundDialog}
    investmentId={Number(investment.id)}
    fundId={0}
    companyName={investment.company}
  />
)}
```

Note: `add-event-dropdown` remains mounted on no live route, so `fundId={0}` is
inert here; the live path passes a real `fundId` from `InvestmentRoundsSection`
(Task 9). Run `npm run check` to confirm the repo typechecks.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/investments/new-round-dialog.tsx client/src/components/investments/new-round-dialog.test.tsx client/src/components/investments/add-event-dropdown.tsx
git commit -m "feat(investment-rounds): wire + pv2-restyle round dialog, drop deferred fields"
```

---

### Task 9: `<InvestmentRoundsSection>` (resolver + list + ribbon + dialog)

**Files:**
- Create: `client/src/components/investments/investment-rounds-section.tsx`
- Test: `client/src/components/investments/investment-rounds-section.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestmentRoundsSection } from './investment-rounds-section';
import { useCompanyInvestments } from '@/hooks/useCompanyInvestments';
import { useInvestmentRounds } from '@/hooks/useInvestmentRounds';

vi.mock('@/hooks/useCompanyInvestments', () => ({ useCompanyInvestments: vi.fn() }));
vi.mock('@/hooks/useInvestmentRounds', () => ({ useInvestmentRounds: vi.fn() }));
vi.mock('./new-round-dialog', () => ({ default: () => <div data-testid="round-dialog" /> }));

const mockInvestments = vi.mocked(useCompanyInvestments);
const mockRounds = vi.mocked(useInvestmentRounds);

beforeEach(() => {
  mockInvestments.mockReset();
  mockRounds.mockReset();
  mockRounds.mockReturnValue({ rounds: [], isLoading: false, error: null });
});

describe('InvestmentRoundsSection', () => {
  it('shows the no-investment empty state', () => {
    mockInvestments.mockReturnValue({ investments: [], isLoading: false, error: null });
    render(<InvestmentRoundsSection fundId={7} companyId={42} />);
    expect(screen.getByText(/nothing to attach a round to/i)).toBeInTheDocument();
  });

  it('auto-selects the single investment and lists rounds', () => {
    mockInvestments.mockReturnValue({
      investments: [{ id: 5, round: 'Seed', amount: '1000', companyId: 42, fundId: 7 }] as never,
      isLoading: false,
      error: null,
    });
    render(<InvestmentRoundsSection fundId={7} companyId={42} />);
    expect(mockRounds).toHaveBeenCalledWith(5);
    expect(screen.getByText(/investment rounds/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^investment$/i)).toBeNull(); // no picker for a single investment
  });

  it('renders an investment picker when there are several', () => {
    mockInvestments.mockReturnValue({
      investments: [
        { id: 5, round: 'Seed', amount: '1000', companyId: 42, fundId: 7 },
        { id: 6, round: 'Series A', amount: '5000', companyId: 42, fundId: 7 },
      ] as never,
      isLoading: false,
      error: null,
    });
    render(<InvestmentRoundsSection fundId={7} companyId={42} />);
    expect(screen.getByLabelText(/^investment$/i)).toBeInTheDocument();
    expect(screen.getByText(/select an investment to view/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/components/investments/investment-rounds-section.test.tsx`
Expected: FAIL — `InvestmentRoundsSection` is not defined.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useState } from 'react';
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { ChartCard } from '@/components/presson-v2/primitives';
import { useCompanyInvestments } from '@/hooks/useCompanyInvestments';
import { useInvestmentRounds } from '@/hooks/useInvestmentRounds';
import { formatRoundMoney } from '@/lib/investment-round-format';
import { RoundsTable } from './rounds-table';
import { TrajectoryRibbon } from './trajectory-ribbon';
import NewRoundDialog from './new-round-dialog';

interface SupersedeTarget {
  id: number;
  roundName: string;
  roundDate: string;
}

interface InvestmentRoundsSectionProps {
  fundId: number;
  companyId: number;
  companyName?: string;
}

export function InvestmentRoundsSection({
  fundId,
  companyId,
  companyName,
}: InvestmentRoundsSectionProps) {
  const { investments, isLoading } = useCompanyInvestments(fundId, companyId);
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [supersedeTarget, setSupersedeTarget] = useState<SupersedeTarget | null>(null);

  const selectedInvestmentId =
    picked ?? (investments.length === 1 ? investments[0]!.id : undefined);
  const { rounds } = useInvestmentRounds(selectedInvestmentId);

  if (isLoading) {
    return <div className="pv2-rounds-empty">Loading rounds…</div>;
  }

  if (investments.length === 0) {
    return (
      <ChartCard title="Investment rounds">
        <div className="pv2-rounds-empty">
          No investment is recorded for this company yet, so there is nothing to attach a round to.
        </div>
      </ChartCard>
    );
  }

  const openAdd = () => {
    setSupersedeTarget(null);
    setDialogOpen(true);
  };
  const openSupersede = (r: InvestmentRoundResponse) => {
    setSupersedeTarget({ id: r.id, roundName: r.roundName, roundDate: r.roundDate });
    setDialogOpen(true);
  };

  return (
    <section data-testid="investment-rounds-section">
      {investments.length > 1 && (
        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-investment">Investment</label>
          <select
            id="round-investment"
            className="pv2-select"
            value={selectedInvestmentId ?? ''}
            onChange={(e) => setPicked(Number(e.target.value))}
          >
            <option value="" disabled>Select an investment…</option>
            {investments.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.round} · {formatRoundMoney(inv.amount, 'USD')} · #{inv.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedInvestmentId == null ? (
        <ChartCard title="Investment rounds">
          <div className="pv2-rounds-empty">Select an investment to view its rounds.</div>
        </ChartCard>
      ) : (
        <>
          <TrajectoryRibbon rounds={rounds} />
          <RoundsTable rounds={rounds} onAdd={openAdd} onSupersede={openSupersede} />
          <NewRoundDialog
            isOpen={dialogOpen}
            onOpenChange={setDialogOpen}
            investmentId={selectedInvestmentId}
            fundId={fundId}
            companyName={companyName}
            supersedesRound={supersedeTarget}
          />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --project=client client/src/components/investments/investment-rounds-section.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/investments/investment-rounds-section.tsx client/src/components/investments/investment-rounds-section.test.tsx
git commit -m "feat(investment-rounds): InvestmentRoundsSection orchestrator (0/1/many resolver)"
```

---

### Task 10: flag-gated mount on the live company page

**Files:**
- Modify: `client/src/pages/portfolio-company-summary.tsx`
- Test: `client/src/pages/portfolio-company-summary.rounds.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PortfolioCompanySummaryPage from './portfolio-company-summary';
import { usePortfolioCompany } from '@/hooks/use-fund-data';
import { useFlag } from '@/shared/useFlags';

vi.mock('wouter', () => ({
  useRoute: () => [true, { id: '42' }],
  useLocation: () => ['/portfolio/company/42', vi.fn()],
}));
vi.mock('@/contexts/FundContext', () => ({ useFundContext: () => ({ fundId: 7 }) }));
vi.mock('@/hooks/use-fund-data', () => ({ usePortfolioCompany: vi.fn() }));
vi.mock('@/shared/useFlags', () => ({ useFlag: vi.fn() }));
vi.mock('@/components/investments/investment-rounds-section', () => ({
  InvestmentRoundsSection: () => <div data-testid="rounds-section" />,
}));

const mockCompany = vi.mocked(usePortfolioCompany);
const mockFlag = vi.mocked(useFlag);

beforeEach(() => {
  mockCompany.mockReturnValue({
    company: {
      id: 42, name: 'Acme', sector: 'SaaS', stage: 'Series A', status: 'active',
      investmentAmount: '1000', currentValuation: '2000', fundId: 7,
    } as never,
    isLoading: false,
    error: null,
  });
});

describe('PortfolioCompanySummaryPage rounds mount', () => {
  it('renders the section when the flag is on', () => {
    mockFlag.mockReturnValue(true);
    render(<PortfolioCompanySummaryPage />);
    expect(screen.getByTestId('rounds-section')).toBeInTheDocument();
  });

  it('hides the section when the flag is off', () => {
    mockFlag.mockReturnValue(false);
    render(<PortfolioCompanySummaryPage />);
    expect(screen.queryByTestId('rounds-section')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --project=client client/src/pages/portfolio-company-summary.rounds.test.tsx`
Expected: FAIL — page does not render the section / does not call `useFlag`.

- [ ] **Step 3: Add the import + flag hook**

Add near the existing imports:

```tsx
import { useFlag } from '@/shared/useFlags';
import { InvestmentRoundsSection } from '@/components/investments/investment-rounds-section';
```

Inside `PortfolioCompanySummaryPage`, just after `const { fundId } = useFundContext();`:

```tsx
  const roundsEnabled = useFlag('enable_investment_rounds');
```

- [ ] **Step 4: Render the section inside the loaded-company branch**

In the `company && detailMetrics ? ( ... )` block, after the closing
`</div>` of the `<div className="grid gap-6 md:grid-cols-2">` two-card grid and
before the fragment closes, insert:

```tsx
            {roundsEnabled && companyId != null && fundId != null && (
              <InvestmentRoundsSection fundId={fundId} companyId={companyId} companyName={company.name} />
            )}
```

(Leave the existing "rounds... remain outside the live portfolio path" copy as-is;
it still describes cap table / performance / documents / scenario workflows. A
copy tweak to drop the word "rounds" when the flag is on is optional and not
required for correctness.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --project=client client/src/pages/portfolio-company-summary.rounds.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
npm run check
git add client/src/pages/portfolio-company-summary.tsx client/src/pages/portfolio-company-summary.rounds.test.tsx
git commit -m "feat(investment-rounds): flag-gated mount on live company page"
```

- [ ] **Step 7: Full-suite CI on the branch (Phase A gate)**

```bash
gh workflow run ci-unified.yml --ref docs/investment-rounds-ui-v2-spec -f run_full_suite=true
```
Expected: green. Grep the client test job for the new files' suites.

---

## Phase B — Flag ramp (after Phase A soaks)

> Per spec §9. The flag is UI-only; the API is already live since #891/#892.
> **Do not ramp to prod until real investments exist for the target fund's
> companies** (the panel shows the 0-investment empty state otherwise).

### Task 11: enable in dev

**Files:**
- Modify: `flags/registry.yaml`
- Regenerate: flag artifacts via `npm run flags:generate`

- [ ] **Step 1: Flip the dev environment in the registry**

In `flags/registry.yaml`, under `enable_investment_rounds.environments`, set
`development: true` (leave `default: false` and `staging: false`):

```yaml
  enable_investment_rounds:
    default: false
    description: 'Investment round persistence'
    owner: 'gp-team'
    risk: medium
    exposeToClient: true
    environments:
      development: true
      staging: false
```

- [ ] **Step 2: Regenerate generated flag artifacts**

Run: `npm run flags:generate`
Expected: updates the generated flag definitions; commit whatever it regenerates.

- [ ] **Step 3: Dev smoke (manual)**

In a dev session against a fund whose companies have investment rows: open a
company with an investment, add a round (verify it appears in the list + ribbon),
then "Correct" it (verify the original drops out and the corrected row shows the
`corrected` tag). Confirm a 0-investment company shows the empty state cleanly.

- [ ] **Step 4: Commit**

```bash
git add flags/registry.yaml
git add -A   # include regenerated flag artifacts
git commit -m "chore(flags): enable_investment_rounds on in development"
```

### Staging + prod (separate gated PRs)

- **Staging:** set `staging: true`; soak against real Postgres; watch logs for
  5xx and fund-scope; confirm writes. Rollback: `staging: false`.
- **Prod:** set `production: true` (registry) + redeploy, **only after** confirming
  real investments exist for target companies and staging soak is clean. Rollback:
  flag OFF + redeploy (UI hides; API stays mounted; rows persist).

Soak windows are confirmed with the user at ramp time; this plan fixes the order
and gates, not calendar dates.

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- §4.1 useCompanyInvestments → Task 1; §4.3 useInvestmentRounds → Task 2;
  §5 error map → Task 3; shared formatters (§4.4/4.5 UTC dates) → Task 4;
  §4.7 pv2 form CSS → Task 5; §4.5 RoundsTable → Task 6; §4.4 ribbon → Task 7;
  §4.6 dialog rework → Task 8; §4.2 resolver + §3 orchestration → Task 9;
  §host mount + flag gating → Task 10; §9 Part B ramp → Task 11.
- §6 supersede flow → Tasks 6 (action) + 8 (pre-seed) + 2 (current-only list).
- §7 trust/design compliance → enforced in Tasks 5–8 (charcoal, tabular-nums,
  reduced-motion, dropped calc block).

**2. Placeholder scan** — no TBD/TODO/"handle edge cases"; every code step shows
full code; every command states expected output.

**3. Type consistency** — `investmentRoundsQueryKey` reused from `useCreateRound`
in Tasks 2/9; `InvestmentRoundResponse` used consistently; `InvestmentRoundEditForm`
fields in Task 8 match `investment-round-edit-model.ts` (roundName, securityType,
roundDate, currency, investmentAmount:number, roundSize?, preMoneyValuation?,
supersedesRoundId?); `roundErrorMessage` signature consistent across Tasks 3/8;
`formatRoundMoney`/`formatRoundDate` signatures consistent across Tasks 4/6/7/9.

Known residual (flagged, not a blocker): `add-event-dropdown.tsx` stays off the
live path; Task 8 Step 5 keeps it compiling with an inert `fundId={0}`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-investment-rounds-ui-v2.md`.

Per the workflow contract, code/test edits are dispatched via Hermes
(`node orchestrate.js --phase production --task "..."`), one task at a time, with
each diff reviewed before commit and full-suite CI on the branch after Phase A.

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — batch execution with checkpoints.
