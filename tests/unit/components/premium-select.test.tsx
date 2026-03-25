import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/select', async () => {
  const ReactModule = await import('react');
  const SelectContext = ReactModule.createContext<(value: string) => void>(() => {});

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) {
    return (
      <SelectContext.Provider value={onValueChange}>
        <div data-testid="premium-select-root" data-value={value}>
          {children}
        </div>
      </SelectContext.Provider>
    );
  }

  function SelectTrigger({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) {
    return <div className={className}>{children}</div>;
  }

  function SelectValue({ placeholder }: { placeholder?: string }) {
    return <span>{placeholder}</span>;
  }

  function SelectContent({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) {
    return <div className={className}>{children}</div>;
  }

  function SelectItem({
    value,
    children,
    className,
  }: {
    value: string;
    children: React.ReactNode;
    className?: string;
  }) {
    const onValueChange = ReactModule.useContext(SelectContext);

    return (
      <button type="button" className={className} onClick={() => onValueChange(value)}>
        {children}
      </button>
    );
  }

  return {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  };
});

import { PremiumSelect } from '@/components/wizard/PremiumSelect';

const options = [
  { value: 'seed', label: 'Seed', description: 'Earliest check size' },
  { value: 'growth', label: 'Growth', description: 'Later-stage deployment' },
];

describe('PremiumSelect', () => {
  it('renders label, required state, and helper description', () => {
    render(
      <PremiumSelect
        label="Investment Strategy"
        value=""
        onChange={vi.fn()}
        options={options}
        placeholder="Choose a strategy"
        required={true}
        description="Select the default entry strategy."
      />
    );

    expect(screen.getByText('Investment Strategy')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('Choose a strategy')).toBeInTheDocument();
    expect(screen.getByText('Select the default entry strategy.')).toBeInTheDocument();
  });

  it('emits the selected option value', () => {
    const handleChange = vi.fn();

    render(
      <PremiumSelect
        label="Entry Round"
        value=""
        onChange={handleChange}
        options={options}
        placeholder="Pick one"
      />
    );

    fireEvent.click(screen.getByText('Growth'));

    expect(handleChange).toHaveBeenCalledWith('growth');
  });

  it('shows error text instead of the helper description', () => {
    render(
      <PremiumSelect
        label="Entry Round"
        value=""
        onChange={vi.fn()}
        options={options}
        description="Helper copy"
        error="Selection required"
      />
    );

    expect(screen.getByText('Selection required')).toBeInTheDocument();
    expect(screen.queryByText('Helper copy')).not.toBeInTheDocument();
  });
});
