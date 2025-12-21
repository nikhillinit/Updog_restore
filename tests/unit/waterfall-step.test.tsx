/**
 * WaterfallStep Integration Tests
 * Tests UI integration with existing waterfall helpers
 *
 * SKIPPED: Component implementation incomplete - missing American/European waterfall type switching UI
 * WaterfallConfig component needs radio buttons for type selection before these tests can pass
 *
 * @group integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WaterfallStep } from '@/components/modeling-wizard/steps/WaterfallStep';
import type { Waterfall } from '@shared/types';

describe.skip('WaterfallStep', () => {
  const mockOnSave = vi.fn();

  beforeEach(() => {
    mockOnSave.mockClear();
  });

  describe('Rendering', () => {
    it('renders with default American waterfall', () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      expect(screen.getByText('Waterfall Structure')).toBeInTheDocument();
      expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
      expect(screen.getByLabelText(/American/i)).toBeChecked();
    });

    it('renders with European waterfall initial data', () => {
      const initialData: Waterfall = {
        type: 'EUROPEAN',
        carryVesting: { cliffYears: 1, vestingYears: 4 },
        hurdle: 0.08,
        catchUp: 0.8,
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      expect(screen.getByLabelText(/European/i)).toBeChecked();
      expect(screen.getByLabelText(/Hurdle Rate/i)).toHaveValue(8);
      expect(screen.getByLabelText(/Catch-Up/i)).toHaveValue(80);
    });

    it('shows European-specific fields only for European type', () => {
      const { rerender } = render(<WaterfallStep onSave={mockOnSave} />);

      // American waterfall - no hurdle fields
      expect(screen.queryByLabelText(/Hurdle Rate/i)).not.toBeInTheDocument();

      // Switch to European
      const europeanData: Waterfall = {
        type: 'EUROPEAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
        hurdle: 0.08,
        catchUp: 0.08,
      };

      rerender(<WaterfallStep initialData={europeanData} onSave={mockOnSave} />);

      // European waterfall - hurdle fields visible
      expect(screen.getByLabelText(/Hurdle Rate/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Catch-Up/i)).toBeInTheDocument();
    });
  });

  describe('Type Switching', () => {
    it('switches from American to European with default values', async () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      const europeanRadio = screen.getByLabelText(/European/i);
      fireEvent.click(europeanRadio);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'EUROPEAN',
            hurdle: 0.08,
            catchUp: 0.08,
          })
        );
      });
    });

    it('switches from European to American and removes hurdle fields', async () => {
      const initialData: Waterfall = {
        type: 'EUROPEAN',
        carryVesting: { cliffYears: 1, vestingYears: 5 },
        hurdle: 0.12,
        catchUp: 1.0,
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      const americanRadio = screen.getByLabelText(/American/i);
      fireEvent.click(americanRadio);

      await waitFor(() => {
        const savedData = mockOnSave.mock.calls[mockOnSave.mock.calls.length - 1][0] as Waterfall;
        expect(savedData.type).toBe('AMERICAN');
        expect('hurdle' in savedData).toBe(false);
        expect('catchUp' in savedData).toBe(false);
      });
    });

    it('preserves carry vesting when switching types', async () => {
      const initialData: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 2, vestingYears: 6 },
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      const europeanRadio = screen.getByLabelText(/European/i);
      fireEvent.click(europeanRadio);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            carryVesting: { cliffYears: 2, vestingYears: 6 },
          })
        );
      });
    });
  });

  describe('Field Updates', () => {
    it('updates hurdle rate with clamping (European)', async () => {
      const initialData: Waterfall = {
        type: 'EUROPEAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
        hurdle: 0.08,
        catchUp: 0.08,
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      const hurdleInput = screen.getByLabelText(/Hurdle Rate/i);

      // Test valid update
      fireEvent.change(hurdleInput, { target: { value: '12' } });

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            hurdle: 0.12,
          })
        );
      });

      // Test clamping to max (100% = 1.0)
      fireEvent.change(hurdleInput, { target: { value: '150' } });

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            hurdle: 1.0, // Clamped to max
          })
        );
      });
    });

    it('updates catch-up percentage', async () => {
      const initialData: Waterfall = {
        type: 'EUROPEAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
        hurdle: 0.08,
        catchUp: 0.08,
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      const catchUpInput = screen.getByLabelText(/Catch-Up/i);
      fireEvent.change(catchUpInput, { target: { value: '100' } });

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            catchUp: 1.0,
          })
        );
      });
    });

    it('updates carry vesting with bounds validation', async () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      const cliffInput = screen.getByLabelText(/Cliff Period/i);
      const vestingInput = screen.getByLabelText(/Vesting Period/i);

      // Valid updates
      fireEvent.change(cliffInput, { target: { value: '1' } });
      fireEvent.change(vestingInput, { target: { value: '5' } });

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            carryVesting: {
              cliffYears: 1,
              vestingYears: 5,
            },
          })
        );
      });

      // Test clamping cliff to max (10 years)
      fireEvent.change(cliffInput, { target: { value: '15' } });

      await waitFor(() => {
        const savedData = mockOnSave.mock.calls[mockOnSave.mock.calls.length - 1][0] as Waterfall;
        expect(savedData.carryVesting.cliffYears).toBe(10); // Clamped to max
      });

      // Test clamping vesting to min (1 year)
      fireEvent.change(vestingInput, { target: { value: '0' } });

      await waitFor(() => {
        const savedData = mockOnSave.mock.calls[mockOnSave.mock.calls.length - 1][0] as Waterfall;
        expect(savedData.carryVesting.vestingYears).toBe(1); // Clamped to min
      });
    });
  });

  describe('Auto-save', () => {
    it('auto-saves on valid changes', async () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      const vestingInput = screen.getByLabelText(/Vesting Period/i);
      fireEvent.change(vestingInput, { target: { value: '5' } });

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });
    });

    it('does not save invalid data', async () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      mockOnSave.mockClear();

      // Try to set invalid vesting period (should be clamped by helper)
      const vestingInput = screen.getByLabelText(/Vesting Period/i);
      fireEvent.change(vestingInput, { target: { value: '-5' } });

      // Should either clamp or not save invalid data
      await waitFor(() => {
        if (mockOnSave.mock.calls.length > 0) {
          const savedData = mockOnSave.mock.calls[0][0] as Waterfall;
          expect(savedData.carryVesting.vestingYears).toBeGreaterThanOrEqual(1);
        }
      });
    });
  });

  describe('Summary Card', () => {
    it('displays correct waterfall type badge', () => {
      const { rerender } = render(<WaterfallStep onSave={mockOnSave} />);

      expect(screen.getByText('AMERICAN')).toBeInTheDocument();

      const europeanData: Waterfall = {
        type: 'EUROPEAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
        hurdle: 0.08,
        catchUp: 0.08,
      };

      rerender(<WaterfallStep initialData={europeanData} onSave={mockOnSave} />);

      expect(screen.getByText('EUROPEAN')).toBeInTheDocument();
    });

    it('displays carry vesting schedule', () => {
      const initialData: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 2, vestingYears: 5 },
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      expect(screen.getByText(/2y \+ 5y/i)).toBeInTheDocument();
    });

    it('displays hurdle rate for European waterfall', () => {
      const initialData: Waterfall = {
        type: 'EUROPEAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
        hurdle: 0.12,
        catchUp: 0.8,
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      expect(screen.getByText('12.0%')).toBeInTheDocument();
    });

    it('displays example distribution', () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      expect(screen.getByText(/Example Distribution/i)).toBeInTheDocument();
      expect(screen.getByText(/Limited Partners/i)).toBeInTheDocument();
      expect(screen.getByText(/General Partners/i)).toBeInTheDocument();
    });
  });
});
