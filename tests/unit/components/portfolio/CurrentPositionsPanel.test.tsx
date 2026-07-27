import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CurrentPositionsPanel } from '@/components/portfolio/tabs/CurrentPositionsPanel';

const mockUseCurrentPositions = vi.fn();
const mockUsePositionValuationSelection = vi.fn();

vi.mock('@/hooks/usePositionValuationSelection', () => ({
  usePositionValuationSelection: (...args: unknown[]) =>
    mockUsePositionValuationSelection(...args),
}));

vi.mock('@/hooks/useCurrentPositions', () => ({
  useCurrentPositions: (...args: unknown[]) => mockUseCurrentPositions(...args),
}));

const mockPositions = {
  fundId: 1,
  asOfDate: '2026-07-01',
  knowledgeCutoff: '2026-07-01T00:00:00.000Z',
  positions: [
    {
      fundId: 1,
      vehicleId: 1,
      companyIdentityId: 1,
      asOfDate: '2026-07-01',
      knowledgeCutoff: '2026-07-01T00:00:00.000Z',
      shares: '5.000000',
      costBasis: '10000.000000',
      proceeds: '12000.000000',
      components: [
        {
          kind: 'priced',
          shares: '3.000000',
          costBasis: '6000.000000',
          participationIds: [101],
        },
        {
          kind: 'contingent',
          shares: '2.000000',
          costBasis: '4000.000000',
          participationIds: [202],
        },
      ],
      warnings: [
        {
          code: 'MIXED_PRICED_AND_CONTINGENT_COMPONENTS',
          message: 'Position contains both priced and contingent components.',
        },
      ],
    },
  ],
};

