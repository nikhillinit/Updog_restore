/**
 * WaterfallStep Integration Tests
 * Tests UI integration with existing waterfall helpers
 *
 * Tests American waterfall configuration with carry vesting
 *
 * @group integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WaterfallStep } from '@/components/modeling-wizard/steps/WaterfallStep';
import type { Waterfall } from '@shared/types';

describe('WaterfallStep', () => {
  const mockOnSave = vi.fn();

  beforeEach(() => {
    mockOnSave.mockClear();
  });

  describe('Rendering', () => {
    it('renders with default American waterfall', () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      expect(screen.getByText('Waterfall Structure')).toBeInTheDocument();
      expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
      expect(screen.getByText('American (Deal-by-Deal) Waterfall')).toBeInTheDocument();
    });

    it('renders with initial carry vesting data', () => {
      const initialData: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 2, vestingYears: 5 },
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      expect(screen.getByLabelText(/Cliff Period/i)).toHaveValue(2);
      expect(screen.getByLabelText(/Vesting Period/i)).toHaveValue(5);
    });

    it('displays waterfall type badge', () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      expect(screen.getByText('AMERICAN')).toBeInTheDocument();
    });
  });

  describe('Field Updates', () => {
    it('updates cliff period input', async () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      const cliffInput = screen.getByLabelText(/Cliff Period/i) as HTMLInputElement;

      // Initial value
      expect(cliffInput.value).toBe('0');

      // Update cliff
      fireEvent.change(cliffInput, { target: { value: '2' } });
      await waitFor(() => {
        expect(cliffInput.value).toBe('2');
      });
    });

    it('updates vesting period input', async () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      const vestingInput = screen.getByLabelText(/Vesting Period/i) as HTMLInputElement;

      // Initial value
      expect(vestingInput.value).toBe('4');

      // Update vesting
      fireEvent.change(vestingInput, { target: { value: '6' } });
      await waitFor(() => {
        expect(vestingInput.value).toBe('6');
      });
    });

    it('updates both carry vesting inputs', async () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      const cliffInput = screen.getByLabelText(/Cliff Period/i) as HTMLInputElement;
      const vestingInput = screen.getByLabelText(/Vesting Period/i) as HTMLInputElement;

      // Initial values
      expect(cliffInput.value).toBe('0');
      expect(vestingInput.value).toBe('4');

      // Update cliff
      fireEvent.change(cliffInput, { target: { value: '1' } });
      await waitFor(() => {
        expect(cliffInput.value).toBe('1');
      });

      // Update vesting
      fireEvent.change(vestingInput, { target: { value: '5' } });
      await waitFor(() => {
        expect(vestingInput.value).toBe('5');
      });
    });
  });

  describe('Auto-save', () => {
    it('auto-saves on initial render with valid data', async () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      // Auto-save triggers on initial mount with valid data
      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });

      // Verify saved data is a valid American waterfall
      const savedData = mockOnSave.mock.calls[0][0] as Waterfall;
      expect(savedData.type).toBe('AMERICAN');
      expect(savedData.carryVesting).toBeDefined();
    });
  });

  describe('Summary Card', () => {
    it('displays carry vesting schedule', () => {
      const initialData: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 2, vestingYears: 5 },
      };

      render(<WaterfallStep initialData={initialData} onSave={mockOnSave} />);

      expect(screen.getByText(/2y \+ 5y/i)).toBeInTheDocument();
    });

    it('displays example distribution', () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      // Use getAllByText since "Example Distribution" appears in both description and heading
      expect(screen.getAllByText(/Example Distribution/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Limited Partners/i)).toBeInTheDocument();
      expect(screen.getByText(/General Partners/i)).toBeInTheDocument();
    });

    it('displays distribution model as American', () => {
      render(<WaterfallStep onSave={mockOnSave} />);

      expect(screen.getByText('American')).toBeInTheDocument();
      expect(screen.getByText('Deal-by-deal')).toBeInTheDocument();
    });
  });
});
