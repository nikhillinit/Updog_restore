import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StageAccordionRow, type StageData } from '@/components/wizard/StageAccordionRow';

const seedStage: StageData = {
  id: 'seed',
  name: 'Seed',
  roundSize: 3.5,
  valuation: 16,
  valuationType: 'Pre',
  esop: 20,
  gradRate: 30,
  monthsToNext: 18,
  exitRate: 10,
};

describe('StageAccordionRow', () => {
  it('toggles expanded details with keyboard activation', () => {
    render(<StageAccordionRow stage={seedStage} onChange={vi.fn()} />);

    const summary = screen.getByRole('button', { name: 'Seed investment stage assumptions' });
    expect(summary).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(summary, { key: 'Enter' });

    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Advanced assumptions')).toBeInTheDocument();

    fireEvent.keyDown(summary, { key: ' ' });

    expect(summary).toHaveAttribute('aria-expanded', 'false');
  });
});
