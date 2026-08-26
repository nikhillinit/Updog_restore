import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EnhancedField } from '@/components/wizard/EnhancedField';

function ControlledUsdField({ initialValue = 1200 }: { initialValue?: number }) {
  const [value, setValue] = React.useState<number | undefined>(initialValue);

  return (
    <EnhancedField
      label="Fund Size"
      value={value}
      onChange={setValue}
      format="usd"
      placeholder="Enter whole dollars"
    />
  );
}

describe('EnhancedField', () => {
  it('formats USD values on blur and keeps whole-dollar state', () => {
    render(<ControlledUsdField />);

    const input = screen.getByLabelText(/fund size/i);

    expect(input).toHaveValue('1,200');

    fireEvent.change(input, { target: { value: '2500' } });
    expect(input).toHaveValue('2,500');

    fireEvent.blur(input);
    expect(input).toHaveValue('2,500');
  });

  it('clamps percent input before emitting changes', () => {
    const handleChange = vi.fn();

    render(
      <EnhancedField
        label="Ownership"
        value={25}
        onChange={handleChange}
        format="percent"
      />
    );

    fireEvent.change(screen.getByLabelText(/ownership/i), { target: { value: '150' } });

    expect(handleChange).toHaveBeenLastCalledWith(100);
  });

  it('uses the native select path for select-format fields', () => {
    const handleChange = vi.fn();

    render(
      <EnhancedField
        label="Strategy"
        value=""
        onChange={handleChange}
        format="select"
        options={[
          { value: 'core', label: 'Core' },
          { value: 'growth', label: 'Growth' },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText(/strategy/i), { target: { value: 'growth' } });

    expect(handleChange).toHaveBeenCalledWith('growth');
  });
});
