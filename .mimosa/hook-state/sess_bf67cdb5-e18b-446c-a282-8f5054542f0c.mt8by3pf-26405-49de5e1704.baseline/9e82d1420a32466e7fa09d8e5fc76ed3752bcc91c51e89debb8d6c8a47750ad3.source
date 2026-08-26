import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FmvOverrideDialog } from '@/components/portfolio/tabs/FmvOverrideDialog';
import type { AllocationCompany } from '@/components/portfolio/tabs/types';
import type { PlanningFmvOverrideRecord } from '@shared/contracts/lp-reporting';

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const company: AllocationCompany = {
  company_id: 42,
  company_name: 'TechCorp',
  sector: 'FinTech',
  stage: 'Series A',
  status: 'active',
  invested_amount_cents: 100000000,
  deployed_reserves_cents: 50000000,
  planned_reserves_cents: 150000000,
  allocation_cap_cents: 300000000,
  allocation_reason: 'Reserve for Series B',
  allocation_version: 3,
  last_allocation_at: '2026-03-31T00:00:00.000Z',
};

const currentMark: PlanningFmvOverrideRecord = {
  id: 100,
  fundId: 1,
  companyId: 42,
  markDate: '2026-03-31',
  asOfDate: '2026-03-31',
  fairValue: '12500000.000000',
  currency: 'USD',
  confidenceLevel: 'medium',
  status: 'approved',
  priorMarkId: null,
  methodologyNotes: 'Approved FMV',
  approvedBy: 7,
  approvedAt: '2026-03-31T00:00:00.000Z',
  createdAt: '2026-03-31T00:00:00.000Z',
};

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('FmvOverrideDialog', () => {
  it('disables approved mark saving while a scenario workspace is active', () => {
    renderWithQuery(
      <FmvOverrideDialog
        company={company}
        currentMark={currentMark}
        open={true}
        onOpenChange={vi.fn()}
        scenarioActive={true}
      />
    );

    expect(
      screen.getByText(
        'Planning FMV overrides can only be saved from the live allocation workspace.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save approved mark/i })).toBeDisabled();
    expect(screen.getByText('$12,500,000')).toBeInTheDocument();
  });
});