const mockSelection = {
  fundId: 1,
  vehicleId: 1,
  companyIdentityId: 1,
  companyId: 10,
  asOfDate: '2026-07-01',
  aggregateFairValue: null,
  basis: 'derived',
  directMarkId: null,
  directSourceObservationId: null,
  ownershipSnapshotId: 31,
  derivedTrancheId: 7,
  derivedTrancheVersion: 2,
  derivedParticipationId: 21,
  derivedParticipationVersion: 3,
  evidenceDate: '2026-06-30',
  valuationAgeDays: 1,
  pricedComponentFairValue: '15000.000000',
  warnings: [
    {
      code: 'CONTINGENT_INSTRUMENT_EXCLUDED',
      message: 'Contingent instruments are excluded.',
    },
    {
      code: 'POSITION_VALUATION_INCOMPLETE',
      message: 'Aggregate valuation is incomplete.',
    },
  ],
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(children: ReactNode) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('CurrentPositionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseCurrentPositions.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      error: null,
      isFetching: false,
    } as never);
    mockUsePositionValuationSelection.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: undefined,
      error: null,
    } as never);

    renderWithProviders(<CurrentPositionsPanel vehicleId={1} companyIdentityId={1} companyId={10} />);

    expect(screen.getByTestId('positions-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading current positions')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseCurrentPositions.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: new Error('Unable to load'),
      isFetching: false,
    } as never);
    mockUsePositionValuationSelection.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: undefined,
      error: null,
    } as never);

    renderWithProviders(<CurrentPositionsPanel vehicleId={1} companyIdentityId={1} companyId={10} />);

    expect(screen.getByTestId('positions-error')).toBeInTheDocument();
    expect(screen.getByText('Unable to load')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    mockUseCurrentPositions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { fundId: 1, asOfDate: '2026-07-01', knowledgeCutoff: '2026-07-01T00:00:00.000Z', positions: [] },
      error: null,
      isFetching: false,
    } as never);
    mockUsePositionValuationSelection.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: undefined,
      error: null,
    } as never);

    renderWithProviders(<CurrentPositionsPanel vehicleId={1} companyIdentityId={1} companyId={10} />);

    expect(screen.getByTestId('positions-empty')).toBeInTheDocument();
    expect(screen.getByText('No current positions found for this identity.')).toBeInTheDocument();
  });

  it('renders derived mixed-position valuation with priced component and warnings', () => {
    mockUseCurrentPositions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockPositions,
      error: null,
      isFetching: false,
    } as never);
    mockUsePositionValuationSelection.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: mockSelection,
      error: null,
    } as never);

    renderWithProviders(<CurrentPositionsPanel vehicleId={1} companyIdentityId={1} companyId={10} />);

    expect(screen.getByTestId('position-card')).toBeInTheDocument();
    expect(screen.getByText('Position shares')).toBeInTheDocument();
    expect(screen.getByText('5.00')).toBeInTheDocument();
    expect(screen.getByText('Aggregate position valuation: Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Priced component valuation: $15,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('priced').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('contingent').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('Contingent component is excluded from priced-component valuation.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Aggregate valuation is unavailable because contingent value is not priced.')
    ).toBeInTheDocument();
    expect(screen.getByText('Position contains both priced and contingent components.')).toBeInTheDocument();
    expect(screen.getByText(/Derived from tranche 7/)).toBeInTheDocument();
  });

  it('renders direct valuation and stale-mark warning without derived fallback', () => {
    mockUseCurrentPositions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...mockPositions,
        positions: [
          {
            ...mockPositions.positions[0],
            components: [mockPositions.positions[0]!.components[0]],
            warnings: [],
          },
        ],
      },
      error: null,
      isFetching: false,
    } as never);
    mockUsePositionValuationSelection.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        ...mockSelection,
        basis: 'direct',
        aggregateFairValue: '16000.000000',
        directMarkId: 44,
        directSourceObservationId: 55,
        ownershipSnapshotId: null,
        derivedTrancheId: null,
        derivedTrancheVersion: null,
        derivedParticipationId: null,
        derivedParticipationVersion: null,
        evidenceDate: '2026-01-01',
        valuationAgeDays: 181,
        pricedComponentFairValue: null,
        warnings: [
          {
            code: 'DIRECT_POSITION_MARK_STALE',
            message: 'Direct mark is stale.',
          },
        ],
      },
      error: null,
    } as never);

    renderWithProviders(<CurrentPositionsPanel vehicleId={1} companyIdentityId={1} companyId={10} />);

    expect(screen.getByText('Valuation basis: Direct mark 44')).toBeInTheDocument();
    expect(screen.getByText('Aggregate position valuation: $16,000.00')).toBeInTheDocument();
    expect(
      screen.getByText('Mark is older than 120 days and remains the selected direct evidence.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('priced-component-value')).not.toBeInTheDocument();
  });

  it('renders unavailable valuation without fabricating a fallback', () => {
    mockUseCurrentPositions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockPositions,
      error: null,
      isFetching: false,
    } as never);
    mockUsePositionValuationSelection.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        ...mockSelection,
        basis: 'unavailable',
        aggregateFairValue: null,
        ownershipSnapshotId: null,
        derivedTrancheId: null,
        derivedTrancheVersion: null,
        derivedParticipationId: null,
        derivedParticipationVersion: null,
        evidenceDate: null,
        valuationAgeDays: null,
        pricedComponentFairValue: null,
        warnings: [],
      },
      error: null,
    } as never);

    renderWithProviders(<CurrentPositionsPanel vehicleId={1} companyIdentityId={1} companyId={10} />);

    expect(screen.getByText('Valuation basis: Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Aggregate position valuation: Unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it('shows valuation failure while retaining position economics and applying no fallback', () => {
    mockUseCurrentPositions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockPositions,
      error: null,
      isFetching: false,
    } as never);
    mockUsePositionValuationSelection.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: true,
      data: undefined,
      error: new Error('valuation unavailable'),
    } as never);

    renderWithProviders(<CurrentPositionsPanel vehicleId={1} companyIdentityId={1} companyId={10} />);

    expect(screen.getByTestId('positions-valuation-error')).toBeInTheDocument();
    expect(screen.getByText('Valuation basis: Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Aggregate position valuation: Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Cost basis')).toBeInTheDocument();
  });
});
