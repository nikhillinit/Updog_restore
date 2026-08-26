import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryCard } from '@/components/sensitivity/_shared/SummaryCard';

describe('SummaryCard', () => {
  it('renders the label text', () => {
    render(<SummaryCard label="Baseline" value="2.40" />);
    expect(screen.getByText('Baseline')).toBeInTheDocument();
  });

  it('renders the value text', () => {
    render(<SummaryCard label="Baseline" value="2.40" />);
    expect(screen.getByText('2.40')).toBeInTheDocument();
  });

  it('wraps content in a rounded border container', () => {
    const { container } = render(<SummaryCard label="Metric" value="TVPI" />);
    const wrapper = container.firstElementChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass('rounded-lg');
    expect(wrapper).toHaveClass('border');
  });
});
