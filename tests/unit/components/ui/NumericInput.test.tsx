import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';

describe('NumericInput', () => {
  describe('Basic Rendering', () => {
    it('renders with label and input', () => {
      render(<NumericInput label="Test Input" value={undefined} onChange={vi.fn()} />);

      expect(screen.getByText('Test Input')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('displays required asterisk when required=true', () => {
      render(<NumericInput label="Required Field" value={undefined} onChange={vi.fn()} required />);

      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('shows help text when provided', () => {
      render(
        <NumericInput label="Test" value={undefined} onChange={vi.fn()} help="This is help text" />
      );

      expect(screen.getByText('This is help text')).toBeInTheDocument();
    });

    it('shows error text and hides help text when error is present', () => {
      render(
        <NumericInput
          label="Test"
          value={undefined}
          onChange={vi.fn()}
          help="Help text"
          error="Error message"
        />
      );

      expect(screen.getByText('Error message')).toBeInTheDocument();
      expect(screen.queryByText('Help text')).not.toBeInTheDocument();
    });

    it('renders placeholder when provided', () => {
      render(
        <NumericInput
          label="Test"
          value={undefined}
          onChange={vi.fn()}
          placeholder="Enter amount"
        />
      );

      expect(screen.getByPlaceholderText('Enter amount')).toBeInTheDocument();
    });

    it('is disabled when disabled=true', () => {
      render(<NumericInput label="Test" value={100} onChange={vi.fn()} disabled />);

      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });

  describe('Mode-specific Behavior', () => {
    it('displays $ prefix in currency mode', () => {
      render(<NumericInput label="Amount" value={1000} onChange={vi.fn()} mode="currency" />);

      // Prefix is rendered as separate element
      expect(screen.getByText('$')).toBeInTheDocument();
    });

    it('displays % suffix in percentage mode', () => {
      render(<NumericInput label="Rate" value={25} onChange={vi.fn()} mode="percentage" />);

      expect(screen.getByText('%')).toBeInTheDocument();
    });

    it('uses custom prefix when provided', () => {
      render(<NumericInput label="Test" value={100} onChange={vi.fn()} prefix="€" />);

      expect(screen.getByText('€')).toBeInTheDocument();
    });

    it('uses custom suffix when provided', () => {
      render(<NumericInput label="Test" value={100} onChange={vi.fn()} suffix="kg" />);

      expect(screen.getByText('kg')).toBeInTheDocument();
    });

    it('percentage mode overrides custom suffix', () => {
      render(
        <NumericInput
          label="Test"
          value={50}
          onChange={vi.fn()}
          mode="percentage"
          suffix="custom"
        />
      );

      expect(screen.getByText('%')).toBeInTheDocument();
      expect(screen.queryByText('custom')).not.toBeInTheDocument();
    });

    it('currency mode uses default $ prefix', () => {
      render(<NumericInput label="Test" value={100} onChange={vi.fn()} mode="currency" />);

      expect(screen.getByText('$')).toBeInTheDocument();
    });

    it('currency mode can use custom prefix', () => {
      render(
        <NumericInput label="Test" value={100} onChange={vi.fn()} mode="currency" prefix="£" />
      );

      expect(screen.getByText('£')).toBeInTheDocument();
      expect(screen.queryByText('$')).not.toBeInTheDocument();
    });
  });

  describe('Number Formatting', () => {
    it('formats numbers with commas when not focused', () => {
      render(<NumericInput label="Test" value={1000000} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveValue('1,000,000');
    });

    it('removes commas when focused', async () => {
      const user = userEvent.setup();
      render(<NumericInput label="Test" value={1000000} onChange={vi.fn()} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('1,000,000');

      await user.click(input);
      expect(input).toHaveValue('1000000');
    });

    it('re-formats with commas on blur', async () => {
      const user = userEvent.setup();

      const Wrapper = () => {
        const [inputValue, setInputValue] = useState<number | undefined>(undefined);

        return <NumericInput label="Test" value={inputValue} onChange={setInputValue} />;
      };

      render(<Wrapper />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, '5000000');
      await user.tab();

      await waitFor(() => {
        expect(input).toHaveValue('5,000,000');
      });
    });

    it('handles decimal values correctly', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={undefined} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, '123.45');

      expect(onChange).toHaveBeenLastCalledWith(123.45);
    });

    it('preserves decimal places when formatting', () => {
      render(<NumericInput label="Test" value={1234.5678} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveValue('1,234.5678');
    });

    it('handles negative numbers', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={undefined} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, '-500');

      expect(onChange).toHaveBeenLastCalledWith(-500);
    });
  });

  describe('User Input Validation', () => {
    it('allows only numeric characters and decimal point', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={undefined} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'abc123def');

      // Only the numeric part should be accepted
      expect(input).toHaveValue('123');
    });

    it('handles empty string as undefined', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={100} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      await user.clear(input);

      expect(onChange).toHaveBeenCalledWith(undefined);
    });

    it('allows typing minus sign for negative numbers', async () => {
      const user = userEvent.setup();
      render(<NumericInput label="Test" value={undefined} onChange={vi.fn()} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, '-');

      // Should allow minus sign without error
      expect(input).toHaveValue('-');
    });
  });

  describe('Min/Max Clamping', () => {
    it('clamps value to min on blur', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={undefined} onChange={onChange} min={10} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, '5');
      await user.tab(); // Blur

      // Should clamp to minimum value
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(10);
      });
    });

    it('clamps value to max on blur', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={undefined} onChange={onChange} max={100} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, '150');
      await user.tab(); // Blur

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(100);
      });
    });

    it('allows values within min/max range', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={undefined} onChange={onChange} min={0} max={100} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, '50');
      await user.tab();

      // Should not clamp - value is within range
      expect(onChange).toHaveBeenLastCalledWith(50);
    });
  });

  describe('Keyboard Navigation', () => {
    it('increments value with ArrowUp', async () => {
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={10} onChange={onChange} step={1} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      expect(onChange).toHaveBeenCalledWith(11);
    });

    it('decrements value with ArrowDown', async () => {
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={10} onChange={onChange} step={1} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(onChange).toHaveBeenCalledWith(9);
    });

    it('respects custom step value', async () => {
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={10} onChange={onChange} step={5} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      expect(onChange).toHaveBeenCalledWith(15);
    });

    it('handles ArrowUp/Down with decimal steps', async () => {
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={0.5} onChange={onChange} step={0.1} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      // Note: floating point precision handled
      expect(onChange).toHaveBeenCalledWith(0.6);
    });

    it('clamps when incrementing beyond max', async () => {
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={99} onChange={onChange} step={5} max={100} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      expect(onChange).toHaveBeenCalledWith(100);
    });

    it('clamps when decrementing below min', async () => {
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={5} onChange={onChange} step={10} min={0} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(onChange).toHaveBeenCalledWith(0);
    });

    it('uses 0 as base when value is undefined and arrow key pressed', async () => {
      const onChange = vi.fn();
      render(<NumericInput label="Test" value={undefined} onChange={onChange} step={1} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      expect(onChange).toHaveBeenCalledWith(1);
    });
  });

  describe('Accessibility', () => {
    it('generates unique IDs for input and label', () => {
      render(<NumericInput label="Test Input" value={100} onChange={vi.fn()} />);

      const input = screen.getByRole('textbox');
      const label = screen.getByText('Test Input');

      expect(input).toHaveAttribute('id');
      expect(label).toHaveAttribute('for', input.getAttribute('id'));
    });

    it('sets aria-required when required=true', () => {
      render(<NumericInput label="Test" value={undefined} onChange={vi.fn()} required />);

      expect(screen.getByRole('textbox')).toHaveAttribute('aria-required', 'true');
    });

    it('sets aria-invalid when error is present', () => {
      render(
        <NumericInput label="Test" value={undefined} onChange={vi.fn()} error="Invalid value" />
      );

      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });

    it('links input to help text with aria-describedby', () => {
      render(
        <NumericInput label="Test" value={undefined} onChange={vi.fn()} help="Help message" />
      );

      const input = screen.getByRole('textbox');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(screen.getByText('Help message')).toHaveAttribute('id', describedBy);
    });

    it('links input to error text with aria-describedby', () => {
      render(
        <NumericInput label="Test" value={undefined} onChange={vi.fn()} error="Error message" />
      );

      const input = screen.getByRole('textbox');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(screen.getByText('Error message')).toHaveAttribute('id', describedBy);
    });

    it('error message has role="alert"', () => {
      render(
        <NumericInput label="Test" value={undefined} onChange={vi.fn()} error="Error message" />
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Error message');
    });

    it('uses inputMode="decimal" for mobile keyboards', () => {
      render(<NumericInput label="Test" value={100} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveAttribute('inputMode', 'decimal');
    });
  });

  describe('Edge Cases', () => {
    it('handles very large numbers', () => {
      render(<NumericInput label="Test" value={999999999999} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveValue('999,999,999,999');
    });

    it('handles very small decimal numbers', () => {
      render(<NumericInput label="Test" value={0.000001} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveValue('0.000001');
    });

    it('handles zero correctly', () => {
      render(<NumericInput label="Test" value={0} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveValue('0');
    });

    it('handles undefined to number transition', async () => {
      const { rerender } = render(
        <NumericInput label="Test" value={undefined} onChange={vi.fn()} />
      );

      expect(screen.getByRole('textbox')).toHaveValue('');

      rerender(<NumericInput label="Test" value={100} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveValue('100');
    });

    it('handles number to undefined transition', async () => {
      const { rerender } = render(<NumericInput label="Test" value={100} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveValue('100');

      rerender(<NumericInput label="Test" value={undefined} onChange={vi.fn()} />);

      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  describe('Custom Class Names', () => {
    it('applies custom className to container', () => {
      const { container } = render(
        <NumericInput label="Test" value={100} onChange={vi.fn()} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
