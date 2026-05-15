import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AllocationSliders, type Allocation } from '@/components/ui/AllocationSliders';

const baseAllocations: Allocation[] = [
  { id: 'seed', label: 'Seed', pct: 50 },
  { id: 'series-a', label: 'Series A', pct: 50 },
];

describe('AllocationSliders', () => {
  it('rebalances peer allocations when a percentage changes', () => {
    const onChange = vi.fn();

    render(<AllocationSliders initial={baseAllocations} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Seed allocation percentage'), {
      target: { value: '80' },
    });

    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'seed', label: 'Seed', pct: 80 },
      { id: 'series-a', label: 'Series A', pct: 20 },
    ]);
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('does not render its own add-allocation action', () => {
    render(<AllocationSliders initial={baseAllocations} onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /add allocation/i })).not.toBeInTheDocument();
  });

  it('rebalances remaining rows after removing an allocation', () => {
    const onChange = vi.fn();

    render(<AllocationSliders initial={baseAllocations} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Seed' }));

    expect(onChange).toHaveBeenLastCalledWith([{ id: 'series-a', label: 'Series A', pct: 100 }]);
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });
});
