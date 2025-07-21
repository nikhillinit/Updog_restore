import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WaterfallStep from '../client/src/pages/WaterfallStep';
import type { Waterfall } from '@shared/types';

describe('WaterfallStep', () => {
  const mockOnChange = vi.fn();

  const mockEuropeanWaterfall: Waterfall = {
    type: 'EUROPEAN',
    hurdle: 0.08,
    catchUp: 0.08,
    carryVesting: {
      cliffYears: 0,
      vestingYears: 4,
    },
  };

  const mockAmericanWaterfall: Waterfall = {
    type: 'AMERICAN',
    hurdle: 0.08,
    catchUp: 0.08,
    carryVesting: {
      cliffYears: 0,
      vestingYears: 4,
    },
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('should show hurdle and catch-up fields for EUROPEAN waterfall type', () => {
    render(
      <WaterfallStep data={mockEuropeanWaterfall} onChange={mockOnChange} />
    );

    expect(screen.getByText('Financial Terms')).toBeInTheDocument();
    expect(screen.getByText('Hurdle Rate (%)')).toBeInTheDocument();
    expect(screen.getByText('Catch-Up Rate (%)')).toBeInTheDocument();
  });

  it('should hide hurdle and catch-up fields for AMERICAN waterfall type', () => {
    render(
      <WaterfallStep data={mockAmericanWaterfall} onChange={mockOnChange} />
    );

    expect(screen.queryByText('Financial Terms')).not.toBeInTheDocument();
    expect(screen.queryByText('Hurdle Rate (%)')).not.toBeInTheDocument();
    expect(screen.queryByText('Catch-Up Rate (%)')).not.toBeInTheDocument();
  });

  it('should switch between waterfall types and show/hide fields accordingly', () => {
    const { rerender } = render(
      <WaterfallStep data={mockAmericanWaterfall} onChange={mockOnChange} />
    );

    // Initially American - fields should be hidden
    expect(screen.queryByText('Financial Terms')).not.toBeInTheDocument();

    // Switch to European
    rerender(
      <WaterfallStep data={mockEuropeanWaterfall} onChange={mockOnChange} />
    );

    // Now European - fields should be visible
    expect(screen.getByText('Financial Terms')).toBeInTheDocument();
    expect(screen.getByText('Hurdle Rate (%)')).toBeInTheDocument();
    expect(screen.getByText('Catch-Up Rate (%)')).toBeInTheDocument();
  });

  it('should display correct default values for EUROPEAN waterfall', () => {
    render(
      <WaterfallStep data={mockEuropeanWaterfall} onChange={mockOnChange} />
    );

    const allInputsWithValue = screen.getAllByDisplayValue('8.0');
    expect(allInputsWithValue).toHaveLength(2); // Hurdle and catch-up both show 8.0%
    
    // Verify both fields are present by text content
    expect(screen.getByText('Hurdle Rate (%)')).toBeInTheDocument();
    expect(screen.getByText('Catch-Up Rate (%)')).toBeInTheDocument();
  });

  it('should show validation error when catch-up rate is less than hurdle rate', () => {
    const invalidWaterfall: Waterfall = {
      ...mockEuropeanWaterfall,
      hurdle: 0.10, // 10%
      catchUp: 0.08, // 8% (less than hurdle)
    };

    render(
      <WaterfallStep data={invalidWaterfall} onChange={mockOnChange} />
    );

    expect(screen.getByText('Catch-up rate should be greater than or equal to hurdle rate')).toBeInTheDocument();
  });

  it('should call onChange when waterfall type is changed', () => {
    render(
      <WaterfallStep data={mockEuropeanWaterfall} onChange={mockOnChange} />
    );

    const americanRadio = screen.getByRole('radio', { name: /american waterfall/i });
    fireEvent.click(americanRadio);

    expect(mockOnChange).toHaveBeenCalledWith({
      ...mockEuropeanWaterfall,
      type: 'AMERICAN',
    });
  });

  it('should show carry vesting options for both waterfall types', () => {
    render(
      <WaterfallStep data={mockAmericanWaterfall} onChange={mockOnChange} />
    );

    expect(screen.getByText('Carry Vesting')).toBeInTheDocument();
    expect(screen.getByText('Cliff Period')).toBeInTheDocument();
    expect(screen.getByText('Vesting Period')).toBeInTheDocument();
  });

  it('should display vesting summary correctly', () => {
    const waterfallWithCliff: Waterfall = {
      ...mockEuropeanWaterfall,
      carryVesting: {
        cliffYears: 2,
        vestingYears: 4,
      },
    };

    render(
      <WaterfallStep data={waterfallWithCliff} onChange={mockOnChange} />
    );

    expect(screen.getByText(/After a 2-year cliff, carry vests over 4 years/)).toBeInTheDocument();
  });
});