import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AllocationActualsDisclosure } from '../../../../client/src/components/portfolio/tabs/AllocationActualsDisclosure';
import {
  AllocationCompanyActualsDriftV1Schema,
  type AllocationCompanyActualsDriftV1,
} from '@shared/contracts/allocations/allocation-actuals-drift-v1.contract';

const FACTS_HASH = 'a'.repeat(64);

function buildDrift(
  overrides: Partial<AllocationCompanyActualsDriftV1> = {}
): AllocationCompanyActualsDriftV1 {
  return AllocationCompanyActualsDriftV1Schema.parse({
    contractVersion: 'allocation-actuals-drift-v1',
    companyId: 11,
    asOfDate: '2026-07-11',
    allocationVersion: 4,
    lastAllocationAt: '2026-07-10T12:00:00.000Z',
    factsInputHash: FACTS_HASH,
    trustState: 'LIVE',
    planningFmvStatus: 'active',
    currencyStatus: 'base_currency',
    activeRoundIds: [101],
    supersedeLineage: [{ roundId: 101, supersedesRoundId: null }],
    comparisons: [
      {
        basis: 'deployed_reserves_vs_observed_follow_on',
        state: 'exact',
        planCents: '100000',
        actualCents: '100000',
        deltaCents: '0',
        relativeDelta: '0',
        material: false,
        subCentRemainder: null,
        unavailableReason: null,
      },
      {
        basis: 'legacy_invested_vs_observed_total',
        state: 'exact',
        planCents: '500000',
        actualCents: '500000',
        deltaCents: '0',
        relativeDelta: '0',
        material: false,
        subCentRemainder: null,
        unavailableReason: null,
      },
    ],
    warnings: [],
    ...overrides,
  });
}

describe('AllocationActualsDisclosure', () => {
  it('renders contract-valid exact comparisons and copyable evidence without success styling', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    const drift = buildDrift();

    expect(AllocationCompanyActualsDriftV1Schema.parse(drift)).toEqual(drift);

    render(<AllocationActualsDisclosure drift={drift} companyName="Example Co" />);

    expect(screen.getByText('Deployed reserves vs observed follow-on')).toBeInTheDocument();
    expect(screen.getByText('Legacy invested vs observed total')).toBeInTheDocument();
    for (const value of screen.getAllByText('$1,000.00')) {
      expect(value).toHaveClass('tabular-nums');
    }
    for (const value of screen.getAllByText('$5,000.00')) {
      expect(value).toHaveClass('tabular-nums');
    }
    expect(screen.getAllByText('exact')).toHaveLength(2);
    expect(screen.getByText('Live fund company actuals facts')).toBeInTheDocument();
    expect(screen.getByText('2026-07-11')).toBeInTheDocument();
    expect(screen.getByText(FACTS_HASH.slice(0, 12))).toBeInTheDocument();

    const copyButton = screen.getByRole('button', { name: 'Copy facts input hash' });
    fireEvent.click(copyButton);
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(FACTS_HASH));

    for (const exactLabel of screen.getAllByText('exact')) {
      expect(exactLabel.className).not.toMatch(/success|positive|confidence/);
    }
  });

  it('distinguishes material and non-material drift without a green trust signal', () => {
    const drift = buildDrift({
      comparisons: [
        {
          basis: 'deployed_reserves_vs_observed_follow_on',
          state: 'drifted',
          planCents: '100000',
          actualCents: '125000',
          deltaCents: '25000',
          relativeDelta: '0.25',
          material: true,
          subCentRemainder: null,
          unavailableReason: null,
        },
        {
          basis: 'legacy_invested_vs_observed_total',
          state: 'drifted',
          planCents: '500000',
          actualCents: '501000',
          deltaCents: '1000',
          relativeDelta: '0.002',
          material: false,
          subCentRemainder: '0.004',
          unavailableReason: null,
        },
      ],
    });

    render(<AllocationActualsDisclosure drift={drift} companyName="Example Co" />);

    expect(screen.getByText('material drift')).toBeInTheDocument();
    const disclosed = screen.getByText('drift disclosed');
    expect(disclosed).toBeInTheDocument();
    expect(disclosed.className).not.toMatch(/success|positive|confidence/);
    expect(screen.getByText('25%')).toHaveClass('tabular-nums');
    expect(screen.getByText('sub-cent remainder: 0.004')).toBeInTheDocument();
  });

  it('renders partial currency-blocked reasons and stale evidence as text, not color alone', () => {
    const drift = buildDrift({
      trustState: 'PARTIAL',
      planningFmvStatus: 'stale',
      currencyStatus: 'mismatch_blocked',
      comparisons: [
        {
          basis: 'deployed_reserves_vs_observed_follow_on',
          state: 'unavailable',
          planCents: '100000',
          actualCents: null,
          deltaCents: null,
          relativeDelta: null,
          material: false,
          subCentRemainder: null,
          unavailableReason: 'currency_blocked',
        },
        {
          basis: 'legacy_invested_vs_observed_total',
          state: 'unavailable',
          planCents: '500000',
          actualCents: null,
          deltaCents: null,
          relativeDelta: null,
          material: false,
          subCentRemainder: null,
          unavailableReason: 'facts_missing',
        },
      ],
      warnings: [
        {
          code: 'CURRENCY_MISMATCH_BLOCK',
          severity: 'blocking',
          message: 'Observed actuals use a different currency.',
        },
        {
          code: 'DATA_STALE',
          severity: 'warning',
          message: 'Planning FMV is stale.',
        },
      ],
    });

    render(<AllocationActualsDisclosure drift={drift} companyName="Example Co" />);

    expect(screen.getAllByText('currency blocked').length).toBeGreaterThan(0);
    expect(screen.getByText('facts missing')).toBeInTheDocument();
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
    expect(screen.getByText('stale')).toBeInTheDocument();
    expect(screen.getByText('Observed actuals use a different currency.')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toHaveClass('tabular-nums');
  });

  it('keeps plan numbers visible and explains failed facts', () => {
    const drift = buildDrift({
      factsInputHash: null,
      trustState: 'FAILED',
      planningFmvStatus: 'none',
      currencyStatus: 'unknown',
      comparisons: [
        {
          basis: 'deployed_reserves_vs_observed_follow_on',
          state: 'unavailable',
          planCents: '100000',
          actualCents: null,
          deltaCents: null,
          relativeDelta: null,
          material: false,
          subCentRemainder: null,
          unavailableReason: 'facts_failed',
        },
        {
          basis: 'legacy_invested_vs_observed_total',
          state: 'unavailable',
          planCents: '500000',
          actualCents: null,
          deltaCents: null,
          relativeDelta: null,
          material: false,
          subCentRemainder: null,
          unavailableReason: 'facts_failed',
        },
      ],
      warnings: [
        {
          code: 'ROUND_ADAPTER_FAILED',
          severity: 'blocking',
          message: 'Round facts adapter timed out.',
        },
      ],
    });

    render(<AllocationActualsDisclosure drift={drift} companyName="Example Co" />);

    expect(screen.getByText(/facts unavailable/i)).toHaveTextContent(
      'Round facts adapter timed out.'
    );
    expect(screen.getAllByText('facts failed')).toHaveLength(2);
    expect(screen.getByText('$1,000.00')).toHaveClass('tabular-nums');
    expect(screen.getByText('$5,000.00')).toHaveClass('tabular-nums');
    expect(screen.queryByRole('button', { name: 'Copy facts input hash' })).not.toBeInTheDocument();
  });
});
