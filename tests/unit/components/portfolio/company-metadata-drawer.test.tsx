import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PortfolioCompany } from '@shared/schema';
import { CompanyMetadataDrawer } from '@/components/portfolio/company-metadata-drawer';
import { ApiError } from '@/lib/queryClient';

const apiState = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@/lib/queryClient', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: apiState.request };
});

function companyFixture(overrides: Partial<PortfolioCompany> = {}): PortfolioCompany {
  return {
    id: 11,
    fundId: 7,
    rowVersion: 3,
    name: 'Original Company',
    sector: 'Enterprise',
    stage: 'Seed',
    currentStage: null,
    investmentAmount: '1000000.00',
    investmentDate: null,
    currentValuation: '2500000.00',
    foundedYear: 2018,
    status: 'active',
    description: 'Original description',
    dealTags: ['AI'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deployedReservesCents: 0,
    plannedReservesCents: 100000,
    exitMoicBps: null,
    exitProbability: null,
    ownershipCurrentPct: null,
    allocationCapCents: null,
    allocationReason: null,
    allocationIteration: 0,
    lastAllocationAt: null,
    allocationVersion: 1,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function renderDrawer(company = companyFixture(), onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <CompanyMetadataDrawer company={company} fundId={7} open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  return { ...view, onOpenChange, queryClient };
}

describe('CompanyMetadataDrawer', () => {
  it('submits metadata only and closes after successful invalidation', async () => {
    apiState.request.mockResolvedValueOnce(companyFixture({ rowVersion: 4 }));
    const { onOpenChange, queryClient } = renderDrawer();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Edited Company' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save metadata' }));

    await waitFor(() => expect(apiState.request).toHaveBeenCalledTimes(1));
    expect(apiState.request).toHaveBeenCalledWith(
      'PATCH',
      '/api/portfolio-companies/11?fundId=7',
      {
        expectedVersion: 3,
        patch: {
          name: 'Edited Company',
          sector: 'Enterprise',
          foundedYear: 2018,
          description: null,
          dealTags: ['AI'],
        },
      },
      { headers: { 'Idempotency-Key': expect.any(String) } }
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['portfolio-company', 7, 11] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('preserves edits and offers authoritative refresh after version conflict', async () => {
    apiState.request.mockRejectedValueOnce(
      new ApiError(409, 'Expected version 3, found 4', 'VERSION_CONFLICT')
    );
    const { queryClient } = renderDrawer();
    const refetchQueries = vi.spyOn(queryClient, 'refetchQueries').mockImplementation(async () => {
      queryClient.setQueryData(
        ['portfolio-company', 7, 11],
        companyFixture({ name: 'Authoritative Name', sector: 'Healthcare', rowVersion: 4 })
      );
    });

    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Preserve this edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save metadata' }));

    expect(await screen.findByTestId('company-metadata-version-conflict')).toBeInTheDocument();
    expect(nameInput).toHaveValue('Preserve this edit');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh authoritative data' }));
    await waitFor(() =>
      expect(refetchQueries).toHaveBeenCalledWith({ queryKey: ['portfolio-company', 7, 11] })
    );
    expect(nameInput).toHaveValue('Preserve this edit');
    expect(screen.getByLabelText('Sector')).toHaveValue('Healthcare');
  });
});
